<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useConnectionsStore } from "@/stores/connections";
import type { ArmaServerConfig } from "@a3st/api-client";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const config = ref<ArmaServerConfig | null>(null);
const loading = ref(false);
const saving = ref(false);

const editName = ref("");
const editServerDir = ref("");

onMounted(loadConfig);

async function loadConfig() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      config.value = res.data;
      editName.value = (res.data.configName as string) ?? "";
      editServerDir.value = (res.data.serverDirectory as string) ?? "";
    }
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.patchConfig(props.serverUuid, {
      configName: editName.value,
      serverDirectory: editServerDir.value,
    });
    await loadConfig();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="config-page">
    <h2>配置编辑</h2>

    <el-card v-loading="loading" style="margin-top: 12px;">
      <template #header><span>基本设置</span></template>

      <el-form label-width="120px">
        <el-form-item label="配置名称">
          <el-input v-model="editName" />
        </el-form-item>
        <el-form-item label="服务器目录">
          <el-input v-model="editServerDir" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveConfig">
            保存到工具
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="config" style="margin-top: 12px;">
      <template #header><span>原始配置（只读）</span></template>
      <pre class="config-json">{{ JSON.stringify(config, null, 2) }}</pre>
    </el-card>
  </div>
</template>

<style scoped>
.config-json {
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
}
</style>
