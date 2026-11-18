<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading, saving, save, resetAll } = useSettingsPage(() => props.serverUuid, "网络", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <SettingsViewLayout
      kicker="CONFIG / 05 · NET"
      title="网络"
      :show-save="true"
      :allow-reset="true"
      @reset="resetAll"
      :saving="saving"
      @save="save"
    >
    <ArkTechPanel title="basic.cfg 网络参数" code="NET-01">
      <p class="form-hint">
        以下几项写入 basic.cfg（网络调优）：带宽单位是 bps，尺寸单位是字节。不确定时保持默认——
        调得过激进会同时增加延迟与 CPU 占用。
      </p>
      <div class="form-row">
        <label>每帧聚合包数上限（MaxMsgSend）</label>
        <el-input-number v-model="b().maxMsgSend" :min="64" :max="512" size="small" controls-position="right"/>
        <p class="form-hint">默认 128。上行带宽充足时调高可减少高负载下的卡顿。</p>
      </div>
      <div class="form-row"><label>保证包最大负载（MaxSizeGuaranteed）</label><el-input-number v-model="b().maxSizeGuaranteed" :min="128" :max="1024" size="small" controls-position="right"/></div>
      <div class="form-row"><label>非保证包最大负载（MaxSizeNonguaranteed）</label><el-input-number v-model="b().maxSizeNonguaranteed" :min="64" :max="512" size="small" controls-position="right"/></div>
      <div class="form-row"><label>保证可用带宽（MinBandwidth）</label><el-input-number v-model="b().minBandwidth" :min="16384" :max="1048576" size="small" controls-position="right"/></div>
      <div class="form-row"><label>带宽上限（MaxBandwidth）</label><el-input-number v-model="b().maxBandwidth" :min="131072" :max="10485760" size="small" controls-position="right"/></div>
      <div class="form-row"><label>远距离更新误差（MinErrorToSend）</label><el-input-number v-model="b().minErrorToSend" :min="0" :max="1" :step="0.001" size="small" controls-position="right"/></div>
      <div class="form-row"><label>近距离更新误差（MinErrorToSendNear）</label><el-input-number v-model="b().minErrorToSendNear" :min="0" :max="1" :step="0.001" size="small" controls-position="right"/></div>
      <div class="form-row"><label>单包最大尺寸（MaxPacketSize）</label><el-input-number v-model="b().maxPacketSize" :min="500" :max="2000" size="small" controls-position="right"/></div>
      <div class="form-row"><label>自定义文件上限（MaxCustomFileSize）</label><el-input-number v-model="b().maxCustomFileSize" :min="0" :max="100" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="超时 / 限制" code="NET-02">
      <div class="form-row">
        <label>断线判定超时（DisconnectTimeout，秒）</label>
        <el-input-number v-model="b().disconnectTimeout" :min="1" :max="90" size="small" controls-position="right"/>
        <p class="form-hint">官方范围 1–90 秒，默认 15。</p>
      </div>
      <div class="form-row">
        <label>最大失同步（MaxDesync）</label>
        <el-input-number v-model="b().maxDesync" :min="-1" :max="500" size="small" controls-position="right"/>
        <p class="form-hint">−1 = 不因该项踢人（官方默认）。</p>
      </div>
      <div class="form-row">
        <label>最大延迟（MaxPing）</label>
        <el-input-number v-model="b().maxPing" :min="-1" :max="500" size="small" controls-position="right"/>
        <p class="form-hint">−1 = 不因该项踢人（官方默认）。</p>
      </div>
      <div class="form-row">
        <label>最大丢包率（MaxPacketLoss，%）</label>
        <el-input-number v-model="b().maxPacketLoss" :min="-1" :max="50" size="small" controls-position="right"/>
        <p class="form-hint">−1 = 不因该项踢人（官方默认）。</p>
      </div>
    </ArkTechPanel>
    <ArkTechPanel title="开关">
      <div class="form-row">
          <el-checkbox v-model="b().upnp" size="small">UPnP</el-checkbox>
          <ParamHint path="basic.upnp" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().loopback" size="small">Loopback</el-checkbox>
          <ParamHint path="basic.loopback" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().bandwidthAlg" size="small">带宽算法</el-checkbox>
          <ParamHint path="basic.bandwidthAlg" />
        </div>
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 160px; }
</style>
