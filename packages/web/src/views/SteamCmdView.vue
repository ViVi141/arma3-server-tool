<script setup lang="ts">
import { ref } from "vue";
import { useConnectionsStore } from "@/stores/connections";
import TerminalOutput from "@/components/TerminalOutput.vue";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const activeTab = ref<"steamcmd" | "download">("steamcmd");
const baseUrl = ref(store.active?.baseUrl ?? "");

const serverDir = ref("");
const modIdsText = ref("");
const statusText = ref("");

async function checkSteamCmd() {
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.steamCmdStatus();
    const data = res.data as { isInstalled?: boolean; isRunning?: boolean };
    statusText.value = `安装: ${data.isInstalled} · 运行: ${data.isRunning}`;
  } catch (e: unknown) {
    statusText.value = e instanceof Error ? e.message : "查询失败";
  }
}

async function stopSteamCmd() {
  try {
    const client = store.getClient();
    if (!client) return;
    await client.stopSteamCmd();
    statusText.value = "已发出停止命令";
  } catch (e: unknown) {
    statusText.value = e instanceof Error ? e.message : "停止失败";
  }
}
</script>

<template>
  <div class="steamcmd-page">
    <h2>SteamCMD 控制台</h2>

    <el-tabs v-model="activeTab" style="margin-top: 12px;">
      <el-tab-pane label="输出流" name="steamcmd">
        <div style="margin: 8px 0; display: flex; gap: 8px;">
          <el-button size="small" @click="checkSteamCmd">查询状态</el-button>
          <el-button size="small" type="danger" @click="stopSteamCmd">停止 SteamCMD</el-button>
          <span v-if="statusText" style="font-size: 13px; color: var(--el-text-color-secondary); margin-left: 8px;">
            {{ statusText }}
          </span>
        </div>
        <TerminalOutput url="/api/v1/steamcmd/stream" :base-url="baseUrl" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
