<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";
const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "性能", () => ({ startup: s() }));
const s = () => (cfg.value.startup ?? {}) as Record<string, unknown>;
</script>
<template>
<ConsolePageLayout v-loading="loading">
<fieldset><legend>CPU / 内存</legend>
<div class="row"><label>CPU 核心数</label><el-input-number v-model="s().cpuCount" :min="0" :max="128" size="small" controls-position="right"/></div>
<div class="row"><label>额外线程数</label><el-input-number v-model="s().exThreads" :min="0" :max="32" size="small" controls-position="right"/></div>
<div class="row"><label>最大内存(MB)</label><el-input-number v-model="s().maxMem" :min="0" :max="65536" size="small" controls-position="right"/></div>
<div class="row"><label>帧率上限</label><el-input-number v-model="s().limitFps" :min="1" :max="1000" size="small" controls-position="right"/></div>
</fieldset>
<fieldset><legend>画面</legend>
<div class="row"><label>视距</label><el-input-number v-model="s().viewDistance" :min="200" :max="10000" :step="100" size="small" controls-position="right"/></div>
<div class="row"><label>地形网格</label><el-input-number v-model="s().terrainGrid" :min="1" :max="50" size="small" controls-position="right"/></div>
</fieldset>
<fieldset><legend>高级</legend>
<div class="row"><label>超线程 (-enableHT)</label><el-switch v-model="s().enableHT" size="small"/></div>
<div class="row"><label>大页内存 (-hugepages)</label><el-switch v-model="s().hugepages" size="small"/></div>
<div class="row"><label>任务预加载</label><el-switch v-model="s().loadMissionToMemory" size="small"/></div>
<div class="row"><label>禁用服务端线程</label><el-switch v-model="s().disableServerThread" size="small"/></div>
<div class="row"><label>日志·缺失对象</label><el-switch v-model="s().logObjectNotFound" size="small"/></div>
<div class="row"><label>跳过 description.ext 解析</label><el-switch v-model="s().skipDescriptionParsing" size="small"/></div>
<div class="row"><label>忽略任务加载错误</label><el-switch v-model="s().ignoreMissionLoadErrors" size="small"/></div>
<div class="row"><label>消息队列阈值(字节)</label><el-input-number v-model="s().queueSizeLogG" :min="0" :max="99999999" size="small" controls-position="right"/></div>
</fieldset>
</ConsolePageLayout>
</template>
<style scoped>fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}legend{font-size:12px;font-weight:600;padding:0 4px}.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.row label{width:180px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}</style>
