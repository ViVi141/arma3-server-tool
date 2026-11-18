<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading, saving, save, resetAll } = useSettingsPage(() => props.serverUuid, "难度", () => ({ basic: b() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const tri0 = (a: string[]) => a.map((s, i) => ({ value: i + "", label: s }));
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <SettingsViewLayout
      kicker="CONFIG / 05 · DIFF"
      title="难度"
      :show-save="true"
      :allow-reset="true"
      @reset="resetAll"
      :saving="saving"
      @save="save"
    >
    <ArkTechPanel title="界面 (三态: 从不/有限/始终)" code="DIFF-01">
      <div class="form-row"><label>小队指示器</label><el-select v-model="b().groupIndicators" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.groupIndicators" /></div>
      <div class="form-row"><label>友军标签</label><el-select v-model="b().friendlyTags" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.friendlyTags" /></div>
      <div class="form-row"><label>敌军标签</label><el-select v-model="b().enemyTags" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.enemyTags" /></div>
      <div class="form-row"><label>已发现地雷</label><el-select v-model="b().detectedMines" size="small"><el-option v-for="o in tri0(['从不','有限距离','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.detectedMines" /></div>
    </ArkTechPanel>
    <ArkTechPanel title="界面 (三态: 从不/渐隐/始终)" code="DIFF-02">
      <div class="form-row"><label>命令</label><el-select v-model="b().commands" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.commands" /></div>
      <div class="form-row"><label>航点</label><el-select v-model="b().waypoints" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.waypoints" /></div>
      <div class="form-row"><label>武器信息</label><el-select v-model="b().weaponInfo" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.weaponInfo" /></div>
      <div class="form-row"><label>姿态指示器</label><el-select v-model="b().stanceIndicator" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.stanceIndicator" /></div>
      <div class="form-row"><label>战术标记</label><el-select v-model="b().tacticalPing" size="small"><el-option v-for="o in tri0(['从不','渐隐','始终'])" :key="o.value" :value="o.value" :label="o.label"/></el-select><ParamHint path="basic.tacticalPing" /></div>
    </ArkTechPanel>
    <ArkTechPanel title="开关">
      <div class="form-row">
          <el-checkbox v-model="b().staminaBar" size="small">体力条</el-checkbox>
          <ParamHint path="basic.staminaBar" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().weaponCrosshair" size="small">准星</el-checkbox>
          <ParamHint path="basic.weaponCrosshair" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().visionAid" size="small">视觉辅助</el-checkbox>
          <ParamHint path="basic.visionAid" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().cameraShake" size="small">镜头震动</el-checkbox>
          <ParamHint path="basic.cameraShake" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().scoreTable" size="small">得分表</el-checkbox>
          <ParamHint path="basic.scoreTable" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().deathMessages" size="small">死亡消息</el-checkbox>
          <ParamHint path="basic.deathMessages" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().vonId" size="small">VoN 识别</el-checkbox>
          <ParamHint path="basic.vonId" />
        </div>
    </ArkTechPanel>
    <ArkTechPanel title="地图内容" code="DIFF-03">
      <div class="form-row">
          <el-checkbox v-model="b().mapContent" size="small">地图内容</el-checkbox>
          <ParamHint path="basic.mapContent" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().mapContentFriendly" size="small">地图-友军</el-checkbox>
          <ParamHint path="basic.mapContentFriendly" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().mapContentEnemy" size="small">地图-敌军</el-checkbox>
          <ParamHint path="basic.mapContentEnemy" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().mapContentMines" size="small">地图-地雷</el-checkbox>
          <ParamHint path="basic.mapContentMines" />
        </div>
    </ArkTechPanel>
    <ArkTechPanel title="AI / 其他">
      <div class="form-row">
          <el-checkbox v-model="b().reducedDamage" size="small">减少伤害</el-checkbox>
          <ParamHint path="basic.reducedDamage" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().autoReport" size="small">自动报告</el-checkbox>
          <ParamHint path="basic.autoReport" />
        </div>
      <div class="form-row">
          <el-checkbox v-model="b().multipleSaves" size="small">多次存档</el-checkbox>
          <ParamHint path="basic.multipleSaves" />
        </div>
      <div class="form-row"><label>AI 技能</label><el-input-number v-model="b().skillAi" :min="0" :max="1" :step="0.1" size="small" controls-position="right"/></div>
      <div class="form-row"><label>AI 精度</label><el-input-number v-model="b().precisionAi" :min="0" :max="1" :step="0.1" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 110px; }
</style>
