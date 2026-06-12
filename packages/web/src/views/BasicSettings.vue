<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { useSettingsPage } from "@/composables/useSettingsPage";
import { useConnectionsStore } from "@/stores/connections";
import { ElMessage } from "element-plus";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const { cfg, loading, saving } = useSettingsPage(props.serverUuid, "基本设置", () => ({
  server: srv(),
  basic: b(),
  startup: st(),
}));

const srv = () => (cfg.value.server ?? {}) as Record<string, unknown>;
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const st = () => (cfg.value.startup ?? {}) as Record<string, unknown>;

async function act(action: string) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
    ElMessage.success("已执行");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "失败");
  }
}
</script>

<template>
  <ConsolePageLayout v-loading="loading">
    <template #hint>修改后使用顶栏「保存」写入配置包；「写入服务器」才会生成 game cfg。</template>
      <fieldset><legend>基础</legend>
        <div class="row"><label>配置名称</label><el-input v-model="srv().configName" size="small"/></div>
        <div class="row"><label>服务器目录</label><el-input v-model="srv().serverDir" size="small"/></div>
        <div class="row"><label>可执行文件</label><el-input v-model="srv().executable" size="small"/></div>
        <div class="row"><label>x64</label><el-switch v-model="srv().x64" size="small"/></div>
      </fieldset>
      <fieldset><legend>服务器</legend>
        <div class="row"><label>服务器名</label><el-input v-model="b().hostname" size="small"/></div>
        <div class="row"><label>最大玩家</label><el-input-number v-model="b().maxPlayers" :min="2" :max="200" size="small" controls-position="right"/></div>
        <div class="row"><label>端口</label><el-input-number v-model="st().port" :min="1024" :max="65535" size="small" controls-position="right"/></div>
        <div class="row"><label>密码</label><el-input v-model="b().password" type="password" show-password size="small"/></div>
        <div class="row"><label>管理员密码</label><el-input v-model="b().passwordAdmin" type="password" show-password size="small"/></div>
        <div class="row"><label>Persistent</label><el-switch v-model="b().persistent" size="small"/></div>
        <div class="row"><label>AutoInit</label><el-switch v-model="st().autoInit" size="small"/></div>
        <div class="row"><label>跳过大厅</label><el-switch v-model="b().skipLobby" size="small"/></div>
        <div class="row"><label>地图绘画</label><el-switch v-model="b().drawingInMap" size="small"/></div>
        <div class="row"><label>启用统计</label><el-switch v-model="b().statisticsEnabled" size="small"/></div>
        <div class="row"><label>旋翼模拟</label><el-select v-model="b().forceRotorLibSimulation" size="small"><el-option value="0" label="自动"/><el-option value="1" label="客户端"/><el-option value="2" label="禁用"/></el-select></div>
        <div class="row"><label>BattlEye</label><el-switch v-model="b().battlEye" size="small"/></div>
      </fieldset>
      <fieldset><legend>MOTD / 欢迎语</legend>
        <div class="row"><label>欢迎语</label><el-input v-model="b().motd" type="textarea" :rows="2" size="small"/></div>
        <div class="row"><label>MOTD 间隔(秒)</label><el-input-number v-model="b().motdInterval" :min="1" :max="600" size="small" controls-position="right"/></div>
      </fieldset>
      <fieldset><legend>语音 (VoN)</legend>
        <div class="row"><label>禁用 VoN</label><el-switch v-model="b().disableVoN" size="small"/></div>
        <div class="row"><label>VoN 质量</label><el-input-number v-model="b().vonCodecQuality" :min="1" :max="30" size="small" controls-position="right"/></div>
        <div class="row"><label>VoN 编码</label><el-select v-model="b().vonCodec" size="small"><el-option label="SPEEX"/><el-option label="OPUS"/></el-select></div>
      </fieldset>
      <fieldset><legend>无头客户端</legend>
        <div class="row"><label>启用 HC</label><el-switch v-model="b().enableHeadlessClient" size="small"/></div>
        <div class="row"><label>HC IP 列表</label><el-input v-model="b().headlessClients" placeholder="127.0.0.1,192.168.1.10" size="small"/></div>
        <div class="row"><label>本机客户端</label><el-input v-model="b().localClient" placeholder="127.0.0.1" size="small"/></div>
        <div class="row"><label>HC 控制</label>
          <el-button size="small" :loading="saving" @click="act('start_headless_client')">启动无头客户端</el-button>
          <el-button size="small" @click="act('stop_headless_client')">停止无头客户端</el-button>
        </div>
      </fieldset>
      <fieldset><legend>投票 / 超时</legend>
        <div class="row"><label>投票阈值</label><el-input-number v-model="b().voteThreshold" :min="1" :max="100" size="small" controls-position="right"/></div>
        <div class="row"><label>投票超时(秒)</label><el-input-number v-model="b().votingTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="row"><label>角色超时(秒)</label><el-input-number v-model="b().roleTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="row"><label>Briefing超时(秒)</label><el-input-number v-model="b().briefingTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="row"><label>Debriefing超时(秒)</label><el-input-number v-model="b().debriefingTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="row"><label>大厅超时(秒)</label><el-input-number v-model="b().lobbyIdleTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="row"><label>任务投票人数</label><el-input-number v-model="b().voteMissionPlayers" :min="0" :max="100" size="small" controls-position="right"/></div>
      </fieldset>
      <fieldset><legend>文件 / 杂项</legend>
        <div class="row"><label>PID 文件</label><el-input v-model="b().pidFile" size="small"/></div>
        <div class="row"><label>Ranking 文件</label><el-input v-model="b().rankingFile" size="small"/></div>
      </fieldset>
      <fieldset><legend>附加参数 (Base64 编码)</legend>
        <div class="row"><label>server.cfg 附加</label><el-input v-model="b().serverCfgArgs" type="textarea" :rows="2" size="small"/></div>
        <div class="row"><label>basic.cfg 附加</label><el-input v-model="b().basicCfgArgs" type="textarea" :rows="2" size="small"/></div>
        <div class="row"><label>启动参数附加</label><el-input v-model="st().startArgs" type="textarea" :rows="2" size="small"/></div>
        <div class="row"><label>Profile 附加</label><el-input v-model="b().profileArgs" type="textarea" :rows="2" size="small"/></div>
      </fieldset>
  </ConsolePageLayout>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.row label { width: 120px; font-size: 12px; color: var(--el-text-color-secondary); flex-shrink: 0; text-align: right; }
fieldset { border: 1px solid var(--el-border-color-light); padding: 8px 12px; margin-bottom: 8px; }
legend { font-size: 12px; font-weight: 600; padding: 0 4px; }
</style>
