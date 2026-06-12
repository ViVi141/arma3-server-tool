<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";
const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "难度", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const tri0 = (a: string[]) => a.map((s, i) => ({ value: i + "", label: s }));
</script>
<template><ConsolePageLayout v-loading="loading">
<fieldset><legend>界面 (三态: 从不/有限/始终)</legend>
<div class="row"><label>小队指示器</label><el-select v-model="b().groupIndicators" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>友军标签</label><el-select v-model="b().friendlyTags" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>敌军标签</label><el-select v-model="b().enemyTags" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>已发现地雷</label><el-select v-model="b().detectedMines" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
</fieldset>
<fieldset><legend>界面 (三态: 从不/渐隐/始终)</legend>
<div class="row"><label>命令</label><el-select v-model="b().commands" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>航点</label><el-select v-model="b().waypoints" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>武器信息</label><el-select v-model="b().weaponInfo" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>姿态指示器</label><el-select v-model="b().stanceIndicator" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
<div class="row"><label>战术标记</label><el-select v-model="b().tacticalPing" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
</fieldset>
<fieldset><legend>开关</legend>
<div class="row"><label>体力条</label><el-switch v-model="b().staminaBar" size="small"/></div>
<div class="row"><label>准星</label><el-switch v-model="b().weaponCrosshair" size="small"/></div>
<div class="row"><label>视觉辅助</label><el-switch v-model="b().visionAid" size="small"/></div>
<div class="row"><label>镜头震动</label><el-switch v-model="b().cameraShake" size="small"/></div>
<div class="row"><label>得分表</label><el-switch v-model="b().scoreTable" size="small"/></div>
<div class="row"><label>死亡消息</label><el-switch v-model="b().deathMessages" size="small"/></div>
<div class="row"><label>VoN 识别</label><el-switch v-model="b().vonId" size="small"/></div>
</fieldset>
<fieldset><legend>地图内容</legend>
<div class="row"><label>地图内容</label><el-switch v-model="b().mapContent" size="small"/></div>
<div class="row"><label>地图-友军</label><el-switch v-model="b().mapContentFriendly" size="small"/></div>
<div class="row"><label>地图-敌军</label><el-switch v-model="b().mapContentEnemy" size="small"/></div>
<div class="row"><label>地图-地雷</label><el-switch v-model="b().mapContentMines" size="small"/></div>
</fieldset>
<fieldset><legend>AI / 其他</legend>
<div class="row"><label>减少伤害</label><el-switch v-model="b().reducedDamage" size="small"/></div>
<div class="row"><label>自动报告</label><el-switch v-model="b().autoReport" size="small"/></div>
<div class="row"><label>多次存档</label><el-switch v-model="b().multipleSaves" size="small"/></div>
<div class="row"><label>AI 技能</label><el-input-number v-model="b().skillAi" :min="0" :max="1" :step="0.1" size="small" controls-position="right"/></div>
<div class="row"><label>AI 精度</label><el-input-number v-model="b().precisionAi" :min="0" :max="1" :step="0.1" size="small" controls-position="right"/></div>
</fieldset>
</ConsolePageLayout>
</template>
<style scoped>fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}legend{font-size:12px;font-weight:600;padding:0 4px}.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.row label{width:110px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}</style>
