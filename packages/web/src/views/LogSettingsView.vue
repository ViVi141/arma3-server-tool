<script setup lang="ts">
import { ref, onMounted } from "vue";import { ElMessage } from "element-plus";import { useConnectionsStore } from "@/stores/connections";
import { applyDefaults } from "@/utils/defaults";
const props=defineProps<{connectionId:string;serverUuid:string}>();const store=useConnectionsStore();const cfg=ref<Record<string,unknown>>({});const loading=ref(false);const b=()=>(cfg.value.basic??{})as Record<string,unknown>;
onMounted(load);async function load(){loading.value=true;try{const c=store.getClient();if(!c)return;const r=await c.getConfig(props.serverUuid);if(r.success)cfg.value=applyDefaults(r.data as Record<string,unknown>);}finally{loading.value=false}}
async function save(){try{const c=store.getClient();if(!c)return;await c.patchConfig(props.serverUuid,{basic:b()}as never);ElMessage.success("已保存")}catch(e){ElMessage.error(e instanceof Error?e.message:"保存失败")}}
</script>
<template><div class="page" v-loading="loading">
<div class="toolbar"><el-button size="small" type="primary" @click="save">保存</el-button></div>
<div class="body">
<fieldset><legend>日志选项</legend>
<div class="row"><label>禁用 RPT (-noLogs)</label><el-switch v-model="b().noLogs" size="small"/></div>
<div class="row"><label>网络日志 (-netlog)</label><el-switch v-model="b().netLog" size="small"/></div>
<div class="row"><label>日志文件</label><el-input v-model="b().logFile" placeholder="server_console.log" size="small"/></div>
<div class="row"><label>时间戳格式</label><el-select v-model="b().timeStampFormat" size="small"><el-option :value="0" label="无"/><el-option :value="1" label="简短"/><el-option :value="2" label="完整"/></el-select></div>
<div class="row"><label>扩展调用上限</label><el-input-number v-model="b().callExtReportLimit" :min="1" :max="60000" size="small" controls-position="right"/></div>
</fieldset>
</div></div>
</template>
<style scoped>.page{height:100%;display:flex;flex-direction:column}.toolbar{padding:6px 8px;display:flex;gap:4px;border-bottom:1px solid var(--el-border-color);flex-shrink:0}.body{flex:1;overflow-y:auto;padding:8px}fieldset{border:1px solid var(--el-border-color-light);padding:8px 12px;margin-bottom:8px}legend{font-size:12px;font-weight:600;padding:0 4px}.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.row label{width:120px;font-size:12px;color:var(--el-text-color-secondary);flex-shrink:0;text-align:right}</style>
