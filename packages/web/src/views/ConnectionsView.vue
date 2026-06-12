<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { createClient } from "@a3st/api-client";
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
    ElMessage.error(e instanceof Error ? e.message : "无法连接到被控服务");
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
    router.push(`/console/${conn.id}/dashboard`);
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
  router.push(`/console/${id}/dashboard`);
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
  <div class="connections-shell">
    <div class="connections-toolbar">
      <span class="connections-title">远程主机</span>
      <el-button size="small" type="primary" @click="showAdd = true">添加...</el-button>
    </div>

    <div class="connections-body">
      <div v-if="!store.connections.length" class="connections-empty">
        <p>尚未添加远程主机</p>
        <p class="connections-empty-hint">添加被控服务地址后即可管理 Arma 3 服务器</p>
        <el-button size="small" type="primary" @click="showAdd = true">添加主机</el-button>
      </div>

      <el-scrollbar v-else class="connections-scroll">
        <div
          v-for="conn in store.connections"
          :key="conn.id"
          class="connection-row"
          :class="{ selected: selectedId === conn.id }"
          @click="selectConnection(conn.id)"
          @dblclick="connect(conn)"
        >
          <div class="connection-main">
            <div class="connection-name">{{ conn.name }}</div>
            <div class="connection-url">{{ conn.baseUrl }}</div>
          </div>
          <div class="connection-actions">
            <el-button
              size="small"
              type="primary"
              :loading="connectingId === conn.id"
              @click.stop="connect(conn)"
            >
              连接
            </el-button>
            <el-button size="small" @click.stop="doRemove(conn.id)">移除</el-button>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <el-dialog v-model="showAdd" title="添加远程主机" width="400px">
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
.connections-shell {
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
}

.connections-scroll {
  height: 100%;
}

.connection-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--a3st-border-subtle);
  cursor: default;
}

.connection-row:hover {
  background: var(--a3st-bg-hover);
}

.connection-row.selected {
  background: var(--a3st-bg-active);
  border-left: 2px solid var(--a3st-accent);
  padding-left: 10px;
}

.connection-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--a3st-text);
}

.connection-url {
  font-size: 11px;
  font-family: var(--a3st-font-mono);
  color: var(--a3st-text-dim);
  margin-top: 2px;
}

.connection-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
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
</style>
