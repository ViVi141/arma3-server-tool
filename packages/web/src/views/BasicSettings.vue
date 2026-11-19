<script setup lang="ts">
import ParamHint from "@/components/console/ParamHint.vue";
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import SettingsViewLayout from "@/components/console/SettingsViewLayout.vue";
import ArkTechPanel from "@/components/console/ArkTechPanel.vue";
import PathInput from "@/components/PathInput.vue";
import { UI_COPY } from "@/constants/uiCopy";
import { useSettingsPage } from "@/composables/useSettingsPage";
import { useConnectionsStore } from "@/stores/connections";
import { ElMessage } from "element-plus";
import { computed } from "vue";
import { asConfigString } from "@/utils/configStringField";
import { resolveTaskMessage, taskSucceeded } from "@/utils/taskSteps";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const { cfg, loading, saving, save, resetAll } = useSettingsPage(() => props.serverUuid, "基本设置", () => ({
  server: srv(),
  basic: b(),
  startup: st(),
}));

const srv = () => (cfg.value.server ?? {}) as Record<string, unknown>;
const b = () => (cfg.value.basic ?? {}) as Record<string, unknown>;
const st = () => (cfg.value.startup ?? {}) as Record<string, unknown>;

// forceRotorLibSimulation 是 0/1/2 的数值枚举；老配置里可能是字符串 "0"，
// 直接给 el-select 绑定数值选项会显示空白，这里统一按数字读写。
const voteThresholdPercent = computed({
  get: () => {
    const raw = Number(b().voteThreshold ?? 0.5);
    const fraction = raw > 1 ? raw / 100 : raw;
    return Math.round(fraction * 100);
  },
  set: (percent: number) => {
    b().voteThreshold = Math.round(percent) / 100;
  },
});

function normalizeVonCodec(value: unknown): number {
  if (typeof value === "number") {
    return value === 0 ? 0 : 1;
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "0" || text === "speex") {
    return 0;
  }
  return 1;
}

const vonCodec = computed({
  get: () => normalizeVonCodec(b().vonCodec),
  set: (value: number) => {
    b().vonCodec = value;
  },
});

const rotorSim = computed({
  get: () => Number(b().forceRotorLibSimulation ?? 0),
  set: (value: number) => {
    b().forceRotorLibSimulation = value;
  },
});

async function act(action: string) {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
    const msg = resolveTaskMessage(res.data as never, "操作完成");
    if (taskSucceeded(res.data as never)) {
      ElMessage.success(msg);
    } else {
      ElMessage.warning(msg);
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "失败");
  }
}
</script>

<template>
  <ConsolePageLayout v-loading="loading" :padded="false">
    <SettingsViewLayout
      kicker="CONFIG / 05 · BASIC"
      title="基本设置"
      :hint="`修改后点「${UI_COPY.saveShort}」写入配置包；再点顶栏「${UI_COPY.applyChanges}」，会写入 cfg，运行中可选择立即重启。`"
      :show-save="true"
      :allow-reset="true"
      @reset="resetAll"
      :saving="saving"
      @save="save"
    >
      <ArkTechPanel title="基础" code="CFG-01">
        <div class="form-row"><label>配置名称</label><el-input v-model="srv().configName" size="small"/></div>
        <div class="form-row"><label>服务器目录</label><PathInput :model-value="asConfigString(srv().serverDir)" mode="directory" placeholder="D:\arma3_server" @update:model-value="(v) => { srv().serverDir = v }"/></div>
        <div class="form-row"><label>可执行文件</label><PathInput :model-value="asConfigString(srv().executable)" mode="file" :file-filters="[{ name: '可执行文件', extensions: ['exe'] }]" placeholder="arma3server_x64.exe 或完整路径" @update:model-value="(v) => { srv().executable = v }"/></div>
        <div class="form-row">
          <el-checkbox v-model="srv().x64" size="small">x64</el-checkbox>
          <ParamHint path="server.x64" />
        </div>
      </ArkTechPanel>
      <ArkTechPanel title="服务器" code="CFG-02">
        <div class="form-row"><label>服务器名</label><el-input v-model="b().hostname" size="small"/></div>
        <div class="form-row"><label>最大玩家</label><el-input-number v-model="b().maxPlayers" :min="2" :max="200" size="small" controls-position="right"/></div>
        <div class="form-row"><label>端口</label><el-input-number v-model="st().port" :min="1024" :max="65535" size="small" controls-position="right"/></div>
        <div class="form-row"><label>密码</label><el-input v-model="b().password" type="password" show-password size="small"/></div>
        <div class="form-row"><label>管理员密码</label><el-input v-model="b().passwordAdmin" type="password" show-password size="small"/></div>
        <div class="form-row">
          <el-checkbox v-model="b().persistent" size="small">持久化配置（Persistent）</el-checkbox>
          <ParamHint path="basic.persistent" />
        </div>
        <div class="form-row">
          <el-checkbox v-model="st().autoInit" size="small">自动初始化（AutoInit）</el-checkbox>
          <ParamHint path="startup.autoInit" />
        </div>
        <div class="form-row">
          <el-checkbox v-model="b().skipLobby" size="small">跳过大厅</el-checkbox>
          <ParamHint path="basic.skipLobby" />
        </div>
        <div class="form-row">
          <el-checkbox v-model="b().drawingInMap" size="small">允许玩家在地图上绘图</el-checkbox>
          <ParamHint
            path="basic.drawingInMap"
            note="开启后玩家可在战术地图上画线、标记与打字；关闭则全员失去绘图能力。"
          />
        </div>
        <div class="form-row">
          <el-checkbox v-model="b().statisticsEnabled" size="small">启用统计</el-checkbox>
          <ParamHint path="basic.statisticsEnabled" />
        </div>
        <div class="form-row">
          <label>飞行模型（forceRotorLibSimulation）</label>
          <el-select v-model="rotorSim" size="small">
            <el-option :value="0" label="不强制：由玩家自选（默认）" />
            <el-option :value="1" label="强制高级飞行模型（AFM / RotorLib）" />
            <el-option :value="2" label="强制标准飞行模型（SFM）" />
          </el-select>
          <ParamHint
            path="basic.forceRotorLibSimulation"
            note="0 = 玩家各自选择；1 = 所有玩家强制真实旋翼物理；2 = 强制简化飞行模型。"
          />
        </div>
        <div class="form-row">
          <el-checkbox v-model="b().battlEye" size="small">BattlEye 反作弊</el-checkbox>
          <ParamHint path="basic.battlEye" />
        </div>
      </ArkTechPanel>
      <ArkTechPanel title="欢迎语（MOTD）">
        <div class="form-row"><label>欢迎语</label><el-input v-model="b().motd" type="textarea" :rows="2" size="small"/></div>
        <div class="form-row"><label>欢迎语轮播间隔（秒）</label><el-input-number v-model="b().motdInterval" :min="1" :max="600" size="small" controls-position="right"/></div>
      </ArkTechPanel>
      <ArkTechPanel title="语音（VoN）" code="CFG-03">
        <div class="form-row">
          <el-checkbox v-model="b().disableVoN" size="small">禁用 VoN 语音</el-checkbox>
          <ParamHint path="basic.disableVoN" />
        </div>
        <div class="form-row"><label>语音质量（VoN）</label><el-input-number v-model="b().vonCodecQuality" :min="1" :max="30" size="small" controls-position="right"/></div>
        <div class="form-row"><label>语音编码（VoN）</label>
          <el-select v-model="vonCodec" size="small">
            <el-option :value="0" label="SPEEX（旧编码，0）" />
            <el-option :value="1" label="OPUS（新编码，1）" />
          </el-select>
          <ParamHint path="basic.vonCodec" />
        </div>
      </ArkTechPanel>
      <ArkTechPanel title="无头客户端">
        <div class="form-row">
          <el-checkbox v-model="b().enableHeadlessClient" size="small">启用 HC（无头客户端）</el-checkbox>
          <ParamHint path="basic.enableHeadlessClient" />
        </div>
        <div class="form-row"><label>HC 地址列表</label><el-input v-model="b().headlessClients" placeholder="127.0.0.1,192.168.1.10" size="small"/></div>
        <div class="form-row"><label>本机客户端</label><el-input v-model="b().localClient" placeholder="127.0.0.1" size="small"/></div>
        <div class="form-row"><label>无头客户端进程</label>
          <el-button size="small" :loading="saving" @click="act('start_headless_client')">启动无头客户端</el-button>
          <el-button size="small" @click="act('stop_headless_client')">停止无头客户端</el-button>
        </div>
      </ArkTechPanel>
      <ArkTechPanel title="投票 / 超时">
        <div class="form-row">
          <label>投票通过比例（voteThreshold，%）</label>
          <el-input-number v-model="voteThresholdPercent" :min="0" :max="100" :step="5" size="small" controls-position="right"/>
          <ParamHint path="basic.voteThreshold" note="官方以 0~1 的比例表示：0.5 = 过半，0.33 = 三分之一。" />
        </div>
        <div class="form-row"><label>投票超时(秒)</label><el-input-number v-model="b().votingTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="form-row"><label>角色超时(秒)</label><el-input-number v-model="b().roleTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="form-row"><label>任务简报超时（秒）</label><el-input-number v-model="b().briefingTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="form-row"><label>任务总结超时（秒）</label><el-input-number v-model="b().debriefingTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="form-row"><label>大厅超时(秒)</label><el-input-number v-model="b().lobbyIdleTimeout" :min="0" :max="999" size="small" controls-position="right"/></div>
        <div class="form-row"><label>任务投票人数</label><el-input-number v-model="b().voteMissionPlayers" :min="0" :max="100" size="small" controls-position="right"/></div>
      </ArkTechPanel>
      <ArkTechPanel title="文件 / 杂项">
        <div class="form-row"><label>PID 文件</label><PathInput :model-value="asConfigString(b().pidFile)" mode="file" placeholder="可选" @update:model-value="(v) => { b().pidFile = v }"/></div>
        <div class="form-row"><label>Ranking 文件</label><PathInput :model-value="asConfigString(b().rankingFile)" mode="file" placeholder="可选" @update:model-value="(v) => { b().rankingFile = v }"/></div>
      </ArkTechPanel>
      <ArkTechPanel title="追加参数" code="CFG-04">
        <div class="form-row"><label>server.cfg 追加</label><el-input v-model="b().serverCfgArgs" type="textarea" :rows="2" size="small"/></div>
        <div class="form-row"><label>basic.cfg 追加</label><el-input v-model="b().basicCfgArgs" type="textarea" :rows="2" size="small"/></div>
        <div class="form-row"><label>启动参数追加</label><el-input v-model="st().startArgs" type="textarea" :rows="2" size="small"/></div>
        <div class="form-row"><label>Profile 追加</label><el-input v-model="b().profileArgs" type="textarea" :rows="2" size="small"/></div>
      </ArkTechPanel>
    </SettingsViewLayout>
  </ConsolePageLayout>
</template>

<style scoped>
.form-row label { width: 120px; }
</style>