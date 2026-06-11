<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConnectionsStore } from "@/stores/connections";
import type { ServerSummary } from "@a3st/api-client";

const route = useRoute();
const router = useRouter();
const store = useConnectionsStore();

const connectionId = () => route.params.connectionId as string;
const conn = () => store.connections.find((c) => c.id === connectionId());

const servers = ref<ServerSummary[]>([]);
const selectedUuid = ref<string>("");
const loading = ref(false);
const errorMsg = ref("");

const subPages = [
  { path: "dashboard", label: "仪表盘" },
  { path: "missions", label: "任务" },
  { path: "mods", label: "模组" },
  { path: "rcon", label: "远程控制" },
  { path: "upload", label: "上传PBO" },
  { path: "steamcmd", label: "SteamCMD" },
  { path: "statistics", label: "统计" },
  { path: "snapshots", label: "快照" },
  { path: "bans", label: "封禁" },
  { path: "logs", label: "日志" },
  { path: "wizard", label: "开服向导" },
  { path: "settings", label: "配置" },
  { path: "about", label: "关于" },
];

// connect on mount
onMounted(() => {
  store.setActive(connectionId());
  loadServers();
});

watch(() => route.params.connectionId, () => {
  store.setActive(connectionId());
  loadServers();
});

async function loadServers() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const client = store.getClient();
    if (!client) throw new Error("无连接");
    servers.value = await client.listServers();
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function selectServer(uuid: string) {
  selectedUuid.value = uuid;
}
</script>

<template>
  <div class="console-layout">
    <!-- Left: server picker -->
    <aside class="console-sidebar">
      <h3>{{ conn()?.name ?? "主机" }}</h3>
      <p class="muted">{{ conn()?.baseUrl }}</p>

      <el-divider />

      <div v-if="loading" v-loading="loading" style="height: 80px;" />

      <el-alert v-else-if="errorMsg" :title="errorMsg" type="error" show-icon />

      <el-radio-group
        v-else
        v-model="selectedUuid"
        style="display: flex; flex-direction: column; gap: 4px;"
        @change="selectServer"
      >
        <el-radio
          v-for="s in servers"
          :key="s.uuid"
          :value="s.uuid"
          border
        >
          {{ s.configName }}
        </el-radio>
      </el-radio-group>

      <el-divider />

      <el-menu :default-active="route.path" router style="border-right: none;">
        <el-menu-item
          v-for="p in subPages"
          :key="p.path"
          :index="`/console/${connectionId()}/${p.path}`"
        >
          {{ p.label }}
        </el-menu-item>
      </el-menu>
    </aside>

    <!-- Right: page content -->
    <main class="console-content">
      <router-view v-if="selectedUuid" :connection-id="connectionId()" :server-uuid="selectedUuid" />
      <el-empty v-else description="请先选择服务器" />
    </main>
  </div>
</template>

<style scoped>
.console-layout {
  display: flex;
  height: calc(100vh - 80px);
}

.console-sidebar {
  width: 220px;
  min-width: 200px;
  border-right: 1px solid var(--el-border-color-light);
  padding: 12px;
  overflow-y: auto;
}

.console-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
</style>
