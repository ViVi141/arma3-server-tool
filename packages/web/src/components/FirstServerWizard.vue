<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import PathInput from "@/components/PathInput.vue";
import { useConnectionsStore } from "@/stores/connections";
import { UI_COPY } from "@/constants/uiCopy";
import type { AutomationCommand } from "@a3st/api-client";
import { pollTaskSucceeded, resolvePollTaskMessage } from "@/utils/taskSteps";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  completed: [uuid: string];
}>();

const store = useConnectionsStore();
const step = ref(0);
const submitting = ref(false);
const writeCfgOnFinish = ref(false);
const ensureSteamCmdOnFinish = ref(true);
const installDedicatedOnFinish = ref(true);

const configName = ref("我的服务器");
const serverDir = ref("");
const hostname = ref("Arma3 Server");
const port = ref(2302);
const maxPlayers = ref(64);
const battlEye = ref(true);
const rconPassword = ref("");
const rconHost = ref("127.0.0.1");
const steamUsername = ref("");
const steamPassword = ref("");
const steamCmdStatusText = ref("未检测");

const STEPS = ["欢迎", "目录", "基本", "安全", "SteamCMD", "完成"];

function resetForm() {
  step.value = 0;
  submitting.value = false;
  writeCfgOnFinish.value = false;
  ensureSteamCmdOnFinish.value = true;
  installDedicatedOnFinish.value = true;
  configName.value = "我的服务器";
  serverDir.value = "";
  hostname.value = "Arma3 Server";
  port.value = 2302;
  maxPlayers.value = 64;
  battlEye.value = true;
  rconPassword.value = "";
  rconHost.value = "127.0.0.1";
  steamUsername.value = "";
  steamPassword.value = "";
  steamCmdStatusText.value = "未检测";
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetForm();
    }
  }
);

watch(step, async (current) => {
  if (current === 4 && props.modelValue) {
    await refreshSteamCmdStatus();
  }
});

function close() {
  emit("update:modelValue", false);
}

function hasNonAsciiPath(path: string): boolean {
  return /[^\x00-\x7F]/.test(path);
}

function needsServerDirForSteamCmd(): boolean {
  return installDedicatedOnFinish.value || writeCfgOnFinish.value;
}

function canNext(): boolean {
  if (step.value === 1) {
    if (!configName.value.trim()) {
      return false;
    }
    if (serverDir.value.trim() && hasNonAsciiPath(serverDir.value.trim())) {
      return false;
    }
  }
  if (step.value === 2) {
    if (!hostname.value.trim()) {
      return false;
    }
    if (port.value < 1024 || port.value > 65535) {
      return false;
    }
  }
  if (step.value === 4) {
    if (needsServerDirForSteamCmd() && !serverDir.value.trim()) {
      return false;
    }
  }
  return true;
}

function nextStep() {
  if (!canNext()) {
    if (step.value === 1 && hasNonAsciiPath(serverDir.value.trim())) {
      ElMessage.warning("服务器目录不能包含中文或非 ASCII 字符");
      return;
    }
    if (step.value === 4 && needsServerDirForSteamCmd() && !serverDir.value.trim()) {
      ElMessage.warning("安装专用服务器或写入游戏配置前须填写服务器目录");
      return;
    }
    ElMessage.warning("请填写必填项");
    return;
  }
  if (step.value < STEPS.length - 1) {
    step.value += 1;
  }
}

function prevStep() {
  if (step.value > 0) {
    step.value -= 1;
  }
}

function generateRconPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  rconPassword.value = pwd;
}

async function refreshSteamCmdStatus() {
  try {
    const client = store.getClient();
    if (!client) {
      steamCmdStatusText.value = "未连接 Service";
      return;
    }
    const res = await client.steamCmdStatus();
    const data = res.data;
    const installed = data.isInstalled ? "已安装" : "未安装";
    const running = data.isRunning ? "运行中" : "空闲";
    steamCmdStatusText.value = `SteamCMD ${installed} · ${running}`;
  } catch {
    steamCmdStatusText.value = "无法检测 SteamCMD 状态";
  }
}

async function runPostSetupTasks(uuid: string, dir: string): Promise<void> {
  const client = store.getClient();
  if (!client) {
    return;
  }

  if (steamUsername.value.trim() || steamPassword.value || dir) {
    const settingsBody: {
      username?: string;
      password?: string;
      serverInstallPath?: string;
    } = {};
    if (steamUsername.value.trim()) {
      settingsBody.username = steamUsername.value.trim();
    }
    if (steamPassword.value) {
      settingsBody.password = steamPassword.value;
    }
    if (dir) {
      settingsBody.serverInstallPath = dir;
    }
    await client.saveSteamCmdSettings(settingsBody);
  }

  const commands: AutomationCommand[] = [];
  if (installDedicatedOnFinish.value && dir) {
    if (writeCfgOnFinish.value) {
      commands.push({ action: "first_server_setup" });
    } else {
      if (ensureSteamCmdOnFinish.value) {
        commands.push({ action: "ensure_steamcmd" });
      }
      commands.push({ action: "install_dedicated_server" });
    }
  } else if (ensureSteamCmdOnFinish.value) {
    commands.push({ action: "ensure_steamcmd" });
  }

  if (commands.length === 0) {
    return;
  }

  const taskRes = await client.submitTask({
    serverUuid: uuid,
    async: true,
    commands,
  });
  const taskId = taskRes.data && "taskId" in taskRes.data ? taskRes.data.taskId : undefined;
  if (!taskId) {
    ElMessage.warning("后台任务已提交，请到 SteamCMD 页查看进度");
    return;
  }

  const isQuickTask = commands.length === 1 && commands[0].action === "ensure_steamcmd";
  if (isQuickTask) {
    const finalTask = await client.pollTask(taskId, 1500, 120000);
    const msg = resolvePollTaskMessage(finalTask as never, "SteamCMD 已就绪");
    if (pollTaskSucceeded(finalTask as never)) {
      ElMessage.success(msg);
    } else {
      ElMessage.warning(msg);
    }
    return;
  }

  ElMessage.info("SteamCMD / 专用服务器任务已在后台运行，请到 SteamCMD 页查看日志（可能需要 Steam Guard）");
}

async function finish() {
  const dir = serverDir.value.trim();
  if (needsServerDirForSteamCmd() && !dir) {
    ElMessage.warning("请填写服务器目录，或取消「安装专用服务器 / 写入游戏配置」");
    return;
  }

  submitting.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      throw new Error("未连接");
    }
    const name = configName.value.trim();
    const createRes = await client.createServer(name, dir.length > 0 ? dir : undefined);
    if (!createRes.success || !createRes.data?.uuid) {
      throw new Error(createRes.error ?? "创建失败");
    }
    const uuid = createRes.data.uuid;

    const shouldWriteCfgInPatch =
      writeCfgOnFinish.value && !(installDedicatedOnFinish.value && dir);

    const patchRes = await client.patchConfig(
      uuid,
      {
        server: {
          configName: name,
          serverDir: dir,
          x64: true,
        },
        basic: {
          hostname: hostname.value.trim(),
          maxPlayers: maxPlayers.value,
          battlEye: battlEye.value,
        },
        startup: {
          port: port.value,
        },
        battleye: {
          rconPassword: rconPassword.value,
          rconPort: port.value,
          rconHost: rconHost.value.trim() || "127.0.0.1",
          bePath: "BattlEye",
        },
      },
      shouldWriteCfgInPatch
    );
    if (!patchRes.success) {
      throw new Error(patchRes.error ?? "保存配置失败");
    }

    await runPostSetupTasks(uuid, dir);

    emit("completed", uuid);
    close();
    ElMessage.success("首服配置已创建");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "创建失败");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="首服向导"
    width="620px"
    destroy-on-close
    data-testid="first-server-wizard"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-steps :active="step" finish-status="success" align-center class="wizard-steps">
      <el-step v-for="label in STEPS" :key="label" :title="label" />
    </el-steps>

    <div v-if="step === 0" class="wizard-body">
      <p class="wizard-lead">按步骤创建第一套服务器配置，可选在同一流程内准备 SteamCMD 与专用服务器文件。</p>
      <ol class="wizard-list">
        <li>填写服务器目录（英文路径）</li>
        <li>配置端口、BattlEye、RCon</li>
        <li>（可选）下载 SteamCMD 并安装 <code>arma3server</code></li>
        <li><strong>{{ UI_COPY.preflight }}</strong> → <strong>启动</strong></li>
      </ol>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="路径要求"
        description="工具目录与 Arma 3 专用服务器目录均须为英文路径，勿含中文。"
      />
    </div>

    <div v-else-if="step === 1" class="wizard-body">
      <el-form label-width="96px" size="small">
        <el-form-item label="配置名称" required>
          <el-input v-model="configName" placeholder="我的服务器" data-testid="wizard-config-name" />
        </el-form-item>
        <el-form-item label="服务器目录">
          <PathInput
            v-model="serverDir"
            mode="directory"
            placeholder="如 D:\Games\Arma3Server"
          />
        </el-form-item>
      </el-form>
      <p class="wizard-hint">专用服务器游戏目录，存放 arma3server、server.cfg、任务等，不是 Workshop 模组目录。</p>
    </div>

    <div v-else-if="step === 2" class="wizard-body">
      <el-form label-width="96px" size="small">
        <el-form-item label="服务器名" required>
          <el-input v-model="hostname" placeholder="Arma3 Server" />
        </el-form-item>
        <el-form-item label="游戏端口" required>
          <el-input-number v-model="port" :min="1024" :max="65535" controls-position="right" />
        </el-form-item>
        <el-form-item label="最大玩家">
          <el-input-number v-model="maxPlayers" :min="2" :max="200" controls-position="right" />
        </el-form-item>
      </el-form>
    </div>

    <div v-else-if="step === 3" class="wizard-body">
      <el-form label-width="96px" size="small">
        <el-form-item label="BattlEye">
          <el-switch v-model="battlEye" />
        </el-form-item>
        <el-form-item label="RCon 密码">
          <div class="rcon-row">
            <el-input v-model="rconPassword" type="password" show-password placeholder="建议设置" />
            <el-button size="small" @click="generateRconPassword">随机生成</el-button>
          </div>
        </el-form-item>
        <el-form-item label="RCon 地址">
          <el-input v-model="rconHost" placeholder="127.0.0.1" />
        </el-form-item>
      </el-form>
      <p class="wizard-hint">RCon 端口默认与游戏端口相同（{{ port }}）。远程控制页可后续修改。</p>
    </div>

    <div v-else-if="step === 4" class="wizard-body" data-testid="wizard-steamcmd-step">
      <p class="wizard-status">{{ steamCmdStatusText }}</p>
      <el-form label-width="108px" size="small">
        <el-form-item label="Steam 账号">
          <el-input v-model="steamUsername" placeholder="安装/更新专用服务器时需要" />
        </el-form-item>
        <el-form-item label="Steam 密码">
          <el-input v-model="steamPassword" type="password" show-password placeholder="可选，保存后不会回显" />
        </el-form-item>
      </el-form>
      <div class="wizard-checks">
        <el-checkbox v-model="ensureSteamCmdOnFinish" :disabled="installDedicatedOnFinish" data-testid="wizard-opt-ensure-steamcmd">
          完成后下载 SteamCMD（若未安装）
        </el-checkbox>
        <el-checkbox v-model="installDedicatedOnFinish" data-testid="wizard-opt-install-dedicated">
          完成后安装/更新专用服务器（需已填服务器目录）
        </el-checkbox>
        <el-checkbox v-model="writeCfgOnFinish" data-testid="wizard-opt-write-cfg">
          完成后 {{ UI_COPY.writeGameCfg }}
        </el-checkbox>
      </div>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="Steam Guard"
        description="若任务失败，请到控制台 SteamCMD 页查看日志，或在有窗口模式下完成一次登录。"
        style="margin-top: 12px;"
      />
    </div>

    <div v-else class="wizard-body">
      <p class="wizard-lead">即将创建配置包：</p>
      <dl class="wizard-summary">
        <dt>名称</dt><dd>{{ configName.trim() }}</dd>
        <dt>目录</dt><dd>{{ serverDir.trim() || "（未填写）" }}</dd>
        <dt>主机名</dt><dd>{{ hostname.trim() }}</dd>
        <dt>端口</dt><dd>{{ port }}</dd>
        <dt>SteamCMD</dt>
        <dd>
          <span v-if="installDedicatedOnFinish">安装专用服务器</span>
          <span v-else-if="ensureSteamCmdOnFinish">仅下载 SteamCMD</span>
          <span v-else>跳过</span>
        </dd>
        <dt>写 cfg</dt><dd>{{ writeCfgOnFinish ? "是" : "否" }}</dd>
      </dl>
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button v-if="step > 0" @click="prevStep">上一步</el-button>
      <el-button v-if="step < STEPS.length - 1" type="primary" data-testid="wizard-next" @click="nextStep">
        下一步
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="submitting"
        data-testid="wizard-finish"
        @click="finish"
      >
        完成创建
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wizard-steps {
  margin-bottom: 20px;
}

.wizard-body {
  min-height: 200px;
}

.wizard-lead {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--a3st-text);
}

.wizard-list {
  margin: 0 0 16px 20px;
  padding: 0;
  font-size: 13px;
  line-height: 1.7;
}

.wizard-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--a3st-text-dim);
}

.wizard-status {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--a3st-text-muted);
}

.wizard-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.rcon-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.rcon-row .el-input {
  flex: 1;
}

.wizard-summary {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 6px 12px;
  margin: 0 0 16px;
  font-size: 13px;
}

.wizard-summary dt {
  color: var(--a3st-text-dim);
  text-align: right;
}

.wizard-summary dd {
  margin: 0;
  word-break: break-all;
}
</style>
