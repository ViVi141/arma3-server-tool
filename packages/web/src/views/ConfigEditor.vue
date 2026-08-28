<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import PathInput from "@/components/PathInput.vue";
import { UI_COPY } from "@/constants/uiCopy";
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { asConfigString } from "@/utils/configStringField";
import { resolveTaskMessage, taskSucceeded } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const rawConfig = ref<Record<string, unknown>>({});
const loading = ref(false);
const saving = ref(false);

const sections = computed(() => ({
  server: (rawConfig.value.server ?? {}) as Record<string, unknown>,
  startup: (rawConfig.value.startup ?? {}) as Record<string, unknown>,
  basic: (rawConfig.value.basic ?? {}) as Record<string, unknown>,
  battleye: (rawConfig.value.battleye ?? {}) as Record<string, unknown>,
  mods: (rawConfig.value.mods ?? {}) as Record<string, unknown>,
  scheduler: (rawConfig.value.scheduler ?? {}) as Record<string, unknown>,
}));

onMounted(loadConfig);

async function loadConfig() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      rawConfig.value = res.data as Record<string, unknown>;
    }
  } finally {
    loading.value = false;
  }
}

async function saveSection(section: string) {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const patch: Record<string, unknown> = {};
    patch[section] = sections.value[section as keyof typeof sections.value];
    await client.patchConfig(props.serverUuid, patch as never);
    ElMessage.success("已保存");
    await loadConfig();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

async function execAction(action: string) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
    const msg = resolveTaskMessage(res.data as never, `${action} 完成`);
    if (taskSucceeded(res.data as never)) {
      ElMessage.success(msg);
    } else {
      ElMessage.warning(msg);
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "执行失败");
  }
}
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <template #toolbar>
      <el-button size="small" type="primary" @click="execAction('write_cfg')">{{ UI_COPY.writeGameCfg }}</el-button>
      <el-button size="small" @click="execAction('save')">{{ UI_COPY.saveShort }}</el-button>
      <el-button size="small" @click="loadConfig">刷新</el-button>
    </template>
    <SettingsViewLayout kicker="CONFIG / RAW" title="高级编辑">
    <ArkTechPanel title="基本" code="RAW-01">
      <div class="form-row"><label>配置名称</label><el-input v-model="sections.server.configName" size="small" /></div>
      <div class="form-row"><label>服务器目录</label><PathInput :model-value="asConfigString(sections.server.serverDir)" mode="directory" @update:model-value="(v) => { sections.server.serverDir = v }" /></div>
      <div class="form-row"><label>可执行文件</label><PathInput :model-value="asConfigString(sections.server.executable)" mode="file" :file-filters="[{ name: '可执行文件', extensions: ['exe'] }]" @update:model-value="(v) => { sections.server.executable = v }" /></div>
    </ArkTechPanel>

    <ArkTechPanel title="启动参数" code="RAW-02">
      <div class="form-row"><label>参数</label><el-input v-model="sections.startup.parameters" type="textarea" :rows="2" size="small" /></div>
      <div class="form-row"><label>CPU 核心</label><el-input-number v-model="sections.startup.cpuCount" :min="0" size="small" controls-position="right" /></div>
      <div class="form-row"><label>最大内存(MB)</label><el-input-number v-model="sections.startup.maxMem" :min="0" :step="512" size="small" controls-position="right" /></div>
      <div class="form-row"><label>帧率上限</label><el-input-number v-model="sections.startup.limitFps" :min="1" :max="1000" size="small" controls-position="right" /></div>
      <div class="form-row"><label>视距</label><el-input-number v-model="sections.startup.viewDistance" :min="200" :step="100" size="small" controls-position="right" /></div>
      <div class="form-row"><label>端口</label><el-input-number v-model="sections.startup.port" :min="1024" :max="65535" size="small" controls-position="right" /></div>
      <div class="form-row"><label>崩溃重启</label><el-switch v-model="sections.startup.restartOnCrash" size="small" /></div>
      <el-button size="small" @click="saveSection('startup')">保存启动参数</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="服务器设置">
      <div class="form-row"><label>服务器名</label><el-input v-model="sections.basic.hostname" size="small" /></div>
      <div class="form-row"><label>最大玩家</label><el-input-number v-model="sections.basic.maxPlayers" :min="1" :max="128" size="small" controls-position="right" /></div>
      <div class="form-row"><label>密码</label><el-input v-model="sections.basic.password" type="password" show-password size="small" /></div>
      <div class="form-row"><label>管理员密码</label><el-input v-model="sections.basic.passwordAdmin" type="password" show-password size="small" /></div>
      <el-button size="small" @click="saveSection('basic')">保存服务器设置</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="BattlEye / RCon" code="RAW-03">
      <div class="form-row"><label>RCon 端口</label><el-input-number v-model="sections.battleye.rconPort" :min="1024" :max="65535" size="small" controls-position="right" /></div>
      <div class="form-row"><label>RCon 密码</label><el-input v-model="sections.battleye.rconPassword" type="password" show-password size="small" /></div>
      <div class="form-row"><label>RCon 地址</label><el-input v-model="sections.battleye.rconHost" size="small" /></div>
      <el-button size="small" @click="saveSection('battleye')">保存 BE 设置</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="模组配置">
      <div class="form-row"><label>已启用 IDs</label><el-input v-model="sections.mods.enabledIds" size="small" /></div>
      <div class="form-row"><label>服务器模组 IDs</label><el-input v-model="sections.mods.serverModIds" size="small" /></div>
      <el-button size="small" @click="saveSection('mods')">保存模组设置</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="定时任务" code="RAW-04">
      <div class="form-row"><label>重启 cron</label><el-input v-model="sections.scheduler.restartCron" size="small" placeholder="0 4 * * *" /></div>
      <el-button size="small" @click="saveSection('scheduler')">保存</el-button>
    </ArkTechPanel>

    <ArkTechPanel title="原始 JSON">
      <pre class="config-raw">{{ JSON.stringify(rawConfig, null, 2) }}</pre>
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 100px; }
.form-row .el-input,
.form-row .path-input { flex: 1; min-width: 0; }
.config-raw {
  font-size: 11px;
  white-space: pre-wrap;
  background: var(--el-fill-color-light);
  padding: 8px;
  border-radius: 2px;
  margin: 0;
}
</style>
