<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";
const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "日志", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
</script>
<template><ConsolePageLayout v-loading="loading">
<fieldset><legend>日志选项</legend>
<div class="row"><label>禁用 RPT (-noLogs)</label><el-switch v-model="b().noLogs" size="small"/></div>
<div class="row"><label>网络日志 (-netlog)</label><el-switch v-model="b().netLog" size="small"/></div>
<div class="row"><label>日志文件</label><el-input v-model="b().logFile" placeholder="server_console.log" size="small"/></div>
<div class="row"><label>时间戳格式</label><el-select v-model="b().timeStampFormat" size="small"><el-option :value="0" label="无"/><el-option :value="1" label="简短"/><el-option :value="2" label="完整"/></el-select></div>
<div class="row"><label>扩展调用上限</label><el-input-number v-model="b().callExtReportLimit" :min="1" :max="60000" size="small" controls-position="right"/></div>
</fieldset>
</ConsolePageLayout>
</template>
<style scoped>fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}legend{font-size:12px;font-weight:600;padding:0 4px}.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.row label{width:120px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}</style>
