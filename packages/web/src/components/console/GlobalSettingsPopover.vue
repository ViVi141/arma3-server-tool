<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import M3Icon from "@/components/M3Icon.vue";
import { useConnectionsStore } from "@/stores/connections";
import { useUiSettingsStore } from "@/stores/uiSettings";

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const uiSettings = useUiSettingsStore();
const store = useConnectionsStore();
const saving = ref(false);

async function save(): Promise<void> {
  const client = store.getClient();
  if (!client) {
    return;
  }
  saving.value = true;
  try {
    await uiSettings.saveToApi(client);
    ElMessage.success("全局设置已保存");
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-popover trigger="click" width="300" popper-class="global-popover">
    <template #reference>
      <button
        v-if="compact"
        type="button"
        class="m3-icon-btn"
        data-testid="btn-global-settings"
        aria-label="全局设置"
        title="全局设置"
      >
        <M3Icon name="tune" :size="20" />
      </button>
      <el-button v-else size="small" data-testid="btn-global-settings">全局设置</el-button>
    </template>
    <div class="global-settings">
      <div class="row">
        <el-checkbox v-model="uiSettings.showAdvancedSettings" size="small">显示高级设置</el-checkbox>
      </div>
      <div class="row">
        <el-checkbox v-model="uiSettings.allowExternalConfigRefresh" size="small">
          允许重新读取外部改动
        </el-checkbox>
      </div>
      <div class="row">
        <span>自动快照时机</span>
        <el-select v-model="uiSettings.autoSnapshotMode" size="small" style="width: 130px;">
          <el-option label="关闭" value="Off" />
          <el-option label="保存前" value="BeforeSave" />
          <el-option label="写入前" value="BeforeWrite" />
        </el-select>
      </div>
      <div class="row">
        <el-checkbox v-model="uiSettings.autoSnapshotAsync" size="small">
          后台清理旧快照（快照本身始终在变更前同步生成）
        </el-checkbox>
      </div>
      <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
    </div>
  </el-popover>
</template>
