<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { createClient } from "@a3st/api-client";
import { UI_COPY } from "@/constants/uiCopy";
import { useConnectionsStore, type SavedConnection } from "@/stores/connections";

const store = useConnectionsStore();
const router = useRouter();

const showAdd = ref(false);
const connectingId = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const addForm = ref({
  name: "",
  baseUrl: "",
  token: "",
});

// 预热控制台懒加载块：Vue Router 会等异步组件 resolve 后才改 hash。
// Linux CI 上冷编译该树可能超过默认 E2E 超时，导致一直停在 #/connections。
onMounted(() => {
  void import("./ServerConsoleView.vue");
});

function connectionTag(conn: SavedConnection): string {
  if (conn.id === "local") {
    return "LOCAL";
  }
  if (/192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(conn.baseUrl)) {
    return "LAN";
  }
  return "NODE";
}

async function testConnection(baseUrl: string, token?: string): Promise<boolean> {
  const client = createClient(baseUrl.trim().replace(/\/+$/, ""), token);
  try {
    const res = await client.health();
    if (!res.success) {
      ElMessage.error("连接失败：服务返回异常");
      return false;
    }
    return true;
  } catch (e) {
    let message = "无法连接到被控服务";
    if (e instanceof Error && e.message) {
      if (e.message === "Failed to fetch") {
        message =
          "无法连接本机服务（默认 http://127.0.0.1:19580）。请等窗口完全启动后再点连接；若仍失败，用浏览器打开该地址的 /api/v1/health。";
      } else {
        message = e.message;
      }
    }
    ElMessage.error(message);
    return false;
  }
}

async function connect(conn: SavedConnection) {
  connectingId.value = conn.id;
  try {
    const ok = await testConnection(conn.baseUrl, conn.token);
    if (!ok) {
      return;
    }
    store.setActive(conn.id);
    await router.push(`/console/${conn.id}/dashboard`);
  } finally {
    connectingId.value = null;
  }
}

async function doAdd() {
  if (!addForm.value.name || !addForm.value.baseUrl) {
    return;
  }

  const baseUrl = addForm.value.baseUrl.trim().replace(/\/+$/, "");
  const ok = await testConnection(baseUrl, addForm.value.token || undefined);
  if (!ok) {
    return;
  }

  const id = store.add({
    name: addForm.value.name,
    baseUrl,
    token: addForm.value.token || undefined,
  });
  addForm.value = { name: "", baseUrl: "", token: "" };
  showAdd.value = false;
  store.setActive(id);
  await router.push(`/console/${id}/dashboard`);
}

function doRemove(id: string) {
  store.remove(id);
  if (selectedId.value === id) {
    selectedId.value = null;
  }
}

function selectConnection(id: string) {
  selectedId.value = id;
}
</script>

<template>
  <div class="conn-page connections-shell" data-testid="connections-page">
    <header class="conn-page__hero">
      <p class="conn-page__kicker">OPERATOR / 主机连接</p>
      <h1 class="conn-page__title">Nodes</h1>
      <p class="conn-page__sub">
        选择被控 service 节点进入控制台。本地、局域网与远程均通过同一 HTTP API 连接。
      </p>
    </header>

    <div class="connections-toolbar">
      <span class="connections-title conn-page__toolbar-title">{{ UI_COPY.connectionTitle }}</span>
      <el-button size="small" type="primary" data-testid="btn-add-host" @click="showAdd = true">
        {{ UI_COPY.addHost }}
      </el-button>
    </div>

    <div class="connections-body">
      <p
        class="conn-page__hint"
        data-testid="remote-connection-hint"
      >
        远程：开服机运行 @a3st/service 后添加 http://&lt;IP&gt;:19580 与 Token。双机见 docs/deployment-ab-openclaw.md；Electron 可在「被控设置」开启 0.0.0.0 监听。
      </p>

      <div v-if="!store.connections.length" class="connections-empty">
        <p>{{ UI_COPY.connectionEmpty }}</p>
        <p class="connections-empty-hint">{{ UI_COPY.connectionEmptyHint }}</p>
        <el-button size="small" type="primary" data-testid="btn-add-host-empty" @click="showAdd = true">
          添加主机
        </el-button>
      </div>

      <el-scrollbar v-else class="connections-scroll">
        <ul class="conn-archive">
          <li
            v-for="conn in store.connections"
            :key="conn.id"
            class="conn-archive__row"
            :class="{ 'is-selected': selectedId === conn.id }"
            :data-testid="'connection-row-' + conn.id"
            @click="selectConnection(conn.id)"
            @dblclick="connect(conn)"
          >
            <span class="conn-archive__tag">{{ connectionTag(conn) }}</span>
            <div class="conn-archive__body">
              <div class="conn-archive__name">{{ conn.name }}</div>
              <div class="conn-archive__url">{{ conn.baseUrl }}</div>
            </div>
            <div class="conn-archive__actions">
              <el-button
                size="small"
                type="primary"
                data-testid="btn-connect"
                :loading="connectingId === conn.id"
                @click.stop="connect(conn)"
              >
                连接
              </el-button>
              <el-button size="small" @click.stop="doRemove(conn.id)">移除</el-button>
            </div>
          </li>
        </ul>
      </el-scrollbar>
    </div>

    <el-dialog v-model="showAdd" :title="UI_COPY.addHostDialog" width="400px">
      <el-form label-width="72px" label-position="left">
        <el-form-item label="名称">
          <el-input v-model="addForm.name" placeholder="我的服务器" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="addForm.baseUrl" placeholder="http://127.0.0.1:19580" />
        </el-form-item>
        <el-form-item label="Token">
          <el-input v-model="addForm.token" type="password" placeholder="可选" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="doAdd">添加并连接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.conn-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--a3st-bg);
}

.connections-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--a3st-toolbar);
  border-bottom: 1px solid var(--a3st-border-subtle);
  flex-shrink: 0;
}

.connections-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--a3st-text-muted);
}

.connections-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.connections-scroll {
  flex: 1;
  min-height: 0;
}

.connections-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--a3st-text-muted);
  font-size: 12px;
}

.connections-empty-hint {
  color: var(--a3st-text-dim);
  font-size: 11px;
  margin-bottom: 4px;
}

[data-visual="classic"] .conn-archive__tag {
  display: none;
}

[data-visual="classic"] .conn-archive__row {
  grid-template-columns: minmax(0, 1fr) auto;
}
</style>
