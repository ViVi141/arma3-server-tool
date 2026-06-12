<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useConnectionsStore, type SavedConnection } from "@/stores/connections";

const store = useConnectionsStore();
const router = useRouter();

const showAdd = ref(false);
const addForm = ref({
  name: "",
  baseUrl: "",
  token: "",
});

function connect(conn: SavedConnection) {
  store.setActive(conn.id);
  router.push(`/console/${conn.id}/dashboard`);
}

function doAdd() {
  if (!addForm.value.name || !addForm.value.baseUrl) return;
  const id = store.add({
    name: addForm.value.name,
      baseUrl: addForm.value.baseUrl.trim().replace(/\/+$/, ""),
    token: addForm.value.token || undefined,
  });
  addForm.value = { name: "", baseUrl: "", token: "" };
  showAdd.value = false;
  store.setActive(id);
  router.push(`/console/${id}/dashboard`);
}

function doRemove(id: string) {
  store.remove(id);
}
</script>

<template>
  <div class="connections-page">
    <h2 style="margin-bottom: 16px;">连接管理</h2>

    <el-button type="primary" @click="showAdd = true" style="margin-bottom: 16px;">
      + 添加主机
    </el-button>

    <el-table :data="store.connections" style="width: 100%" stripe>
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="baseUrl" label="地址" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="connect(row)">连接</el-button>
          <el-button size="small" type="danger" @click="doRemove(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showAdd" title="添加主机" width="420px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="addForm.name" placeholder="我的服务器" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="addForm.baseUrl" placeholder="http://127.0.0.1:19580" />
        </el-form-item>
        <el-form-item label="Token">
          <el-input v-model="addForm.token" type="password" placeholder="Bearer Token（可选）" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="doAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>
