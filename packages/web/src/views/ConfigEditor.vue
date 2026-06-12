<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

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
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) rawConfig.value = res.data as Record<string, unknown>;
  } finally { loading.value = false; }
}

async function saveSection(section: string) {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const patch: Record<string, unknown> = {};
    patch[section] = sections.value[section as keyof typeof sections.value];
    await client.patchConfig(props.serverUuid, patch as never);
    ElMessage.success(`已保存`);
    await loadConfig();
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); }
  finally { saving.value = false; }
}

async function execAction(action: string) {
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
    ElMessage.success(`${action} 执行成功`);
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "执行失败"); }
}
</script>

<template>
  <ConsolePageLayout v-loading="loading">
    <template #toolbar>
      <el-button size="small" type="primary" @click="execAction('write_cfg')">写入服务器</el-button>
      <el-button size="small" @click="execAction('save')">保存</el-button>
      <el-button size="small" @click="loadConfig">刷新</el-button>
    </template>
      <!-- 基本 -->
      <fieldset><legend>基本</legend>
        <div class="field-row"><label>配置名称</label><el-input v-model="sections.server.configName" size="small" /></div>
        <div class="field-row"><label>服务器目录</label><el-input v-model="sections.server.serverDir" size="small" /></div>
        <div class="field-row"><label>可执行文件</label><el-input v-model="sections.server.executable" size="small" /></div>
      </fieldset>

      <!-- 启动参数 -->
      <fieldset><legend>启动参数</legend>
        <div class="field-row"><label>参数</label><el-input v-model="sections.startup.parameters" type="textarea" :rows="2" size="small" /></div>
        <div class="field-row"><label>CPU 核心</label><el-input-number v-model="sections.startup.cpuCount" :min="0" size="small" controls-position="right" /></div>
        <div class="field-row"><label>最大内存(MB)</label><el-input-number v-model="sections.startup.maxMem" :min="0" :step="512" size="small" controls-position="right" /></div>
        <div class="field-row"><label>帧率上限</label><el-input-number v-model="sections.startup.limitFps" :min="1" :max="1000" size="small" controls-position="right" /></div>
        <div class="field-row"><label>视距</label><el-input-number v-model="sections.startup.viewDistance" :min="200" :step="100" size="small" controls-position="right" /></div>
        <div class="field-row"><label>崩溃重启</label><el-switch v-model="sections.startup.restartOnCrash" size="small" /></div>
        <el-button size="small" @click="saveSection('startup')">保存启动参数</el-button>
      </fieldset>

      <!-- 服务器设置 -->
      <fieldset><legend>服务器设置</legend>
        <div class="field-row"><label>服务器名</label><el-input v-model="sections.basic.hostname" size="small" /></div>
        <div class="field-row"><label>最大玩家</label><el-input-number v-model="sections.basic.maxPlayers" :min="1" :max="128" size="small" controls-position="right" /></div>
        <div class="field-row"><label>端口</label><el-input-number v-model="sections.basic.port" :min="1024" :max="65535" size="small" controls-position="right" /></div>
        <div class="field-row"><label>密码</label><el-input v-model="sections.basic.password" type="password" show-password size="small" /></div>
        <div class="field-row"><label>管理员密码</label><el-input v-model="sections.basic.passwordAdmin" type="password" show-password size="small" /></div>
        <el-button size="small" @click="saveSection('basic')">保存服务器设置</el-button>
      </fieldset>

      <!-- BattlEye -->
      <fieldset><legend>BattlEye / RCon</legend>
        <div class="field-row"><label>RCon 端口</label><el-input-number v-model="sections.battleye.rconPort" :min="1024" :max="65535" size="small" controls-position="right" /></div>
        <div class="field-row"><label>RCon 密码</label><el-input v-model="sections.battleye.rconPassword" type="password" show-password size="small" /></div>
        <div class="field-row"><label>RCon 地址</label><el-input v-model="sections.battleye.rconHost" size="small" /></div>
        <el-button size="small" @click="saveSection('battleye')">保存 BE 设置</el-button>
      </fieldset>

      <!-- 模组 -->
      <fieldset><legend>模组配置</legend>
        <div class="field-row"><label>已启用 IDs</label><el-input v-model="sections.mods.enabledIds" size="small" /></div>
        <div class="field-row"><label>服务器模组 IDs</label><el-input v-model="sections.mods.serverModIds" size="small" /></div>
        <el-button size="small" @click="saveSection('mods')">保存模组设置</el-button>
      </fieldset>

      <!-- 定时 -->
      <fieldset><legend>定时任务</legend>
        <div class="field-row"><label>重启 cron</label><el-input v-model="sections.scheduler.restartCron" size="small" placeholder="0 4 * * *" /></div>
        <el-button size="small" @click="saveSection('scheduler')">保存</el-button>
      </fieldset>

      <!-- 原始 JSON -->
      <fieldset><legend>原始 JSON</legend>
        <pre class="raw">{{ JSON.stringify(rawConfig, null, 2) }}</pre>
      </fieldset>
  </ConsolePageLayout>
</template>

<style scoped>
fieldset { border: 1px solid var(--el-border-color-light); padding: 8px 12px; margin-bottom: 8px; }
legend { font-size: 12px; font-weight: 600; padding: 0 4px; }
.field-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.field-row label { width: 100px; font-size: 12px; color: var(--el-text-color-secondary); flex-shrink: 0; text-align: right; }
.field-row .el-input { flex: 1; }
.raw { font-size: 11px; white-space: pre-wrap; background: var(--el-fill-color-light); padding: 8px; border-radius: 2px; margin: 0; }
</style>
