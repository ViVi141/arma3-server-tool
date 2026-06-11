<script setup lang="ts">
import { ref } from "vue";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

const selectedFile = ref<File | null>(null);
const uploadLoading = ref(false);
const uploadResult = ref<string>("");
const addToMissionList = ref(true);
const writeCfg = ref(true);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0];
  }
}

async function doUpload() {
  if (!selectedFile.value) return;

  uploadLoading.value = true;
  uploadResult.value = "";
  try {
    const client = store.getClient();
    if (!client) throw new Error("无连接");

    const res = await client.uploadMissionPbo(props.serverUuid, selectedFile.value, {
      addToMissionList: addToMissionList.value,
      writeCfg: writeCfg.value,
    });

    if (res.success) {
      uploadResult.value = `上传成功：${res.data.template}`;
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

    <el-card style="margin-top: 12px;">
      <el-form label-width="120px">
        <el-form-item label="选择文件">
          <input type="file" accept=".pbo" @change="onFileChange" />
          <span v-if="selectedFile" style="margin-left: 8px;">
            {{ selectedFile.name }} ({{ (selectedFile.size / 1024 / 1024).toFixed(1) }} MB)
          </span>
        </el-form-item>

        <el-form-item label="加入任务列表">
          <el-switch v-model="addToMissionList" />
        </el-form-item>

        <el-form-item label="写入服务器">
          <el-switch v-model="writeCfg" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="uploadLoading" @click="doUpload" :disabled="!selectedFile">
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
    </el-card>
  </div>
</template>
