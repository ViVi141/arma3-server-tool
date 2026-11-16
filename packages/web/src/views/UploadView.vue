<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const MAX_MIB = 100;
const MAX_BYTES = MAX_MIB * 1024 * 1024;

const selectedFile = ref<File | null>(null);
const uploadLoading = ref(false);
const uploadResult = ref("");
const uploadWarning = ref("");
const addToMissionList = ref(true);
const writeCfg = ref(false);
const progressPct = ref(0);

const fileSizeLabel = computed(() => {
  if (!selectedFile.value) {
    return "";
  }
  return `${(selectedFile.value.size / 1024 / 1024).toFixed(1)} / ${MAX_MIB} MiB`;
});

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  uploadResult.value = "";
  uploadWarning.value = "";
  progressPct.value = 0;
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0];
    if (selectedFile.value.size > MAX_BYTES) {
      ElMessage.warning(`文件超过 ${MAX_MIB} MiB 限制`);
    }
  }
}

async function doUpload() {
  if (!selectedFile.value) {
    return;
  }
  if (selectedFile.value.size > MAX_BYTES) {
    ElMessage.error(`文件超过 ${MAX_MIB} MiB 限制`);
    return;
  }
  if (!selectedFile.value.name.toLowerCase().endsWith(".pbo")) {
    ElMessage.error("仅允许上传 .pbo 文件");
    return;
  }

  uploadLoading.value = true;
  uploadResult.value = "";
  uploadWarning.value = "";
  progressPct.value = 10;
  try {
    const client = store.getClient();
    if (!client) {
      throw new Error("无连接");
    }

    progressPct.value = 40;
    const res = await client.uploadMissionPbo(props.serverUuid, selectedFile.value, {
      addToMissionList: addToMissionList.value,
      writeCfg: writeCfg.value,
    });
    progressPct.value = 100;

    if (res.success) {
      const data = res.data as {
        template?: string;
        sizeBytes?: number;
        maxBytes?: number;
        overwritten?: boolean;
        sharedServerWarning?: string | null;
        note?: string;
      };
      uploadResult.value =
        `上传成功：${data.template ?? selectedFile.value.name}`
        + (data.overwritten ? "（已覆盖同名文件）" : "");
      if (data.sharedServerWarning) {
        uploadWarning.value = data.sharedServerWarning;
      }
      if (data.note) {
        ElMessage.info(data.note);
      }
    } else {
      uploadResult.value = `上传失败：${res.error ?? "未知错误"}`;
    }
  } catch (e: unknown) {
    uploadResult.value = `上传异常：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    uploadLoading.value = false;
  }
}
</script>

<template>
  <div class="upload-page">
    <h2>上传 PBO</h2>
    <p class="hint">
      单文件上限 {{ MAX_MIB }} MiB；目标目录为服务器
      <code>MPMissions</code>。上传不会自动切换任务或重启服务器。
    </p>

    <el-card style="margin-top: 12px;">
      <el-form label-width="120px">
        <el-form-item label="选择文件">
          <input type="file" accept=".pbo" @change="onFileChange" />
          <span v-if="selectedFile" style="margin-left: 8px;">
            {{ selectedFile.name }} ({{ fileSizeLabel }})
          </span>
        </el-form-item>

        <el-form-item label="加入任务列表">
          <el-switch v-model="addToMissionList" />
        </el-form-item>

        <el-form-item label="写入服务器 cfg">
          <el-switch v-model="writeCfg" />
        </el-form-item>

        <el-form-item v-if="uploadLoading || progressPct > 0" label="进度">
          <el-progress :percentage="progressPct" :status="uploadLoading ? undefined : 'success'" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="uploadLoading" :disabled="!selectedFile" @click="doUpload">
            上传
          </el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="uploadResult"
        :title="uploadResult"
        :type="uploadResult.includes('成功') ? 'success' : 'error'"
        show-icon
        style="margin-top: 12px;"
      />
      <el-alert
        v-if="uploadWarning"
        :title="uploadWarning"
        type="warning"
        show-icon
        style="margin-top: 8px;"
      />
    </el-card>
  </div>
</template>

<style scoped>
.hint { font-size: 12px; color: var(--el-text-color-secondary); margin: 0; }
</style>
