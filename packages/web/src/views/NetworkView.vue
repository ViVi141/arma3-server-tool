<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "网络", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
</script>

<template>
  <ConsolePageLayout v-loading="loading">
    <ArkTechPanel title="basic.cfg 网络参数" code="NET-01">
      <div class="form-row"><label>MaxMsgSend</label><el-input-number v-model="b().maxMsgSend" :min="64" :max="512" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MaxSizeGuaranteed</label><el-input-number v-model="b().maxSizeGuaranteed" :min="128" :max="1024" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MaxSizeNonguaranteed</label><el-input-number v-model="b().maxSizeNonguaranteed" :min="64" :max="512" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MinBandwidth</label><el-input-number v-model="b().minBandwidth" :min="16384" :max="1048576" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MaxBandwidth</label><el-input-number v-model="b().maxBandwidth" :min="131072" :max="10485760" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MinErrorToSend</label><el-input-number v-model="b().minErrorToSend" :min="0" :max="1" :step="0.001" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MinErrorToSendNear</label><el-input-number v-model="b().minErrorToSendNear" :min="0" :max="1" :step="0.001" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MaxPacketSize</label><el-input-number v-model="b().maxPacketSize" :min="500" :max="2000" size="small" controls-position="right"/></div>
      <div class="form-row"><label>MaxCustomFileSize</label><el-input-number v-model="b().maxCustomFileSize" :min="0" :max="100" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="超时 / 限制" code="NET-02">
      <div class="form-row"><label>断线超时(秒)</label><el-input-number v-model="b().disconnectTimeout" :min="0" :max="600" size="small" controls-position="right"/></div>
      <div class="form-row"><label>最大 Desync</label><el-input-number v-model="b().maxDesync" :min="50" :max="500" size="small" controls-position="right"/></div>
      <div class="form-row"><label>最大 Ping</label><el-input-number v-model="b().maxPing" :min="50" :max="500" size="small" controls-position="right"/></div>
      <div class="form-row"><label>最大丢包</label><el-input-number v-model="b().maxPacketLoss" :min="0" :max="50" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="开关">
      <div class="form-row"><label>UPnP</label><el-switch v-model="b().upnp" size="small"/></div>
      <div class="form-row"><label>Loopback</label><el-switch v-model="b().loopback" size="small"/></div>
      <div class="form-row"><label>带宽算法</label><el-switch v-model="b().bandwidthAlg" size="small"/></div>
    </ArkTechPanel>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 160px; }
</style>
