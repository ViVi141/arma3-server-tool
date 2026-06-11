<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const players = ref<{ id: number; name: string; guid: string; ip: string }[]>([]);
const bans = ref<{ id: number; guid: string; ip: string; duration: string; reason: string }[]>([]);
const missions = ref<{ map: string; mission: string }[]>([]);
const loading = ref(false);
const connected = ref(false);

// Kick / Ban inputs
const kickPlayerName = ref("");
const kickReason = ref("");
const banDuration = ref(0);

// Broadcast / Message
const broadcastText = ref("");
const playerMessage = ref("");
const playerMessageTarget = ref("");

async function connectRcon() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "rcon_players" as const }] });
    if (res.success) {
      connected.value = true;
      ElMessage.success("RCon 已连接");
      await refreshPlayers();
    }
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "连接失败"); }
  finally { loading.value = false; }
}

async function refreshPlayers() {
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "rcon_players" as const }] });
    const msg = (res.data as { steps?: { message: string }[] })?.steps?.[0]?.message ?? "";
    const match = msg.match(/\[(\d+)\]\s+(.+?)\s+(\w+)\s+(\d+\.\d+\.\d+\.\d+)/g);
    if (match) {
      players.value = match.map((line: string) => {
        const parts = line.match(/\[(\d+)\]\s+(.+?)\s+(\w+)\s+(\d+\.\d+\.\d+\.\d+)/);
        return parts ? { id: parseInt(parts[1]), name: parts[2].trim(), guid: parts[3], ip: parts[4] } : null;
      }).filter(Boolean) as { id: number; name: string; guid: string; ip: string }[];
    }
  } catch { /* ignore */ }
}

async function doAction(action: string, extra: Record<string, unknown> = {}) {
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never, ...extra }] });
    ElMessage.success(`${action} 已执行`);
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
}
</script>

<template>
  <div class="rcon-page">
    <h2>远程控制 (RCon)</h2>

    <div style="margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button type="primary" :loading="loading" @click="connectRcon">{{ connected ? '已连接' : '连接 RCon' }}</el-button>
      <el-button @click="refreshPlayers" :disabled="!connected">刷新玩家</el-button>
    </div>

    <el-row :gutter="12" style="margin-top: 12px;">
      <el-col :span="16">
        <el-card>
          <template #header><span>在线玩家</span></template>
          <el-table v-if="players.length" :data="players" stripe size="small">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="guid" label="GUID" width="140" />
            <el-table-column prop="ip" label="IP" width="120" />
            <el-table-column label="操作" width="200">
              <template #default="{ row }">
                <el-button size="small" @click="doAction('rcon_kick', { playerId: String(row.id), reason: '管理员操作' })">踢出</el-button>
                <el-button size="small" type="danger" @click="doAction('rcon_ban', { playerGuid: row.guid, playerId: row.id, reason: '封禁' })">封禁</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="点击「连接 RCon」查看在线玩家" />
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card style="margin-bottom: 12px;">
          <template #header><span>广播</span></template>
          <el-input v-model="broadcastText" placeholder="广播消息..." size="small" />
          <el-button size="small" style="margin-top: 4px;" @click="doAction('rcon_broadcast', { broadcastMessage: broadcastText })" :disabled="!broadcastText.trim()">发送</el-button>
        </el-card>

        <el-card>
          <template #header><span>私信玩家</span></template>
          <el-input v-model="playerMessageTarget" placeholder="玩家名或ID" size="small" style="margin-bottom: 4px;" />
          <el-input v-model="playerMessage" placeholder="消息内容..." size="small" />
          <el-button size="small" style="margin-top: 4px;" @click="doAction('rcon_command', { rconCommandText: `#say ${playerMessageTarget} ${playerMessage}` })" :disabled="!playerMessage.trim()">发送</el-button>
        </el-card>

        <el-card style="margin-top: 12px;">
          <template #header><span>快速操作</span></template>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            <el-button size="small" @click="doAction('rcon_lock')">锁服</el-button>
            <el-button size="small" @click="doAction('rcon_unlock')">解锁</el-button>
            <el-button size="small" @click="doAction('rcon_players')">查询玩家</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
