<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import TerminalOutput from "@/components/TerminalOutput.vue";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const baseUrl = ref(store.active?.baseUrl ?? "");

const activeTab = ref("basic");
const rawConfig = ref<Record<string, unknown>>({});
const loading = ref(false);
const saving = ref(false);

// Editable fields
const sections = computed(() => ({
  server: (rawConfig.value.server ?? {}) as Record<string, unknown>,
  startup: (rawConfig.value.startup ?? {}) as Record<string, unknown>,
  basic: (rawConfig.value.basic ?? {}) as Record<string, unknown>,
  battleye: (rawConfig.value.battleye ?? {}) as Record<string, unknown>,
  mods: (rawConfig.value.mods ?? {}) as Record<string, unknown>,
  tasks: (rawConfig.value.tasks ?? {}) as Record<string, unknown>,
  monitoring: (rawConfig.value.monitoring ?? {}) as Record<string, unknown>,
  scheduler: (rawConfig.value.scheduler ?? {}) as Record<string, unknown>,
}));

onMounted(loadConfig);

async function loadConfig() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) rawConfig.value = res.data as Record<string, unknown>;
  } finally { loading.value = false; }
}

async function writeCfg() {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "write_cfg" as const }] });
    ElMessage.success("配置已写入服务器目录");
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "写入失败"); }
  finally { saving.value = false; }
}

async function saveSection(section: string) {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const patch: Record<string, unknown> = {};
    patch[section] = sections.value[section as keyof typeof sections.value];
    await client.patchConfig(props.serverUuid, patch as never);
    ElMessage.success(`${section} 已保存`);
    await loadConfig();
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); }
  finally { saving.value = false; }
}

async function doAction(action: string) {
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
    ElMessage.success(`${action} 执行成功`);
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "执行失败"); }
}

const newMission = ref({ template: "", difficulty: 3 });
async function addMission() {
  if (!newMission.value.template) return;
  const list = (sections.value.missions as unknown[] ?? []) as { template: string; difficulty?: number }[];
  list.push({ ...newMission.value });
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.patchConfig(props.serverUuid, { missions: list } as never);
    newMission.value = { template: "", difficulty: 3 };
    await loadConfig();
    ElMessage.success("任务已添加");
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "添加失败"); }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="config-page">
    <h2>服务器配置</h2>

    <div style="margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button type="primary" :loading="saving" @click="writeCfg">写入服务器目录</el-button>
      <el-button @click="doAction('save')">保存配置包</el-button>
      <el-button @click="doAction('preflight')">开服体检</el-button>
      <el-button @click="loadConfig">刷新</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="基本" name="basic">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="配置名称">
            <el-input v-model="sections.server.configName" />
          </el-form-item>
          <el-form-item label="服务器目录">
            <el-input v-model="sections.server.serverDir" placeholder="C:\arma3" />
          </el-form-item>
          <el-form-item label="可执行文件">
            <el-input v-model="sections.server.executable" placeholder="arma3server_x64.exe" />
          </el-form-item>
          <el-form-item label="模组目录">
            <el-input v-model="sections.server.modDir" placeholder="可留空使用默认" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('server')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="启动参数" name="startup">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="启动参数">
            <el-input v-model="sections.startup.parameters" type="textarea" :rows="3" placeholder="-world=empty -cpuCount=4" />
          </el-form-item>
          <el-form-item label="崩溃重启">
            <el-switch v-model="sections.startup.restartOnCrash" />
          </el-form-item>
          <el-form-item label="延迟启动(秒)">
            <el-input-number v-model="sections.startup.startupDelay" :min="0" :max="60" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('startup')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="服务器设置" name="basic_settings">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="服务器名称">
            <el-input v-model="sections.basic.hostname" placeholder="My Arma3 Server" />
          </el-form-item>
          <el-form-item label="最大玩家">
            <el-input-number v-model="sections.basic.maxPlayers" :min="1" :max="128" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="sections.basic.password" type="password" show-password />
          </el-form-item>
          <el-form-item label="管理员密码">
            <el-input v-model="sections.basic.passwordAdmin" type="password" show-password />
          </el-form-item>
          <el-form-item label="BattlEye">
            <el-switch v-model="sections.basic.battlEye" />
          </el-form-item>
          <el-form-item label="签名验证">
            <el-select v-model="sections.basic.verifySignatures">
              <el-option :value="0" label="关闭" />
              <el-option :value="1" label="警告" />
              <el-option :value="2" label="禁止" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('basic')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="BattlEye" name="battleye">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="RCon 端口">
            <el-input-number v-model="sections.battleye.rconPort" :min="1024" :max="65535" />
          </el-form-item>
          <el-form-item label="RCon 密码">
            <el-input v-model="sections.battleye.rconPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="RCon 地址">
            <el-input v-model="sections.battleye.rconHost" placeholder="127.0.0.1" />
          </el-form-item>
          <el-form-item label="BE 路径">
            <el-input v-model="sections.battleye.bePath" placeholder="BattlEye" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('battleye')">保存</el-button>
          </el-form-item>
        </el-form>

        <el-divider />
        <h4>RCon 快捷操作</h4>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
          <el-button size="small" @click="doAction('rcon_players')">查询玩家</el-button>
          <el-button size="small" @click="doAction('rcon_lock')">锁服</el-button>
          <el-button size="small" @click="doAction('rcon_unlock')">解锁</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="模组" name="mods_config">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="已启用 ID">
            <el-input v-model="sections.mods.enabledIds" type="textarea" :rows="3"
              placeholder="450814997, 463939057" />
          </el-form-item>
          <el-form-item label="服务器模组">
            <el-input v-model="sections.mods.serverModIds" type="textarea" :rows="3"
              placeholder="450814997" />
          </el-form-item>
          <el-form-item label="自动 Bikey">
            <el-switch v-model="sections.mods.autoCopyBikey" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('mods')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="任务" name="missions">
        <div v-loading="loading">
          <el-table v-if="sections.missions?.length" :data="sections.missions" stripe size="small">
            <el-table-column prop="template" label="模板" />
            <el-table-column prop="difficulty" label="难度" width="80" />
          </el-table>
          <el-empty v-else description="无任务配置" />
          <el-divider />
          <h4>添加任务</h4>
          <el-form :inline="true" style="margin-top: 8px;">
            <el-form-item label="模板">
              <el-input v-model="newMission.template" placeholder="coop_01.Altis" />
            </el-form-item>
            <el-form-item label="难度">
              <el-input-number v-model="newMission.difficulty" :min="0" :max="5" />
            </el-form-item>
            <el-form-item>
              <el-button :loading="saving" @click="addMission">添加</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="定时任务" name="scheduler">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="定时重启">
            <el-input v-model="sections.scheduler.restartCron" placeholder="0 4 * * *" />
          </el-form-item>
          <el-form-item label="监控采集">
            <el-input v-model="sections.scheduler.monitoringCron" placeholder="*/5 * * * *" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('scheduler')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="原始 JSON" name="raw">
        <pre class="config-json">{{ JSON.stringify(rawConfig, null, 2) }}</pre>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.config-json {
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 500px;
  overflow-y: auto;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
}
</style>
