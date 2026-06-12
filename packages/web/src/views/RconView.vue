<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import type { RconPlayerRow } from "@a3st/api-client";
import { parseRconBans, parseRconMissions } from "@/utils/rcon-parse";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const players = ref<RconPlayerRow[]>([]);
const selectedPlayer = ref<RconPlayerRow | null>(null);
const bans = ref<{ id: number; guid: string; ip: string; duration: string; reason: string }[]>([]);
const missions = ref<{ map: string; mission: string }[]>([]);
const loading = ref(false);
const connected = ref(false);
const statusText = ref("未连接");
const activeTab = ref("players");

const kickReason = ref("管理员踢出");
const banDuration = ref(60);
const broadcastText = ref("");
const playerMessageTarget = ref("");
const playerMessage = ref("");
const newRconPassword = ref("");

async function doAction(action: string, extra: Record<string, unknown> = {}) {
  try {
    const client = store.getClient();
    if (!client) {
      return null;
    }
    const res = await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: action as never, ...extra }],
    });
    ElMessage.success("已执行");
    return res;
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "操作失败");
    return null;
  }
}

async function connectRcon() {
  loading.value = true;
  statusText.value = "连接中...";
  try {
    await refreshPlayers();
    connected.value = true;
    statusText.value = `已连接，在线 ${players.value.length} 人`;
  } catch (e) {
    connected.value = false;
    statusText.value = e instanceof Error ? e.message : "连接失败";
  } finally {
    loading.value = false;
  }
}

async function refreshPlayers() {
  const client = store.getClient();
  if (!client) {
    return;
  }

  const res = await client.getRconPlayers(props.serverUuid);
  if (!res.success) {
    connected.value = false;
    throw new Error(res.error ?? "RCon 连接失败");
  }

  players.value = res.data.players ?? [];
  connected.value = true;
  statusText.value = `已连接，在线 ${players.value.length} 人`;

  if (selectedPlayer.value) {
    const stillOnline = players.value.find((p) => p.num === selectedPlayer.value?.num);
    if (!stillOnline) {
      selectedPlayer.value = null;
    }
  }
}

function onPlayerRowClick(row: RconPlayerRow) {
  selectedPlayer.value = row;
}

function activePlayer(): RconPlayerRow | null {
  if (selectedPlayer.value) {
    return selectedPlayer.value;
  }
  if (players.value.length > 0) {
    return players.value[0];
  }
  return null;
}

async function kickSelected() {
  const sel = activePlayer();
  if (!sel) {
    return;
  }
  await doAction("rcon_kick", { playerId: String(sel.num), reason: kickReason.value });
  await refreshPlayers();
}

async function banTemp() {
  const sel = activePlayer();
  if (!sel) {
    return;
  }
  await doAction("rcon_ban", { playerGuid: sel.guid, playerId: banDuration.value, reason: "临时封禁" });
}

async function banPerm() {
  const sel = activePlayer();
  if (!sel) {
    return;
  }
  await doAction("rcon_ban", { playerGuid: sel.guid, playerId: 0, reason: "永久封禁" });
}

async function syncPlayers() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const res = await client.syncMonitoringPlayers(props.serverUuid);
    if (res.success) {
      ElMessage.success(`已同步 ${res.data.synced ?? 0} 名玩家到玩家库`);
    } else {
      ElMessage.warning(res.error ?? "同步失败");
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "同步失败");
  }
}

async function changePwd() {
  if (!newRconPassword.value) {
    return;
  }
  await doAction("rcon_command", { rconCommandText: `#password ${newRconPassword.value}` });
}

function taskMessage(res: unknown): string {
  if (!res || typeof res !== "object") {
    return "";
  }
  const data = (res as { data?: TaskDataLike }).data;
  if (!data) {
    return "";
  }
  if (data.message) {
    return data.message;
  }
  const steps = data.steps ?? [];
  if (steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last.message) {
      return last.message;
    }
  }
  return "";
}

interface TaskDataLike {
  message?: string;
  steps?: { message?: string }[];
}

async function loadBans() {
  const res = await doAction("rcon_command", { rconCommandText: "bans" });
  if (res) {
    const msg = taskMessage(res);
    bans.value = parseRconBans(msg);
    statusText.value = `封禁 ${bans.value.length} 条`;
  }
}

async function saveBans() {
  await doAction("rcon_command", { rconCommandText: "#savebans" });
}

async function removeBan(row: { id: number }) {
  await doAction("rcon_command", { rconCommandText: `#remove ${row.id}` });
  await refreshBans();
}

async function refreshBans() {
  await loadBans();
}

async function refreshMissions() {
  const res = await doAction("rcon_command", { rconCommandText: "missions" });
  if (res) {
    missions.value = parseRconMissions(taskMessage(res));
  }
}

async function loadMission(row: { mission: string }) {
  await doAction("rcon_mission", { missionTemplate: row.mission });
}

async function restartMission() {
  await doAction("rcon_mission", { missionTemplate: "" });
}

const lock = () => doAction("rcon_lock");
const unlock = () => doAction("rcon_unlock");
</script>
<template>
<div class="rcon-page">
<div class="toolbar">
  <el-button size="small" type="primary" @click="connectRcon" :loading="loading">{{ connected ? '已连接' : '连接远程控制' }}</el-button>
  <el-button size="small" @click="refreshPlayers" :disabled="!connected">刷新玩家</el-button>
  <el-button size="small" @click="kickSelected" :disabled="!connected || !players.length">踢出选中</el-button>
  <el-button size="small" @click="banTemp" :disabled="!connected || !players.length">封禁(分钟)</el-button>
  <el-button size="small" @click="banPerm" :disabled="!connected || !players.length">永久封禁</el-button>
  <el-button size="small" @click="syncPlayers" :disabled="!connected">同步到玩家库</el-button>
</div>
<div class="toolbar" style="border-top:none;">
  <el-input v-model="kickReason" placeholder="踢出原因" size="small" style="width:200px"/>
  <span style="font-size:12px;color:var(--el-text-color-secondary);margin:0 4px;">封禁分钟</span>
  <el-input-number v-model="banDuration" :min="1" :max="10080" size="small" controls-position="right" style="width:120px"/>
  <el-input v-model="newRconPassword" type="password" placeholder="新 RCon 密码" size="small" style="width:180px" show-password/>
  <el-button size="small" @click="changePwd">修改RCon密码</el-button>
</div>
<div class="status-line">{{ statusText }}</div>

<el-tabs v-model="activeTab" class="rcon-tabs">
  <el-tab-pane label="在线玩家" name="players">
    <el-table
      :data="players"
      stripe
      size="small"
      highlight-current-row
      @row-click="onPlayerRowClick"
    >
      <el-table-column prop="num" label="序号" width="60"/>
      <el-table-column prop="name" label="昵称" min-width="160"/>
      <el-table-column prop="guid" label="Steam GUID" width="180"/>
      <el-table-column label="操作" width="160">
        <template #default="{row}">
          <el-button size="small" @click.stop="selectedPlayer = row; doAction('rcon_kick',{playerId:String(row.num),reason:kickReason})">踢出</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!players.length" description="点击「连接远程控制」查看在线玩家"/>
  </el-tab-pane>
  <el-tab-pane label="BattlEye 封禁" name="bans">
    <div style="margin-bottom:8px;display:flex;gap:4px">
      <el-button size="small" @click="loadBans">LoadBans</el-button>
      <el-button size="small" @click="saveBans">SaveBans</el-button>
      <el-button size="small" @click="refreshBans">刷新封禁</el-button>
    </div>
    <el-table :data="bans" stripe size="small">
      <el-table-column prop="id" label="序号" width="60"/><el-table-column prop="guid" label="GUID" width="180"/>
      <el-table-column prop="ip" label="IP" width="120"/><el-table-column prop="duration" label="时长" width="80"/>
      <el-table-column prop="reason" label="原因" min-width="120"/>
      <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" @click="removeBan(row)">移除</el-button></template></el-table-column>
    </el-table>
  </el-tab-pane>
  <el-tab-pane label="任务 / 控制" name="controls">
    <div style="margin-bottom:8px;display:flex;gap:4px">
      <el-button size="small" @click="refreshMissions">刷新任务</el-button>
      <el-button size="small" @click="lock">锁服</el-button>
      <el-button size="small" @click="unlock">解锁</el-button>
    </div>
    <el-table :data="missions" stripe size="small">
      <el-table-column prop="map" label="地图" min-width="150"/><el-table-column prop="mission" label="任务" min-width="200"/>
      <el-table-column label="操作" width="160">
        <template #default="{row}"><el-button size="small" @click="loadMission(row)">加载</el-button><el-button size="small" @click="restartMission">重启</el-button></template>
      </el-table-column>
    </el-table>
    <el-divider/>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      <el-input v-model="broadcastText" placeholder="广播消息" size="small" style="width:300px"/>
      <el-button size="small" @click="doAction('rcon_broadcast',{broadcastMessage:broadcastText})">全员广播</el-button>
    </div>
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
      <el-input v-model="playerMessageTarget" placeholder="玩家名或ID" size="small" style="width:120px"/>
      <el-input v-model="playerMessage" placeholder="私信内容" size="small" style="width:300px"/>
      <el-button size="small" @click="doAction('rcon_command',{rconCommandText:`#say ${playerMessageTarget} ${playerMessage}`})">私信玩家</el-button>
    </div>
  </el-tab-pane>
</el-tabs>
</div>
</template>
<style scoped>
.rcon-page{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--a3st-bg)}
.toolbar{padding:4px 8px;display:flex;gap:4px;align-items:center;border-bottom:1px solid var(--a3st-border-subtle);flex-shrink:0;flex-wrap:wrap;background:var(--a3st-toolbar);min-height:28px}
.status-line{padding:3px 8px;font-size:11px;color:var(--a3st-text-dim);border-bottom:1px solid var(--a3st-border-subtle);background:var(--a3st-bg-elevated)}
.rcon-tabs{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.rcon-tabs :deep(.el-tabs){display:flex;flex-direction:column;height:100%;min-height:0}
.rcon-tabs :deep(.el-tabs__header){flex-shrink:0;margin:0;padding:0 8px}
.rcon-tabs :deep(.el-tabs__content){flex:1;min-height:0;overflow:hidden}
.rcon-tabs :deep(.el-tab-pane){height:100%;overflow-y:auto;padding:8px;box-sizing:border-box}
</style>
