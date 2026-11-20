<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { createClient, type MaintenanceDiscovery, type MaintenancePreview, type MaintenanceResult } from "@a3st/api-client";
import { useConnectionsStore } from "@/stores/connections";
import ArkTechPanel from "./ArkTechPanel.vue";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();
const mods = ref<MaintenanceDiscovery[]>([]);
const selected = ref<MaintenanceDiscovery[]>([]);
const preview = ref<MaintenancePreview | null>(null);
const batch = ref<MaintenanceResult | null>(null);
const busy = ref(false);
const error = ref("");
let generation = 0;
let poll: ReturnType<typeof setTimeout> | null = null;
const labels = { outdated: "有更新", up_to_date: "版本记录一致", unknown: "版本未知" };
const states: Record<string, string> = { queued: "已排队", waiting_policy: "等待维护许可", authenticating: "验证 SteamCMD 缓存登录",
  paused_auth: "等待手机确认 2FA（不会自动重试）", backing_up: "准备备份", countdown: "游戏内预告倒计时", stopping: "停止受影响进程",
  downloading: "下载中（此阶段停服）", verifying: "核对版本与签名", starting: "恢复原运行实例", checking_health: "等待独立健康心跳",
  succeeded: "更新完成", cancelled: "已取消", failed: "失败", rolling_back: "有限回滚", rolled_back: "已回滚到旧版本",
  manual_intervention: "需人工介入（保留备份与锁）" };
const retryable = new Set(["waiting_policy", "paused_auth", "cancelled", "failed", "rolled_back"]);
const active = (state: string) => !["succeeded", "waiting_policy", "paused_auth", "cancelled", "failed", "rolled_back", "manual_intervention"].includes(state);
const idempotencyKey = () => crypto.randomUUID().replace(/-/g, "");
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "未知／无";
const version = (value: { timeUpdated: number } | null) => value ? new Date(value.timeUpdated * 1000).toLocaleString() : "未知";
function client() {
  const conn = store.connections.find((item) => item.id === props.connectionId);
  if (!conn) throw new Error("未连接");
  return createClient(conn.baseUrl, conn.token);
}
async function check(refresh: boolean) {
  const run = generation; const uuid = props.serverUuid;
  busy.value = true; error.value = ""; preview.value = null;
  try {
    const api = client();
    const response = await (refresh ? api.checkMaintenanceUpdates(uuid) : api.getMaintenanceUpdates(uuid));
    if (run !== generation) return;
    if (!response.success) throw new Error(response.error ?? "检查失败");
    // 服务端异常或代理错误可能返回非数组；不能把无效载荷直接交给表格。
    mods.value = Array.isArray(response.data) ? response.data : [];
    selected.value = [];
  } catch (e) { if (run === generation) error.value = e instanceof Error ? e.message : "检查失败"; }
  finally { if (run === generation) busy.value = false; }
}
async function showPreview() {
  const run = generation; busy.value = true; error.value = ""; preview.value = null;
  try {
    const response = await client().previewMaintenance(props.serverUuid, selected.value.map((item) => item.key));
    if (run !== generation) return;
    if (!response.success) throw new Error(response.error ?? "预览失败，请重新检查并选择目标");
    const data = response.data;
    if (!data || !Array.isArray(data.mods) || !Array.isArray(data.instances) || !Array.isArray(data.reasons)) {
      throw new Error("预览响应缺少必需字段，请重新检查；不会按可执行处理");
    }
    preview.value = data;
  } catch (e) { if (run === generation) { error.value = e instanceof Error ? e.message : "预览失败"; ElMessage.error(error.value); } }
  finally { if (run === generation) busy.value = false; }
}
async function loadBatch(id: string) {
  const run = generation;
  if (poll) { clearTimeout(poll); poll = null; }
  try {
    const response = await client().getMaintenance(id);
    if (run !== generation) return;
    if (!response.success) throw new Error(response.error ?? "批次查询失败");
    if (!response.data || typeof response.data.state !== "string") throw new Error("批次响应缺少状态，保留上次证据");
    batch.value = response.data;
    if (active(response.data.state)) poll = setTimeout(() => void loadBatch(id), 3000);
  } catch (e) { if (run === generation) error.value = e instanceof Error ? e.message : "批次查询失败"; }
}
async function run() {
  if (!preview.value?.canExecute) return;
  const count = preview.value.mods.length, uuids = preview.value.impact.serverUuids.length;
  try {
    await ElMessageBox.confirm(`将停止 ${uuids} 个受影响实例并原位更新 ${count} 个物理模组目录；下载期间停服，完成后只恢复原先运行的服务器与 HC，并等待健康心跳。是否继续？`,
      "确认执行维护", { type: "warning", confirmButtonText: "执行", cancelButtonText: "取消" });
  } catch { return; }
  busy.value = true; error.value = "";
  try {
    const response = await client().executeMaintenance(props.serverUuid, selected.value.map((item) => item.key), idempotencyKey());
    if (!response.success) throw new Error(response.error ?? "执行被拒绝");
    ElMessage.success("维护批次已创建，进度来自持久检查点");
    await loadBatch(response.data.id);
  } catch (e) { error.value = e instanceof Error ? e.message : "执行失败"; ElMessage.error(error.value); }
  finally { busy.value = false; }
}
async function retry() {
  if (!batch.value) return;
  busy.value = true; error.value = "";
  try {
    const response = await client().retryMaintenance(batch.value.id, idempotencyKey());
    if (!response.success) throw new Error(response.error ?? "重试被拒绝");
    ElMessage.success("已按原批次目标重新开始；不会更换资源");
    await loadBatch(response.data.id);
  } catch (e) { error.value = e instanceof Error ? e.message : "重试失败"; ElMessage.error(error.value); }
  finally { busy.value = false; }
}
async function cancel() {
  if (!batch.value) return;
  try {
    await ElMessageBox.confirm("取消只停止后续步骤；已开始的停服与下载仍会执行有限恢复，不会强停进程。", "取消维护",
      { type: "warning", confirmButtonText: "取消维护", cancelButtonText: "继续维护" });
  } catch { return; }
  try {
    const response = await client().cancelMaintenance(batch.value.id);
    if (!response.success) throw new Error(response.error ?? "取消失败");
    ElMessage.info("已请求取消，等待有限恢复结束");
    await loadBatch(batch.value.id);
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "取消失败"); }
}
/** 人工介入批次不会因取消/重启自动解锁；只有确认现场已处理后才显式释放。 */
async function resolveManual() {
  if (!batch.value || batch.value.state !== "manual_intervention") return;
  try {
    await ElMessageBox.confirm("仅在你已人工核对进程、模组文件、公钥与备份证据后使用。确认后会解除该批次的实例/目录维护锁，并把批次标记为已人工结束；备份与事件证据保留。",
      "确认现场已处理", { type: "error", confirmButtonText: "确认已处理并释放锁", cancelButtonText: "仍保留维护锁" });
  } catch { return; }
  busy.value = true; error.value = "";
  try {
    const response = await client().resolveMaintenance(batch.value.id);
    if (!response.success) throw new Error(response.error ?? "人工释放被拒绝");
    ElMessage.success("已解除维护锁；批次可按原目标显式重试");
    await loadBatch(batch.value.id);
  } catch (e) { error.value = e instanceof Error ? e.message : "人工释放失败"; ElMessage.error(error.value); }
  finally { busy.value = false; }
}
watch(() => [props.connectionId, props.serverUuid], () => {
  generation++; mods.value = []; selected.value = []; preview.value = null; batch.value = null;
  if (poll) { clearTimeout(poll); poll = null; }
  void check(false);
}, { immediate: true });
</script>

<template>
  <ArkTechPanel title="共享模组维护预览" code="OPS-PREVIEW">
    <p class="hint">每 10 分钟合并查询 Workshop ID；同 ID 的不同物理副本分别判断。未知版本不视为最新，检查和预览不会登录 Steam、停服或下载。</p>
    <div class="toolbar">
      <el-button :loading="busy" @click="check(true)">检查维护更新</el-button>
      <el-button :disabled="busy || !selected.length" @click="showPreview">预览选中 {{ selected.length }} 个物理目录</el-button>
    </div>
    <el-alert v-if="error" type="error" :title="error" :closable="false" />
    <el-table :data="mods" row-key="key" size="small" max-height="340" @selection-change="(rows: MaintenanceDiscovery[]) => { selected = rows; preview = null; }">
      <el-table-column type="selection" width="42" />
      <el-table-column label="模组 / ID" min-width="180"><template #default="{ row }">{{ row.title }}<br>{{ row.modId }}</template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="{ row }">{{ labels[row.status as keyof typeof labels] }}</template></el-table-column>
      <el-table-column label="已安装 / 远程版本" min-width="175"><template #default="{ row }">{{ version(row.localVersion) }}<br>{{ version(row.remoteVersion) }}</template></el-table-column>
      <el-table-column label="首次发现待更新" min-width="170"><template #default="{ row }">{{ date(row.pendingSince) }}</template></el-table-column>
      <el-table-column prop="physicalPath" label="物理目录" min-width="230" show-overflow-tooltip />
      <el-table-column label="最后查询" min-width="170"><template #default="{ row }">{{ date(row.checkedAt) }}</template></el-table-column>
    </el-table>
    <template v-if="preview">
      <el-alert :type="preview.canExecute ? 'success' : 'warning'" :closable="false" :title="preview.canExecute ? '当前门禁通过，执行前仍须复核' : '需要等待或人工处理，保持旧版本及运行状态'" />
      <p class="hint">{{ preview.warning }} 本次：{{ preview.mods.length }} 个物理目录，{{ preview.impact.serverUuids.length }} 个关联实例，HC 关联 {{ preview.impact.headlessUuids.length }} 个。</p>
      <ul v-if="preview.reasons.length"><li v-for="reason in preview.reasons" :key="reason">{{ reason }}</li></ul>
      <el-table :data="preview.instances" size="small">
        <el-table-column prop="serverUuid" label="受影响实例" min-width="170" />
        <el-table-column label="进程 / HC" min-width="120"><template #default="{ row }">{{ row.presence.running === null ? '未知' : row.presence.running ? '运行中' : '已停止' }} / {{ row.headlessRunning === null ? '未知' : row.headlessRunning ? '运行中' : '已停止' }}</template></el-table-column>
        <el-table-column label="在线人数" width="90"><template #default="{ row }">{{ row.presence.onlineCount ?? '未知' }}</template></el-table-column>
        <el-table-column label="维护许可 / 等待原因" min-width="260"><template #default="{ row }">{{ row.eligibility.reason }}</template></el-table-column>
      </el-table>
      <p v-if="preview.commonTime" class="hint">共同时间许可：{{ preview.commonTime.at ? date(preview.commonTime.at) : '未来 14 天无共同机会' }}；不预测届时玩家人数。</p>
      <p class="hint">连续无人 {{ preview.thresholds.idleSeconds / 60 }} 分钟；采样 {{ preview.thresholds.sampleSeconds }} 秒；在线证据 {{ preview.thresholds.onlineFreshSeconds }} 秒过期；延期 {{ preview.thresholds.maxWaitHours }} 小时后等待授权窗口。查询失败绝不按 0 人处理。</p>
      <div class="toolbar">
        <el-button type="primary" :disabled="busy || !preview.canExecute" @click="run">执行维护（停止受影响实例）</el-button>
        <span class="hint">执行会重新校验策略、在线状态、会话与范围；不接受“写配置后重启”等旁路参数。</span>
      </div>
    </template>
    <template v-if="batch">
      <el-alert :type="batch.state === 'succeeded' ? 'success' : batch.requiresAttention ? 'error' : 'info'" :closable="false"
        :title="`批次 ${batch.id.slice(0, 8)}：${states[batch.state] ?? batch.state}${batch.result ? `；原因 ${batch.result}` : ''}`" />
      <p class="hint">更新 {{ batch.modIds.length }} 个模组／{{ batch.serverUuids.length }} 个实例；创建 {{ date(batch.createdAt) }}，最后更新 {{ date(batch.updatedAt) }}。
        人工介入批次保留备份与维护锁；先按事件证据处理现场，再显式确认“已处理并释放锁”，之后才可按原目标重试。确认已读不代表故障恢复。</p>
      <div class="toolbar">
        <el-button :disabled="busy || !retryable.has(batch.state)" @click="retry">按原目标重试</el-button>
        <el-button :disabled="busy || !active(batch.state)" @click="cancel">取消后续步骤</el-button>
        <el-button type="danger" plain :disabled="busy || batch.state !== 'manual_intervention'" @click="resolveManual">人工处理完成并释放锁</el-button>
      </div>
      <p class="hint">健康确认来自独立 RPT 心跳；完成不代表公网可达性或真实玩家加入已验证。</p>
    </template>
  </ArkTechPanel>
</template>

<style scoped>
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.hint, li { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; }
.el-alert { margin: 10px 0; }
</style>
