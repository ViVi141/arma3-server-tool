<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import type { MaintenancePolicy } from "@a3st/api-client";
import ArkTechPanel from "./ArkTechPanel.vue";
const policy = defineModel<MaintenancePolicy>({ required: true });
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const groups = [{ key: "windows" as const, label: "维护窗口" }, { key: "protectedWindows" as const, label: "活动保护时段" }];
function changedWindow() {
  policy.value.windowConfirmed = false;
  policy.value.allowOccupied = false;
  policy.value.occupiedConfirmed = false;
}
function changedTemplate() {
  if (policy.value.template !== "idle_first") { policy.value.allowOccupied = false; policy.value.occupiedConfirmed = false; }
}
async function changeOccupied(enabled: string | number | boolean) {
  const current = policy.value;
  current.occupiedConfirmed = false;
  if (!enabled) { current.allowOccupied = false; return; }
  current.allowOccupied = false;
  try {
    await ElMessageBox.confirm("此选项允许更新等待超过 24 小时后，在授权维护窗口内断开在线玩家。维护前必须完成 10／5／1 分钟广播；广播失败、在线未知或进入保护时段会取消本次维护。确认授权吗？", "确认有人维护风险", { type: "warning", confirmButtonText: "确认允许断开玩家", cancelButtonText: "保持关闭" });
    if (policy.value !== current) return;
    current.allowOccupied = true; current.occupiedConfirmed = true;
  } catch { /* 保持关闭。 */ }
}
</script>

<template>
  <ArkTechPanel title="逐服维护策略" code="OPS-POLICY">
    <el-checkbox v-model="policy.enabled">启用本服维护策略（默认关闭）</el-checkbox>
    <div class="form-row"><label>策略模板</label><el-select v-model="policy.template" @change="changedTemplate">
      <el-option value="check_only" label="仅检查：不停止、不下载" />
      <el-option value="maintenance_window" label="固定维护窗口：连续无人 10 分钟" />
      <el-option value="idle_first" label="常驻服：空闲优先，超过 24 小时等授权窗口" />
    </el-select></div>
    <div class="form-row"><label>明确时区</label><el-input v-model="policy.timeZone" placeholder="Asia/Shanghai 或 UTC" @input="changedWindow" /></div>
    <section v-for="group in groups" :key="group.key" class="window-group">
      <div class="group-heading"><span>{{ group.label }}</span><el-button size="small" :disabled="policy[group.key].length >= 32" @click="policy[group.key].push({ days: [0,1,2,3,4,5,6], start: '04:00', end: '05:00' }); changedWindow()">添加时段</el-button></div>
      <div v-for="(window, index) in policy[group.key]" :key="index" class="window-row">
        <el-checkbox-group v-model="window.days" @change="changedWindow"><el-checkbox v-for="(day, value) in weekdays" :key="value" :value="value">{{ day }}</el-checkbox></el-checkbox-group>
        <div class="times"><el-input v-model="window.start" type="time" :aria-label="`${group.label}开始`" @input="changedWindow" /><span>至</span><el-input v-model="window.end" type="time" :aria-label="`${group.label}结束`" @input="changedWindow" /><el-button size="small" @click="policy[group.key].splice(index, 1); changedWindow()">删除时段</el-button></div>
      </div>
      <p v-if="!policy[group.key].length" class="hint">未设置{{ group.label }}</p>
    </section>
    <el-checkbox v-model="policy.windowConfirmed">已核对星期、实际时区及窗口；04:00—05:00 仅为建议，不是默认授权</el-checkbox>
    <div><el-checkbox :model-value="policy.allowOccupied" :disabled="policy.template !== 'idle_first' || !policy.windowConfirmed || !policy.windows.length" @change="changeOccupied">单独允许：超过 24 小时后，窗口内有人维护（会断开玩家）</el-checkbox></div>
    <div class="form-row"><label>预计停服预算（分钟）</label><el-input-number v-model="policy.expectedDurationMinutes" :min="1" :max="1440" /></div>
    <p class="hint">时段按开始日计算，支持跨午夜；所有模板均受活动保护时段约束。共享物理目录必须同时满足所有关联实例的策略。窗口仅限定开始时刻，下载耗时计入停服，超预算告警不会打断恢复。</p>
    <p class="hint">配置修改需保存后生效；不会立即重启实例。原本关闭的实例不会在维护结束后被顺便启动。</p>
  </ArkTechPanel>
</template>

<style scoped>
.form-row { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.form-row label { width: 155px; flex-shrink: 0; font-size: 12px; }
.form-row .el-select, .form-row .el-input { max-width: 560px; }
.window-group { margin: 14px 0; border: 1px solid var(--el-border-color); padding: 10px; border-radius: 4px; }
.group-heading, .times { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.window-row { padding-top: 10px; }
.times .el-input { width: 140px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; }
</style>
