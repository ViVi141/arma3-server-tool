<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { createClient, type EmailDelivery, type NotificationSettings, type OperationEvent } from "@a3st/api-client";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const connections = useConnectionsStore();
const connection = computed(() => connections.connections.find((item) => item.id === props.connectionId));
const context = computed(() => JSON.stringify([props.connectionId, connection.value?.baseUrl, connection.value?.token]));
const client = () => connection.value ? createClient(connection.value.baseUrl, connection.value.token) : null;
const events = ref<OperationEvent[]>([]);
const cursor = ref<number>();
const hasMore = ref(false);
const expired = ref(false);
const eventError = ref("");
const settingsError = ref("");
const mailError = ref("");
const lastCheck = ref("");
const onlyCurrent = ref(false);
const onlyUnresolved = ref(false);
const loading = ref(false);
const busy = ref(false);
const settingsReady = ref(false);
const passwordConfigured = ref(false);
const readTokenConfigured = ref(false);
const recipientsText = ref("");
const settings = ref<NotificationSettings>({ enabled: false, host: "", port: 587, tls: "starttls", username: "", from: "", recipients: [] });
const baseline = ref("");
const deliveries = ref<EmailDelivery[]>([]);
let generation = 0;
let disposed = false;
let poll: ReturnType<typeof setInterval> | undefined;
const current = (id: number) => !disposed && id === generation;
const form = (): NotificationSettings => ({ enabled: settings.value.enabled, host: settings.value.host.trim(), port: settings.value.port,
  tls: settings.value.tls, username: settings.value.username.trim(), from: settings.value.from.trim(),
  recipients: recipientsText.value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean) });
const dirty = computed(() => settingsReady.value && JSON.stringify(form()) !== baseline.value);
const visibleEvents = computed(() => events.value.filter((event) => (!onlyCurrent.value || event.serverUuids.includes(props.serverUuid)) &&
  (!onlyUnresolved.value || !event.recoveredAt)).sort((a, b) => Number(Boolean(a.recoveredAt)) - Number(Boolean(b.recoveredAt)) || b.sequence - a.sequence));
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "—";
const errorText = (response: { error: string | null; data: unknown }) => {
  const data = response.data as { message?: string } | null;
  return data?.message || response.error || "请求失败";
};

async function refreshEvents(reset = false) {
  const api = client(); if (!api || loading.value || (expired.value && !reset)) return;
  const id = generation; loading.value = true;
  if (reset) { cursor.value = undefined; events.value = []; expired.value = false; }
  try {
    const result = await api.opsEvents(cursor.value);
    if (!current(id)) return;
    if (!result.success) {
      if (result.error === "CURSOR_EXPIRED" || result.error === "INVALID_CURSOR") expired.value = true;
      throw new Error(errorText(result));
    }
    const merged = new Map(events.value.map((event) => [event.eventId, event]));
    for (const item of result.data.items) if (!merged.has(item.eventId) || merged.get(item.eventId)!.sequence < item.sequence) merged.set(item.eventId, item);
    events.value = [...merged.values()]; cursor.value = result.data.nextCursor; hasMore.value = result.data.hasMore;
    lastCheck.value = new Date().toISOString(); eventError.value = "";
  } catch (error) { if (current(id)) eventError.value = error instanceof Error ? error.message : "事件查询失败，已有数据可能过期"; }
  finally { if (current(id)) loading.value = false; }
}
async function refreshMail() {
  const api = client(); if (!api) return;
  const id = generation;
  try {
    const result = await api.emailDeliveries(); if (!current(id)) return;
    if (!result.success) throw new Error(errorText(result));
    deliveries.value = result.data; mailError.value = "";
  } catch { if (current(id)) mailError.value = "邮件状态查询失败（需要管理 Token），不能据此判断发送成功"; }
}
async function loadSettings() {
  const api = client(); if (!api) return;
  const id = generation;
  try {
    const result = await api.getNotificationSettings(); if (!current(id)) return;
    if (!result.success) throw new Error(errorText(result));
    const { passwordConfigured: password, readTokenConfigured: token, ...value } = result.data;
    settings.value = value; recipientsText.value = value.recipients.join("\n");
    passwordConfigured.value = password; readTokenConfigured.value = token;
    baseline.value = JSON.stringify(form()); settingsReady.value = true;
  } catch { if (current(id)) settingsError.value = "通知设置读取失败，需要管理 Token"; }
}
async function saveSettings() {
  const api = client(); if (!api || busy.value) return;
  const id = generation; busy.value = true;
  try {
    if (settings.value.tls === "none") {
      await ElMessageBox.confirm("明文 SMTP 不加密邮件和认证信息。仅在受信任网络或本地测试环境使用，确认保存？", "确认明文连接", { type: "warning" });
      if (!current(id)) return;
    }
    const submitted = form();
    const result = await api.saveNotificationSettings(submitted); if (!current(id)) return;
    if (!result.success) throw new Error(errorText(result));
    baseline.value = JSON.stringify(submitted); passwordConfigured.value = result.data.passwordConfigured;
    settingsError.value = ""; ElMessage.success("通知设置已保存，仅影响当前主机，不会重启服务器");
  } catch (error) { if (current(id) && error !== "cancel" && error !== "close") settingsError.value = error instanceof Error ? error.message : "保存失败"; }
  finally { if (current(id)) busy.value = false; }
}
async function testEmail() {
  const api = client(); if (!api || busy.value || dirty.value) return;
  const id = generation; busy.value = true;
  try {
    await ElMessageBox.confirm(`将向已保存的收件人发送测试邮件：${form().recipients.join("、") || "尚未配置"}。确认发送？`, "发送测试邮件", { confirmButtonText: "发送", cancelButtonText: "取消" });
    if (!current(id)) return;
    const result = await api.testNotification(); if (!current(id)) return;
    if (!result.success) throw new Error(errorText(result));
    ElMessage.success("测试邮件已加入队列，请在发送记录中确认结果"); await refreshMail();
  } catch (error) { if (current(id) && error !== "cancel" && error !== "close") settingsError.value = error instanceof Error ? error.message : "测试请求失败"; }
  finally { if (current(id)) busy.value = false; }
}
async function acknowledge(event: OperationEvent) {
  const api = client(); if (!api || busy.value) return;
  const id = generation; busy.value = true;
  try {
    const result = await api.acknowledgeOpsEvent(event.eventId); if (!current(id)) return;
    if (!result.success) throw new Error(errorText(result));
    events.value = events.value.map((item) => item.eventId === event.eventId ? result.data : item);
  } catch { if (current(id)) ElMessage.error("确认失败，需要管理 Token；故障恢复状态未改变"); }
  finally { if (current(id)) busy.value = false; }
}
async function allowLeave() {
  if (busy.value) { ElMessage.warning("请等待当前通知操作完成"); return false; }
  if (!dirty.value) return true;
  try { await ElMessageBox.confirm("通知设置尚未保存，离开将丢弃更改。", "未保存的通知设置", { confirmButtonText: "丢弃并离开", cancelButtonText: "继续编辑", type: "warning" }); return true; }
  catch { return false; }
}
onBeforeRouteLeave(allowLeave);
onBeforeRouteUpdate((to, from) => to.params.connectionId !== from.params.connectionId || to.params.tab !== from.params.tab ? allowLeave() : true);
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = ""; } }
watch(context, () => {
  generation++; events.value = []; cursor.value = undefined; hasMore.value = false; expired.value = false; loading.value = false; busy.value = false;
  settingsReady.value = false; settingsError.value = ""; mailError.value = ""; eventError.value = ""; deliveries.value = []; lastCheck.value = "";
  void refreshEvents(); void loadSettings(); void refreshMail();
}, { immediate: true });
onMounted(() => { window.addEventListener("beforeunload", beforeUnload); poll = setInterval(() => { void refreshEvents(); void refreshMail(); }, 30000); });
onUnmounted(() => { disposed = true; generation++; clearInterval(poll); window.removeEventListener("beforeunload", beforeUnload); });
</script>

<template>
  <section class="ops-page" data-testid="operations-page">
    <el-card shadow="never">
      <template #header><div class="heading"><h2>运维事件</h2><el-button :loading="loading" @click="refreshEvents()">刷新事件</el-button></div></template>
      <p>当前主机的持久事件。确认已读与故障恢复是两种状态；读取不会删除事件。</p>
      <div class="toolbar"><el-checkbox v-model="onlyCurrent">仅当前实例</el-checkbox><el-checkbox v-model="onlyUnresolved">仅未恢复</el-checkbox><span>已加载 {{ events.length }} 个事件 · 最后查询 {{ date(lastCheck) }}</span></div>
      <el-alert v-if="eventError" :title="eventError" type="error" :closable="false" />
      <el-button v-if="expired" type="warning" @click="refreshEvents(true)">游标失效，重新同步</el-button>
      <el-table :data="visibleEvents" empty-text="当前已加载范围内没有事件" row-key="eventId">
        <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="row.recoveredAt ? 'success' : row.requiresAttention ? 'danger' : 'info'">{{ row.recoveredAt ? '已恢复 / 已完成' : row.requiresAttention ? '需人工介入' : '已记录' }}</el-tag><div>{{ row.acknowledgedAt ? '已读' : '未读' }}</div></template></el-table-column>
        <el-table-column label="原因与建议" min-width="270"><template #default="{ row }"><strong>{{ row.reasonCode }}</strong><p>{{ row.message }}</p><p>{{ row.suggestedAction }}</p><small>实例：{{ row.serverUuids.join('、') || '主机' }} · 模组：{{ row.modIds.join('、') || '无' }} · 批次：{{ row.batchId || '无' }}</small></template></el-table-column>
        <el-table-column label="时间" min-width="170"><template #default="{ row }"><div>发生 {{ date(row.occurredAt) }}</div><div>恢复 {{ date(row.recoveredAt) }}</div><small>序号 {{ row.sequence }}</small></template></el-table-column>
        <el-table-column label="操作" width="115"><template #default="{ row }"><el-button size="small" :disabled="busy || !!row.acknowledgedAt" @click="acknowledge(row)">确认已读</el-button></template></el-table-column>
      </el-table>
      <el-button v-if="hasMore" :loading="loading" @click="refreshEvents()">还有事件未加载，加载下一页</el-button>
    </el-card>

    <el-card shadow="never">
      <template #header><h2>Email 通知 · 主机级设置</h2></template>
      <p>默认仅发送“需人工介入”和“故障恢复”。普通更新成功只记事件。保存立即生效，不修改任何实例的启动配置。</p>
      <el-alert v-if="settingsError" :title="settingsError" type="error" :closable="false" />
      <el-form v-if="settingsReady" label-position="top" :disabled="busy" @submit.prevent="saveSettings">
        <el-checkbox v-model="settings.enabled">启用自动 Email 通知</el-checkbox>
        <div class="settings-grid">
          <el-form-item label="SMTP 主机"><el-input v-model="settings.host" aria-label="SMTP 主机" placeholder="smtp.example.com" /></el-form-item>
          <el-form-item label="SMTP 端口"><el-input-number v-model="settings.port" aria-label="SMTP 端口" :min="1" :max="65535" /></el-form-item>
          <el-form-item label="TLS 模式"><el-select v-model="settings.tls" aria-label="TLS 模式"><el-option value="starttls" label="STARTTLS（必须升级加密）" /><el-option value="tls" label="TLS（连接即加密）" /><el-option value="none" label="明文（不加密，需确认）" /></el-select></el-form-item>
          <el-form-item label="SMTP 用户名"><el-input v-model="settings.username" aria-label="SMTP 用户名" placeholder="无需认证可留空" /></el-form-item>
          <el-form-item label="发件人"><el-input v-model="settings.from" aria-label="发件人" placeholder="ops@example.com" /></el-form-item>
          <el-form-item label="收件人（每行一个，最多 20 个）"><el-input v-model="recipientsText" aria-label="收件人" type="textarea" :rows="3" /></el-form-item>
        </div>
        <p>SMTP 密码：{{ passwordConfigured ? '服务端已配置' : '服务端未配置' }}。仅通过服务端环境变量 <code>A3ST_SMTP_PASSWORD</code> 提供，不同步到浏览器。</p>
        <div class="toolbar"><el-button type="primary" :loading="busy" @click="saveSettings">保存通知设置</el-button><el-button :disabled="dirty || busy" @click="testEmail">发送测试邮件</el-button><span v-if="dirty">有未保存更改，请先保存再测试</span></div>
      </el-form>
      <p>发送失败在 1、5、15、60 分钟后重试，耗尽后保留失败记录。停用自动通知会暂停待发故障邮件；显式测试仍可发送。收件人以入队时设置为准。</p>
      <p>Service 在 SMTP 已接收、状态落盘前中断，重启后可能重复投递；邮件沿用同一个 Message-ID。</p>
      <div class="heading"><h3>最近 100 条发送记录</h3><el-button @click="refreshMail">刷新邮件状态</el-button></div>
      <el-alert v-if="mailError" :title="mailError" type="warning" :closable="false" />
      <el-table :data="deliveries" empty-text="暂无发送记录">
        <el-table-column label="邮件" min-width="180"><template #default="{ row }">{{ row.subject }}<small class="block">{{ row.recipients.join('、') }}</small></template></el-table-column>
        <el-table-column label="状态" width="125"><template #default="{ row }">{{ row.state === 'sent' ? 'SMTP 已接受' : row.state === 'failed' ? '重试耗尽' : settings.enabled || row.kind === 'test' ? '等待发送 / 重试' : '已暂停' }}<div>尝试 {{ row.attempts }} 次</div></template></el-table-column>
        <el-table-column label="下次重试 / 失败原因" min-width="200"><template #default="{ row }">{{ date(row.nextAttemptAt) }}<div>{{ row.lastError || '—' }}</div></template></el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header><h2>外部 Agent 主动查询</h2></template>
      <p>Service / 主机整体离线时无法自行发邮件。外部 Agent 应以连续查询失败发现服务离线。</p>
      <p>只读 Token：{{ settingsReady ? readTokenConfigured ? '服务端已配置' : '服务端未配置' : '尚未查询' }}。在服务端设置 <code>A3ST_OPS_READ_TOKEN</code> 并重启 Service，必须与管理 Token 不同。通过 Authorization: Bearer 发送，不放入 URL。</p>
      <ul><li><code>GET /api/v1/ops/events?after=&lt;cursor&gt;&amp;limit=100</code></li><li><code>GET /api/v1/servers/:uuid/health</code></li><li><code>GET /api/v1/ops/maintenance/:id</code></li></ul>
      <p>建议每 30 秒查询；处理完一页后按主机持久保存 nextCursor，hasMore 为真则继续补拉。410 CURSOR_EXPIRED 时从 earliestCursor 重新同步；已解决事件保留 30 天，未解决事件保留。只读 Token 不能确认已读、执行任务或更改配置。</p>
    </el-card>
  </section>
</template>

<style scoped>
.ops-page { display: grid; gap: 16px; min-width: 0; }
.ops-page h2, .ops-page h3 { font-size: 16px; margin: 0; }
.ops-page p { margin: 10px 0; line-height: 1.6; overflow-wrap: anywhere; }
.heading, .toolbar { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.toolbar { justify-content: flex-start; margin: 12px 0; }
.settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 4px 20px; margin-top: 16px; }
.block { display: block; }
code, small { overflow-wrap: anywhere; }
.el-card { min-width: 0; }
.el-table { margin: 12px 0; }
</style>
