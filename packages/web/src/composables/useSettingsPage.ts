import { ref, watch, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import { applyDefaults } from "@/utils/defaults";
import { useConfigEditorRegistration } from "./configEditor";

export function useSettingsPage(
  serverUuid: string,
  label: string,
  buildPatch: () => Record<string, unknown>
) {
  const store = useConnectionsStore();
  const cfg = ref<Record<string, unknown>>({});
  const loading = ref(false);
  const saving = ref(false);
  let trackDirty = false;

  async function load(): Promise<void> {
    loading.value = true;
    trackDirty = false;
    try {
      const client = store.getClient();
      if (!client) {
        return;
      }
      const res = await client.getConfig(serverUuid);
      if (res.success) {
        cfg.value = applyDefaults(res.data as Record<string, unknown>);
      }
    } finally {
      loading.value = false;
      trackDirty = true;
    }
  }

  async function save(): Promise<void> {
    saving.value = true;
    try {
      const client = store.getClient();
      if (!client) {
        throw new Error("未连接");
      }
      await client.patchConfig(serverUuid, buildPatch() as never);
      ElMessage.success("已保存");
    } catch (e: unknown) {
      ElMessage.error(e instanceof Error ? e.message : "保存失败");
      throw e;
    } finally {
      saving.value = false;
    }
  }

  const { markDirty, markClean } = useConfigEditorRegistration(serverUuid, {
    label,
    save,
    reload: load,
  });

  watch(
    cfg,
    () => {
      if (trackDirty) {
        markDirty();
      }
    },
    { deep: true }
  );

  onMounted(() => {
    load().then(() => {
      markClean();
    });
  });

  return { cfg, loading, saving, load, save, markDirty, markClean };
}
