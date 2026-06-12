<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";
const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "安全", () => ({ basic: b(), battleye: be() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const be = () => (cfg.value.battleye ?? {}) as Record<string, unknown>;
</script>
<template><ConsolePageLayout v-loading="loading">
<fieldset><legend>BattlEye</legend>
<div class="row"><label>BattlEye</label><el-switch v-model="b().battlEye" size="small"/></div>
<div class="row"><label>签名验证</label><el-select v-model="b().verifySignatures" size="small"><el-option :value="0" label="关闭"/><el-option :value="1" label="警告"/><el-option :value="2" label="禁止"/></el-select></div>
<div class="row"><label>踢出重复</label><el-switch v-model="b().kickDuplicate" size="small"/></div>
<div class="row"><label>允许文件修补</label><el-select v-model="b().allowedFilePatching" size="small"><el-option :value="0" label="禁止"/><el-option :value="1" label="客户端"/><el-option :value="2" label="所有人"/></el-select></div>
<div class="row"><label>文件修补例外</label><el-input v-model="b().filePatchingExceptions" placeholder="逗号分隔的 Steam64 ID" size="small"/></div>
<div class="row"><label>BE 最大 Ping</label><el-input-number v-model="be().beMaxPing" :min="0" :max="500" size="small" controls-position="right"/></div>
</fieldset>
<fieldset><legend>密码 / 管理员</legend>
<div class="row"><label>Server Cmd 密码</label><el-input v-model="b().serverCommandPassword" type="password" show-password size="small"/></div>
<div class="row"><label>管理员 UID</label><el-input v-model="b().admins" type="textarea" :rows="2" placeholder="每行一个" size="small"/></div>
<div class="row"><label>双ID检测</label><el-input v-model="b().doubleIdDetected" placeholder="动作: kick/ban" size="small"/></div>
</fieldset>
<fieldset><legend>RCon</legend>
<div class="row"><label>RCon 密码</label><el-input v-model="be().rconPassword" type="password" show-password size="small"/></div>
<div class="row"><label>RCon 端口</label><el-input-number v-model="be().rconPort" :min="1024" :max="65535" size="small" controls-position="right"/></div>
<div class="row"><label>RCon 地址</label><el-input v-model="be().rconHost" size="small"/></div>
</fieldset>
<fieldset><legend>事件回调</legend>
<div class="row"><label>玩家进入</label><el-input v-model="b().onUserConnected" placeholder="[]" size="small"/></div>
<div class="row"><label>玩家离开</label><el-input v-model="b().onUserDisconnected" placeholder="[]" size="small"/></div>
<div class="row"><label>玩家被踢</label><el-input v-model="b().onUserKicked" placeholder="[]" size="small"/></div>
<div class="row"><label>定时检查</label><el-input v-model="b().regularCheck" placeholder="[]" size="small"/></div>
<div class="row"><label>篡改数据</label><el-input v-model="b().onHackedData" placeholder="[]" size="small"/></div>
<div class="row"><label>不同数据</label><el-input v-model="b().onDifferentData" placeholder="[]" size="small"/></div>
<div class="row"><label>未签名数据</label><el-input v-model="b().onUnsignedData" placeholder="[]" size="small"/></div>
</fieldset>
<fieldset><legend>文件安全</legend>
<div class="row"><label>允许加载文件</label><el-input v-model="b().allowedLoadFile" size="small"/></div>
<div class="row"><label>允许预处理</label><el-input v-model="b().allowedPreprocess" size="small"/></div>
<div class="row"><label>允许 HTML 加载</label><el-input v-model="b().allowedHtmlLoad" size="small"/></div>
<div class="row"><label>允许 HTML URI</label><el-input v-model="b().allowedHtmlUri" size="small"/></div>
</fieldset>
<fieldset><legend>载具 / 生成限制</legend>
<div class="row"><label>最大创建载具数</label><el-input-number v-model="b().maxCreateVehicleCount" :min="0" :max="1000" size="small" controls-position="right"/></div>
<div class="row"><label>创建秒数窗口</label><el-input-number v-model="b().maxCreateVehicleSeconds" :min="0" :max="999" size="small" controls-position="right"/></div>
<div class="row"><label>最大 SetPos 数</label><el-input-number v-model="b().maxSetPosCount" :min="0" :max="1000" size="small" controls-position="right"/></div>
<div class="row"><label>SetPos 秒数窗口</label><el-input-number v-model="b().maxSetPosSeconds" :min="0" :max="999" size="small" controls-position="right"/></div>
</fieldset>
</ConsolePageLayout>
</template>
<style scoped>fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}legend{font-size:12px;font-weight:600;padding:0 4px}.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.row label{width:120px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}</style>
