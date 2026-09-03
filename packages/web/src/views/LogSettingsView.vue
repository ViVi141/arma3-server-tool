<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading, saving, save } = useSettingsPage(props.serverUuid, "日志", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <SettingsViewLayout
      kicker="CONFIG / 05 · LOG"
      title="日志"
      :show-save="true"
      :saving="saving"
      @save="save"
    >
    <ArkTechPanel title="日志选项" code="LOG-01">
      <div class="form-row"><label>禁用 RPT (-noLogs)</label><el-switch v-model="b().noLogs" size="small"/></div>
      <div class="form-row"><label>网络日志 (-netlog)</label><el-switch v-model="b().netLog" size="small"/></div>
      <div class="form-row"><label>日志文件</label><el-input v-model="b().logFile" placeholder="server_console.log" size="small"/></div>
      <div class="form-row"><label>时间戳格式</label><el-select v-model="b().timeStampFormat" size="small"><el-option :value="0" label="无"/><el-option :value="1" label="简短"/><el-option :value="2" label="完整"/></el-select></div>
      <div class="form-row"><label>扩展调用上限</label><el-input-number v-model="b().callExtReportLimit" :min="1" :max="60000" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 120px; }
</style>
