<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { AutomationCommand, AsyncTaskResponse } from "@a3st/api-client";
import TerminalOutput from "@/components/TerminalOutput.vue";
import PathInput from "@/components/PathInput.vue";
import { pollTaskSucceeded, pollTaskCancelled, resolvePollTaskMessage } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const steamUser = ref("");
const steamPwd = ref("");
const loginMode = ref<"cached" | "password">("password");
const workshopRoot = ref("");
const serverInstallPath = ref("");
const statusText = ref("安装: - · 运行: -");
const authStateText = ref("");
const taskStatus = ref("");
const workshopCount = ref("-");
const currentServerDir = ref("");
const busy = ref(false);
const activeTaskId = ref("");
const cancelling = ref(false);

const baseUrl = computed(() => store.active?.baseUrl ?? "");
const apiToken = computed(() => store.active?.token ?? "");

onMounted(() => {
  loadStatus();
  loadConfig();
  loadSteamCmdSettings();
});

async function loadSteamCmdSettings() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getSteamCmdSettings();
    if (!res.success) {
      return;
    }
    const data = res.data;
    workshopRoot.value = data.workshopRoot ?? "";
    if (data.serverInstallPath) {
      serverInstallPath.value = data.serverInstallPath;
    }
    steamUser.value = data.username ?? "";
    loginMode.value = data.loginMode === "cached" ? "cached" : "password";
    workshopCount.value = String(data.workshopModCount ?? 0);
  } catch {
    /* ignore */
  }
}

async function saveSteamCmdSettings() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const body: {
      workshopRoot: string;
      serverInstallPath: string;
      username?: string;
      password?: string;
      loginMode: "cached" | "password";
    } = {
      workshopRoot: workshopRoot.value.trim(),
      serverInstallPath: serverInstallPath.value.trim(),
      loginMode: loginMode.value,
    };
    if (steamUser.value.trim()) {
      body.username = steamUser.value.trim();
    }
    if (steamPwd.value) {
      body.password = steamPwd.value;
    }
    const res = await client.saveSteamCmdSettings(body);
    if (!res.success) {
      throw new Error(res.error ?? "保存失败");
    }
    workshopCount.value = String(res.data.workshopModCount ?? 0);
    steamPwd.value = "";
    ElMessage.success("SteamCMD 设置已保存");
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  }
}

async function loadConfig() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = res.data as Record<string, unknown>;
      currentServerDir.value = ((cfg.server as Record<string, unknown>)?.serverDir as string) ?? "-";
      serverInstallPath.value = currentServerDir.value;
    }
  } catch {
    /* ignore */
  }
}

async function submitAsyncTask(commands: AutomationCommand[], label: string) {
  const client = store.getClient();
  if (!client) {
    return;
  }

  busy.value = true;
  taskStatus.value = `${label}：已提交…`;
  try {
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      async: true,
      commands,
    });
    const taskId = (res.data as AsyncTaskResponse).taskId;
    if (!taskId) {
      ElMessage.warning("未收到任务 ID");
      return;
    }
    activeTaskId.value = taskId;

    const finalTask = await client.pollTask(taskId, 2000, 900000);
    const msg = resolvePollTaskMessage(finalTask as never, `${label} 完成`);
    if (pollTaskCancelled(finalTask as never)) {
      taskStatus.value = `${label}：已取消`;
      ElMessage.info(msg);
    } else if (pollTaskSucceeded(finalTask as never)) {
      taskStatus.value = `${label}：${msg}`;
      ElMessage.success(msg);
    } else {
      taskStatus.value = `${label}：失败`;
      ElMessage.error(msg);
    }
  } catch (e) {
    taskStatus.value = `${label}：失败`;
    ElMessage.error(e instanceof Error ? e.message : "任务失败");
  } finally {
    busy.value = false;
    activeTaskId.value = "";
    await checkSteamCmd();
  }
}

async function installOrUpdateServer() {
  await submitAsyncTask([{ action: "update_server" }], "安装/更新服务器");
}

async function checkSteamCmd() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.steamCmdStatus();
    const data = res.data;
    let installed = "否";
    if (data.isInstalled) {
      installed = "是";
    }
    let running = "否";
    if (data.isRunning) {
      running = "是";
    }
    let aborted = "";
    if (data.isAborted) {
      aborted = " · 已取消";
    }
    const mode = data.loginMode === "cached" ? "缓存" : "密码";
    const auth = data.authState ?? "idle";
    authStateText.value = `登录模式: ${mode} · 认证状态: ${auth}`;
    statusText.value = `安装: ${installed} · 运行: ${running}${aborted}`;
  } catch {
    statusText.value = "安装: - · 运行: -";
    authStateText.value = "";
  }
}

async function saveCredentials() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    if (loginMode.value === "password" && !steamPwd.value) {
      ElMessage.warning("密码登录模式需要填写密码，或改用缓存登录");
      return;
    }
    await client.postRaw("/api/v1/steamcmd/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: steamUser.value,
        password: steamPwd.value,
        loginMode: loginMode.value,
      }),
    });
    ElMessage.success(
      loginMode.value === "cached" ? "凭据已保存（缓存登录）" : "凭据已保存",
    );
    // 密码交给服务端保管后立刻清空输入框：界面/内存里都不再保留明文，
    // 后续保存也不会把回显的密码再写回配置。
    steamPwd.value = "";
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  }
}

async function loadStatus() {
  await checkSteamCmd();
}

async function stopSteamCmd() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    cancelling.value = true;
    if (activeTaskId.value) {
      try {
        await client.cancelTask(activeTaskId.value);
      } catch {
        /* stopSteamCmd 仍会 abort 并取消全部 Running 任务 */
      }
    }
    const res = await client.stopSteamCmd();
    const msg = res.data?.message ?? "已取消 SteamCMD 操作，将不再重试";
    statusText.value = msg;
    taskStatus.value = "操作已取消（不再重试）";
    ElMessage.success(msg);
    await checkSteamCmd();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "取消失败");
  } finally {
    cancelling.value = false;
  }
}
</script>

<template>
  <ConsolePageLayout :padded="false">
    <template #toolbar>
      <el-button size="small" type="primary" :loading="busy" @click="installOrUpdateServer">安装/更新服务器</el-button>
      <el-button
        size="small"
        type="danger"
        style="margin-left: auto;"
        :loading="cancelling"
        :disabled="cancelling"
        @click="stopSteamCmd"
      >
        取消当前操作（不再重试）
      </el-button>
      <el-button size="small" @click="checkSteamCmd">刷新状态</el-button>
    </template>
    <template #hint>
      <span>通过 SteamCMD 下载/更新专用服务器与模组；下载失败会自动重试，可随时取消并立即停止重试。</span>
      <span v-if="taskStatus" class="task-hint">{{ taskStatus }}</span>
    </template>

    <SettingsViewLayout kicker="WORKSHOP / 03 · STM" title="SteamCMD">
    <ArkTechPanel title="Steam 账号" code="STM-01">
      <div class="form-row"><label>用户名</label><el-input v-model="steamUser" size="small"/></div>
      <div class="form-row"><label>登录模式</label>
        <el-radio-group v-model="loginMode" size="small">
          <el-radio-button value="cached">优先缓存</el-radio-button>
          <el-radio-button value="password">用户名密码</el-radio-button>
        </el-radio-group>
      </div>
      <div class="form-row"><label>密码</label><el-input v-model="steamPwd" type="password" size="small" show-password :disabled="loginMode === 'cached'" :placeholder="loginMode === 'cached' ? '缓存模式不传密码' : ''"/></div>
      <p class="panel-note">缓存模式只向 SteamCMD 传用户名，依赖本机 config/config.vdf；需手机确认时不会自动重试。</p>
      <el-button size="small" @click="saveCredentials">保存凭据</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="路径" code="STM-02">
      <div class="form-row"><label>Workshop 根</label><PathInput v-model="workshopRoot" mode="directory" placeholder="留空使用默认"/></div>
      <div class="form-row"><label>服务器安装</label><PathInput v-model="serverInstallPath" mode="directory" placeholder="从基本配置读取"/></div>
      <div class="form-row"><label>Workshop 内容</label><span class="hint">{{ workshopCount }} 个模组</span></div>
      <div class="form-row"><label>SteamCMD 状态</label><span class="hint">{{ statusText }}</span></div>
      <div v-if="authStateText" class="form-row"><label>认证</label><span class="hint">{{ authStateText }}</span></div>
      <el-button size="small" type="primary" @click="saveSteamCmdSettings">保存设置</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="当前服务器">
      <div class="form-row"><label>服务器目录</label><span class="hint">{{ currentServerDir }}</span></div>
    </ArkTechPanel>

    <ArkTechPanel title="输出流" code="STM-03">
      <p class="panel-note">SteamCMD 后台运行 + console_log 实时同步</p>
      <TerminalOutput url="/api/v1/steamcmd/stream" :base-url="baseUrl" :token="apiToken" />
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 120px; }
.hint { font-size: 13px; color: var(--el-text-color-secondary); }
.task-hint { display: block; margin-top: 4px; color: var(--el-text-color-secondary); }
.panel-note { margin: 0 0 8px; font-size: 12px; color: var(--a3st-text-muted); }
</style>
