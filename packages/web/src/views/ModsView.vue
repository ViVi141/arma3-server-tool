<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";

const props = defineProps<{ connectionId: string; serverUuid: string }>();
const store = useConnectionsStore();

// Mod list
const modList = ref<{ name: string; workshopId: number; enabled: boolean; isServerMod: boolean; bikey: boolean }[]>([]);
const loading = ref(false);
const scanning = ref(false);
const hasScanned = ref(false);

// Add mod by ID
const modIdsText = ref("");
const mode = ref<"download" | "enable" | "download_and_enable">("download_and_enable");
const writeCfg = ref(false);
const adding = ref(false);

// HTML import
const htmlText = ref("");
const parsedMods = ref<{ id: number; name: string }[]>([]);
const htmlImporting = ref(false);
const htmlParsed = ref(false);

onMounted(loadMods);

async function loadMods() {
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) {
      const cfg = res.data;
      const enabledIds = (cfg.mods as { enabledIds?: number[] })?.enabledIds ?? [];
      const serverModIds = (cfg.mods as { serverModIds?: number[] })?.serverModIds ?? [];
      modList.value = enabledIds.map((id: number) => ({
        name: `workshop_${id}`,
        workshopId: id,
        enabled: true,
        isServerMod: serverModIds.includes(id),
        bikey: false,
      }));
      hasScanned.value = true;
    }
  } catch { /* ignore */ }
}

async function doScan() {
  scanning.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "scan_mods" as const }] });
    const data = res.data as { steps?: { message: string }[] };
    ElMessage.success(data?.steps?.[0]?.message ?? "扫描完成");
    await loadMods();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "扫描失败"); }
  finally { scanning.value = false; }
}

async function doAddMods() {
  const ids = modIdsText.value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  if (ids.length === 0) return;

  adding.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const commands: { action: string; modIds?: number[]; writeCfgAfter?: boolean }[] = [];
    if (mode.value === "enable" || mode.value === "download_and_enable") {
      commands.push({ action: "enable_mods", modIds: ids, writeCfgAfter: writeCfg.value });
    }
    if (mode.value === "download" || mode.value === "download_and_enable") {
      commands.push({ action: "download_mods", modIds: ids });
    }
    const res = await client.submitTask({ serverUuid: props.serverUuid, async: true, commands });
    const data = res.data as { taskId?: string };
    ElMessage.success(data?.taskId ? `任务已提交: ${data.taskId.slice(0, 8)}...` : "操作已执行");
    await loadMods();
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
  finally { adding.value = false; }
}

async function toggleMod(id: number, enabled: boolean) {
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({
      serverUuid: props.serverUuid,
      commands: [{ action: enabled ? "enable_mods" : "disable_mods", modIds: [id], writeCfgAfter: writeCfg.value } as never],
    });
    const mod = modList.value.find(m => m.workshopId === id);
    if (mod) mod.enabled = enabled;
    ElMessage.success(mod ? `${mod.name} 已${enabled ? "启用" : "禁用"}` : "操作完成");
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "操作失败"); }
}

// ---- HTML Import ----

function parseHtml() {
  const html = htmlText.value;
  // Extract workshop mod entries from Steam HTML
  // Format: <div class="workshopItemTitle">Mod Name</div> ... <div class="workshopItemSubscription">...id=450814997...</a>
  // Also handle plain listing with links containing workshop IDs
  const items: { id: number; name: string }[] = [];

  // Try to extract from HTML: match workshop item blocks
  const titleRegex = /class="workshopItemTitle"[^>]*>([^<]+)</gi;
  const idRegex = /(?:\?id=|%3Fid%3D|publishedid\s*=\s*)(\d{7,})/gi;
  const allIds = [...html.matchAll(/(\d{7,})/g)].map(m => parseInt(m[1], 10)).filter(id => id > 1000000);

  // Extract titles
  const titles: string[] = [];
  let match;
  while ((match = titleRegex.exec(html)) !== null) {
    titles.push(match[1].trim());
  }

  // Pair IDs with names heuristically
  const uniqueIds = [...new Set(allIds)];
  items.push(...uniqueIds.map((id, i) => ({
    id,
    name: titles[i] ? titles[i].replace(/[|]/g, '') : `workshop_${id}`,
  })));

  parsedMods.value = items;
  htmlParsed.value = true;

  if (items.length === 0) {
    ElMessage.warning("未从 HTML 中解析出模组 ID");
  }
}

async function doHtmlImport() {
  if (parsedMods.value.length === 0) return;

  const ids = parsedMods.value.map(m => m.id);
  htmlImporting.value = true;
  try {
    const client = store.getClient();
    if (!client) return;

    // Send HTML to backend
    const res = await client.uploadModHtml(props.serverUuid, htmlText.value, {
      mode: "download_and_enable",
      writeCfg: writeCfg.value,
    });

    if (res.success) {
      ElMessage.success(`导入成功: ${ids.length} 个模组`);
      await loadMods();
      htmlText.value = "";
      parsedMods.value = [];
      htmlParsed.value = false;
    } else {
      ElMessage.warning("后端处理后需进一步查看");
    }
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : "导入失败"); }
  finally { htmlImporting.value = false; }
}
</script>

<template>
  <div class="mods-page">
    <h2>模组管理</h2>

    <div style="margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button :loading="scanning" @click="doScan">扫描模组</el-button>
    </div>

    <el-card style="margin-top: 12px;">
      <template #header><span>已启用模组</span></template>
      <el-table v-if="hasScanned && modList.length" :data="modList" stripe style="width: 100%">
        <el-table-column label="启用" width="70">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" size="small" @change="(v: boolean) => toggleMod(row.workshopId, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="200" />
        <el-table-column prop="workshopId" label="Workshop ID" width="130" />
        <el-table-column label="Bikey" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.bikey" type="success" size="small">🟢</el-tag>
            <el-tag v-else type="danger" size="small">🔴</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服模" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.isServerMod" type="warning" size="small">S</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else-if="hasScanned" description="无已启用模组，通过下方添加" />
      <el-empty v-else description="点击「扫描模组」查看已安装模组" />
    </el-card>

    <el-row :gutter="12" style="margin-top: 12px;">
      <el-col :span="12">
        <el-card>
          <template #header><span>按 Workshop ID 添加</span></template>
          <el-form label-width="100px">
            <el-form-item label="ID">
              <el-input v-model="modIdsText" type="textarea" :rows="3" placeholder="每行一个 ID：&#10;450814997&#10;463939057" />
            </el-form-item>
            <el-form-item label="操作">
              <el-radio-group v-model="mode">
                <el-radio value="download_and_enable">下载并启用</el-radio>
                <el-radio value="download">仅下载</el-radio>
                <el-radio value="enable">仅启用</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="写 cfg">
              <el-switch v-model="writeCfg" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="adding" @click="doAddMods" :disabled="!modIdsText.trim()">执行</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header><span>从 HTML 导入</span></template>
          <p style="font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px;">
            从 Steam Workshop 合集页面复制 HTML，粘贴到下方自动解析
          </p>
          <el-input v-model="htmlText" type="textarea" :rows="4" placeholder="粘贴 Steam Workshop HTML..." />
          <div style="margin-top: 8px; display: flex; gap: 8px;">
            <el-button @click="parseHtml" :disabled="!htmlText.trim()">解析</el-button>
            <el-button type="primary" :loading="htmlImporting" @click="doHtmlImport" :disabled="parsedMods.length === 0">
              导入 ({{ parsedMods.length }})
            </el-button>
          </div>
          <div v-if="htmlParsed" style="margin-top: 8px;">
            <el-table v-if="parsedMods.length" :data="parsedMods" stripe size="small" max-height="200">
              <el-table-column prop="name" label="模组名" min-width="160" />
              <el-table-column prop="id" label="ID" width="120" />
            </el-table>
            <el-empty v-else description="未识别到模组" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
