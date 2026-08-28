<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "难度", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const tri0 = (a: string[]) => a.map((s, i) => ({ value: i + "", label: s }));
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <SettingsViewLayout kicker="CONFIG / 05 · DIFF" title="难度">
    <ArkTechPanel title="界面 (三态: 从不/有限/始终)" code="DIFF-01">
      <div class="form-row"><label>小队指示器</label><el-select v-model="b().groupIndicators" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>友军标签</label><el-select v-model="b().friendlyTags" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>敌军标签</label><el-select v-model="b().enemyTags" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>已发现地雷</label><el-select v-model="b().detectedMines" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
    </ArkTechPanel>
    <ArkTechPanel title="界面 (三态: 从不/渐隐/始终)" code="DIFF-02">
      <div class="form-row"><label>命令</label><el-select v-model="b().commands" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>航点</label><el-select v-model="b().waypoints" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>武器信息</label><el-select v-model="b().weaponInfo" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>姿态指示器</label><el-select v-model="b().stanceIndicator" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
      <div class="form-row"><label>战术标记</label><el-select v-model="b().tacticalPing" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select></div>
    </ArkTechPanel>
    <ArkTechPanel title="开关">
      <div class="form-row"><label>体力条</label><el-switch v-model="b().staminaBar" size="small"/></div>
      <div class="form-row"><label>准星</label><el-switch v-model="b().weaponCrosshair" size="small"/></div>
      <div class="form-row"><label>视觉辅助</label><el-switch v-model="b().visionAid" size="small"/></div>
      <div class="form-row"><label>镜头震动</label><el-switch v-model="b().cameraShake" size="small"/></div>
      <div class="form-row"><label>得分表</label><el-switch v-model="b().scoreTable" size="small"/></div>
      <div class="form-row"><label>死亡消息</label><el-switch v-model="b().deathMessages" size="small"/></div>
      <div class="form-row"><label>VoN 识别</label><el-switch v-model="b().vonId" size="small"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="地图内容" code="DIFF-03">
      <div class="form-row"><label>地图内容</label><el-switch v-model="b().mapContent" size="small"/></div>
      <div class="form-row"><label>地图-友军</label><el-switch v-model="b().mapContentFriendly" size="small"/></div>
      <div class="form-row"><label>地图-敌军</label><el-switch v-model="b().mapContentEnemy" size="small"/></div>
      <div class="form-row"><label>地图-地雷</label><el-switch v-model="b().mapContentMines" size="small"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="AI / 其他">
      <div class="form-row"><label>减少伤害</label><el-switch v-model="b().reducedDamage" size="small"/></div>
      <div class="form-row"><label>自动报告</label><el-switch v-model="b().autoReport" size="small"/></div>
      <div class="form-row"><label>多次存档</label><el-switch v-model="b().multipleSaves" size="small"/></div>
      <div class="form-row"><label>AI 技能</label><el-input-number v-model="b().skillAi" :min="0" :max="1" :step="0.1" size="small" controls-position="right"/></div>
      <div class="form-row"><label>AI 精度</label><el-input-number v-model="b().precisionAi" :min="0" :max="1" :step="0.1" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 110px; }
</style>
