<script setup lang="ts">
import { ref, onMounted } from "vue";import { ElMessage } from "element-plus";import { useConnectionsStore } from "@/stores/connections";
import { applyDefaults } from "@/utils/defaults";
const props=defineProps<{connectionId:string;serverUuid:string}>();const store=useConnectionsStore();const cfg=ref<Record<string,unknown>>({});const loading=ref(false);const b=()=>(cfg.value.basic??{})as Record<string,unknown>;const st=()=>(cfg.value.startup??{})as Record<string,unknown>;
onMounted(load);async function load(){loading.value=true;try{const c=store.getClient();if(!c)return;const r=await c.getConfig(props.serverUuid);if(r.success)cfg.value=applyDefaults(r.data as Record<string,unknown>);}finally{loading.value=false}}
async function save(){try{const c=store.getClient();if(!c)return;await c.patchConfig(props.serverUuid,{basic:b(),startup:st()}as never);ElMessage.success("已保存")}catch(e){ElMessage.error(e instanceof Error?e.message:"保存失败")}}
</script>
<template><div class="page" v-loading="loading">
<div class="toolbar"><el-button size="small" type="primary" @click="save">保存</el-button></div>
<div class="body">
<fieldset><legend>简易设置 (按上行带宽)</legend>
<div class="row"><label>上行带宽(Mbps)</label><el-input-number v-model="st().uploadMbps" :min="1" :max="10000" size="small" controls-position="right"/></div>
</fieldset>
<fieldset><legend>专业设置 (basic.cfg 参数)</legend>
<div class="row"><label>MaxMsgSend</label><el-input-number v-model="b().maxMsgSend" :min="64" :max="512" size="small" controls-position="right"/></div>
<div class="row"><label>MaxSizeGuaranteed</label><el-input-number v-model="b().maxSizeGuaranteed" :min="128" :max="1024" size="small" controls-position="right"/></div>
<div class="row"><label>MaxSizeNonguaranteed</label><el-input-number v-model="b().maxSizeNonguaranteed" :min="64" :max="512" size="small" controls-position="right"/></div>
<div class="row"><label>MinBandwidth</label><el-input-number v-model="b().minBandwidth" :min="16384" :max="1048576" size="small" controls-position="right"/></div>
<div class="row"><label>MaxBandwidth</label><el-input-number v-model="b().maxBandwidth" :min="131072" :max="10485760" size="small" controls-position="right"/></div>
<div class="row"><label>MinErrorToSend</label><el-input-number v-model="b().minErrorToSend" :min="0" :max="1" :step="0.001" size="small" controls-position="right"/></div>
<div class="row"><label>MinErrorToSendNear</label><el-input-number v-model="b().minErrorToSendNear" :min="0" :max="1" :step="0.001" size="small" controls-position="right"/></div>
<div class="row"><label>MaxPacketSize</label><el-input-number v-model="b().maxPacketSize" :min="500" :max="2000" size="small" controls-position="right"/></div>
<div class="row"><label>MaxCustomFileSize</label><el-input-number v-model="b().maxCustomFileSize" :min="0" :max="100" size="small" controls-position="right"/></div>
</fieldset>
<fieldset><legend>超时 / 限制</legend>
<div class="row"><label>断线超时(秒)</label><el-input-number v-model="b().disconnectTimeout" :min="0" :max="600" size="small" controls-position="right"/></div>
<div class="row"><label>最大 Desync</label><el-input-number v-model="b().maxDesync" :min="50" :max="500" size="small" controls-position="right"/></div>
<div class="row"><label>最大 Ping</label><el-input-number v-model="b().maxPing" :min="50" :max="500" size="small" controls-position="right"/></div>
<div class="row"><label>最大丢包</label><el-input-number v-model="b().maxPacketLoss" :min="0" :max="50" size="small" controls-position="right"/></div>
</fieldset>
<fieldset><legend>开关</legend>
<div class="row"><label>UPnP</label><el-switch v-model="b().upnp" size="small"/></div>
<div class="row"><label>Loopback</label><el-switch v-model="b().loopback" size="small"/></div>
<div class="row"><label>带宽算法</label><el-switch v-model="b().bandwidthAlg" size="small"/></div>
</fieldset>
</div></div>
</template>
<style scoped>.page{height:100%;display:flex;flex-direction:column}.toolbar{padding:6px 8px;display:flex;gap:4px;border-bottom:1px solid var(--el-border-color);flex-shrink:0}.body{flex:1;overflow-y:auto;padding:8px}fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}legend{font-size:12px;font-weight:600;padding:0 4px}.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.row label{width:160px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}</style>
