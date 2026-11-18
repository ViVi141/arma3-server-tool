<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading, saving, save, resetAll } = useSettingsPage(() => props.serverUuid, "性能", () => ({ startup: s() }));
const s = () => (cfg.value.startup ?? {}) as Record<string, unknown>;
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <SettingsViewLayout
      kicker="CONFIG / 05 · PERF"
      title="性能"
      :show-save="true"
      :allow-reset="true"
      @reset="resetAll"
      :saving="saving"
      @save="save"
    >
    <ArkTechPanel title="CPU / 内存" code="PERF-01">
      <div class="form-row"><label>CPU 核心数</label><el-input-number v-model="s().cpuCount" :min="0" :max="128" size="small" controls-position="right"/></div>
      <div class="form-row"><label>额外线程数</label><el-input-number v-model="s().exThreads" :min="0" :max="32" size="small" controls-position="right"/></div>
      <div class="form-row"><label>最大内存(MB)</label><el-input-number v-model="s().maxMem" :min="0" :max="65536" size="small" controls-position="right"/></div>
      <div class="form-row"><label>帧率上限</label><el-input-number v-model="s().limitFps" :min="1" :max="1000" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="画面" code="PERF-02">
      <div class="form-row"><label>视距</label><el-input-number v-model="s().viewDistance" :min="200" :max="10000" :step="100" size="small" controls-position="right"/></div>
      <div class="form-row"><label>地形网格</label><el-input-number v-model="s().terrainGrid" :min="1" :max="50" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="高级">
      <div class="form-row">
          <el-checkbox v-model="s().enableHT" size="small">超线程 (-enableHT)</el-checkbox>
          <ParamHint path="startup.enableHT" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="s().hugepages" size="small">大页内存 (-hugepages)</el-checkbox>
          <ParamHint path="startup.hugepages" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="s().loadMissionToMemory" size="small">任务预加载</el-checkbox>
          <ParamHint path="startup.loadMissionToMemory" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="s().disableServerThread" size="small">禁用服务端线程</el-checkbox>
          <ParamHint path="startup.disableServerThread" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="s().logObjectNotFound" size="small">日志·缺失对象</el-checkbox>
          <ParamHint path="startup.logObjectNotFound" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="s().skipDescriptionParsing" size="small">跳过 description.ext 解析</el-checkbox>
          <ParamHint path="startup.skipDescriptionParsing" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="s().ignoreMissionLoadErrors" size="small">忽略任务加载错误</el-checkbox>
          <ParamHint path="startup.ignoreMissionLoadErrors" />
        </div>
      <div class="form-row"><label>消息队列阈值(字节)</label><el-input-number v-model="s().queueSizeLogG" :min="0" :max="99999999" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 180px; }
</style>
