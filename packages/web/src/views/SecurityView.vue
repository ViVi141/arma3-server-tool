<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const { cfg, loading } = useSettingsPage(props.serverUuid, "安全", () => ({ basic: b(), battleye: be() }));
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const be = () => (cfg.value.battleye ?? {}) as Record<string, unknown>;
</script>

<template>
  <ConsolePageLayout v-loading="loading">
    <ArkTechPanel title="BattlEye" code="SEC-01">
      <div class="form-row"><label>BattlEye</label><el-switch v-model="b().battlEye" size="small"/></div>
      <div class="form-row"><label>签名验证</label><el-select v-model="b().verifySignatures" size="small"><el-option :value="0" label="关闭"/><el-option :value="1" label="警告"/><el-option :value="2" label="禁止"/></el-select></div>
      <div class="form-row"><label>踢出重复</label><el-switch v-model="b().kickDuplicate" size="small"/></div>
      <div class="form-row"><label>允许文件修补</label><el-select v-model="b().allowedFilePatching" size="small"><el-option :value="0" label="禁止"/><el-option :value="1" label="客户端"/><el-option :value="2" label="所有人"/></el-select></div>
      <div class="form-row"><label>文件修补例外</label><el-input v-model="b().filePatchingExceptions" placeholder="逗号分隔的 Steam64 ID" size="small"/></div>
      <div class="form-row"><label>BE 最大 Ping</label><el-input-number v-model="be().beMaxPing" :min="0" :max="500" size="small" controls-position="right"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="密码 / 管理员" code="SEC-02">
      <div class="form-row"><label>Server Cmd 密码</label><el-input v-model="b().serverCommandPassword" type="password" show-password size="small"/></div>
      <div class="form-row"><label>管理员 UID</label><el-input v-model="b().admins" type="textarea" :rows="2" placeholder="每行一个" size="small"/></div>
      <div class="form-row"><label>双ID检测</label><el-input v-model="b().doubleIdDetected" placeholder="动作: kick/ban" size="small"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="RCon">
      <div class="form-row"><label>RCon 密码</label><el-input v-model="be().rconPassword" type="password" show-password size="small"/></div>
      <div class="form-row"><label>RCon 端口</label><el-input-number v-model="be().rconPort" :min="1024" :max="65535" size="small" controls-position="right"/></div>
      <div class="form-row"><label>RCon 地址</label><el-input v-model="be().rconHost" size="small"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="事件回调" code="SEC-03">
      <div class="form-row"><label>玩家进入</label><el-input v-model="b().onUserConnected" placeholder="[]" size="small"/></div>
      <div class="form-row"><label>玩家离开</label><el-input v-model="b().onUserDisconnected" placeholder="[]" size="small"/></div>
      <div class="form-row"><label>玩家被踢</label><el-input v-model="b().onUserKicked" placeholder="[]" size="small"/></div>
      <div class="form-row"><label>定时检查</label><el-input v-model="b().regularCheck" placeholder="[]" size="small"/></div>
      <div class="form-row"><label>篡改数据</label><el-input v-model="b().onHackedData" placeholder="[]" size="small"/></div>
      <div class="form-row"><label>不同数据</label><el-input v-model="b().onDifferentData" placeholder="[]" size="small"/></div>
      <div class="form-row"><label>未签名数据</label><el-input v-model="b().onUnsignedData" placeholder="[]" size="small"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="文件安全">
      <div class="form-row"><label>允许加载文件</label><el-input v-model="b().allowedLoadFile" size="small"/></div>
      <div class="form-row"><label>允许预处理</label><el-input v-model="b().allowedPreprocess" size="small"/></div>
      <div class="form-row"><label>允许 HTML 加载</label><el-input v-model="b().allowedHtmlLoad" size="small"/></div>
      <div class="form-row"><label>允许 HTML URI</label><el-input v-model="b().allowedHtmlUri" size="small"/></div>
    </ArkTechPanel>
    <ArkTechPanel title="载具 / 生成限制" code="SEC-04">
      <div class="form-row"><label>最大创建载具数</label><el-input-number v-model="b().maxCreateVehicleCount" :min="0" :max="1000" size="small" controls-position="right"/></div>
      <div class="form-row"><label>创建秒数窗口</label><el-input-number v-model="b().maxCreateVehicleSeconds" :min="0" :max="999" size="small" controls-position="right"/></div>
      <div class="form-row"><label>最大 SetPos 数</label><el-input-number v-model="b().maxSetPosCount" :min="0" :max="1000" size="small" controls-position="right"/></div>
      <div class="form-row"><label>SetPos 秒数窗口</label><el-input-number v-model="b().maxSetPosSeconds" :min="0" :max="999" size="small" controls-position="right"/></div>
    </ArkTechPanel>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 120px; }
</style>
