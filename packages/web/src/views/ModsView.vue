<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import ModDownloadConfirmDialog from "@/components/mods/ModDownloadConfirmDialog.vue";
import HtmlModEnableDialog from "@/components/mods/HtmlModEnableDialog.vue";
import ModBikeyListDialog from "@/components/mods/ModBikeyListDialog.vue";
import PathInput from "@/components/PathInput.vue";
import { ArrowDown } from "@element-plus/icons-vue";
import { useModsPage } from "@/composables/useModsPage";
import { bikeyStatusIcon } from "@/utils/modBikeyIcon";

const props = defineProps<{ connectionId: string; serverUuid: string }>();

const {
  isMobile,
  sortSelectStyle,
  scanPathDialogWidth,
  expandedModPaths,
  filteredList,
  scanning,
  copyingBikey,
  bikeySummary,
  autoCopyBikey,
  dlcMods,
  sortMode,
  filters,
  statusFilterChips,
  applyQuickFilter,
  isQuickFilterActive,
  signatureCounts,
  selectedKeyRows,
  selectVisibleKeys,
  clearKeySelection,
  deploySelectedKeys,
  copyFilteredList,
  exportFilteredCsv,
  canDeployModKeys,
  modSignatureRisk,
  showScanPathDialog,
  scanPaths,
  savingScanPaths,
  showDownloadConfirm,
  pendingDownloadIds,
  showHtmlEnable,
  htmlEnableEntries,
  htmlFileInput,
  showBikeyList,
  bikeyKeysDir,
  bikeyListFiles,
  steamCmdReady,
  checkingUpdates,
  autoCheckUpdates,
  modRowKey,
  toggleModPath,
  updateStatusLabel,
  updateStatusTagType,
  saveDlc,
  doScan,
  onRoleChange,
  disableMods,
  saveAutoCopyBikey,
  fetchWorkshopDetails,
  checkModUpdates,
  onDownloadConfirm,
  downloadSelectedMods,
  onGetMods,
  onHtmlFileSelected,
  isModInstalled,
  applyHtmlEnable,
  downloadMissingFromHtml,
  openScanPathDialog,
  addScanPathRow,
  removeScanPathRow,
  saveScanPaths,
  onBikeyMenu,
} = useModsPage(props);
</script>
<template>
  <ConsolePageLayout :padded="false">
    <template #toolbar>
      <div :class="{ 'mods-toolbar-mobile': isMobile }">
        <el-button size="small" :loading="scanning" @click="doScan">扫描刷新</el-button>
        <el-button size="small" :loading="checkingUpdates" @click="checkModUpdates()">检查更新</el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!steamCmdReady"
          @click="downloadSelectedMods"
        >
          更新/下载选中
        </el-button>
        <el-dropdown size="small" @command="onGetMods">
          <el-button size="small">
            获取模组<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="add_local">添加本地模组</el-dropdown-item>
              <el-dropdown-item command="download">下载选中模组</el-dropdown-item>
              <el-dropdown-item command="download_outdated">仅更新「有更新」的模组</el-dropdown-item>
              <el-dropdown-item command="paste">从剪贴板导入 ID</el-dropdown-item>
              <el-dropdown-item command="html_download">从 HTML 下载...</el-dropdown-item>
              <el-dropdown-item command="html_enable">从 HTML 启用...</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown size="small" data-testid="bikey-menu" @command="onBikeyMenu">
          <el-button size="small">签名管理</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="manage">查看已部署公钥</el-dropdown-item>
              <el-dropdown-item command="copy_all">选择当前筛选可部署项...</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" @click="openScanPathDialog">扫描路径...</el-button>
      </div>
    </template>

    <div class="mods-shell">
        <div class="mods-bar mods-bar--first">
          <span class="mods-bar-label">排序</span>
          <el-select v-model="sortMode" size="small" :style="sortSelectStyle">
            <el-option value="scanOrder" label="扫描顺序" />
            <el-option value="dirName" label="文件夹名" />
            <el-option value="name" label="模组名" />
            <el-option value="updated" label="更新时间" />
          </el-select>
          <div class="m3-chip-row" role="group" aria-label="模组筛选">
            <button
              v-for="chip in statusFilterChips"
              :key="chip.id"
              type="button"
              class="m3-chip"
              :class="{ 'is-selected': isQuickFilterActive(chip.id) }"
              :aria-pressed="isQuickFilterActive(chip.id)"
              :data-testid="chip.testId"
              @click="applyQuickFilter(chip.id)"
            >
              {{ chip.label }}
            </button>
          </div>
          <el-checkbox v-model="autoCheckUpdates" size="small">扫描后自动检查 Workshop 更新</el-checkbox>
        </div>

        <div class="mods-filters" data-testid="mods-combined-filters">
          <el-input v-model="filters.search" clearable placeholder="搜索名称 / ID / 路径" aria-label="搜索名称、ID 或路径" data-testid="mods-search" />
          <el-select v-model="filters.enabled" multiple clearable placeholder="启用状态" aria-label="启用状态" data-testid="mods-enabled-filter">
            <el-option value="enabled" label="已启用" /><el-option value="disabled" label="未启用" />
          </el-select>
          <el-select v-model="filters.roles" multiple clearable placeholder="角色" aria-label="角色" data-testid="mods-role-filter">
            <el-option value="client" label="客模" /><el-option value="server" label="服模" /><el-option value="hc" label="HC" />
          </el-select>
          <el-select v-model="filters.updates" multiple clearable placeholder="更新状态" aria-label="更新状态" data-testid="mods-update-filter">
            <el-option value="outdated" label="有更新" /><el-option value="up_to_date" label="已最新" />
            <el-option value="missing" label="未安装" /><el-option value="unknown" label="未知 / 未检查" />
          </el-select>
          <el-select v-model="filters.signatures" multiple clearable collapse-tags placeholder="签名文件状态" aria-label="签名文件状态" data-testid="mods-signature-filter">
            <el-option v-for="item in signatureCounts" :key="item.status" :value="item.status" :label="item.label" />
          </el-select>
          <el-select v-model="filters.sources" multiple clearable placeholder="来源" aria-label="来源" data-testid="mods-source-filter">
            <el-option value="local" label="本地" /><el-option value="workshop" label="Workshop" />
          </el-select>
        </div>
        <div class="mods-bar" aria-label="签名分类数量">
          <button v-for="item in signatureCounts" :key="item.status" class="m3-chip" type="button"
            :class="{ 'is-selected': filters.signatures.includes(item.status) }"
            :aria-pressed="filters.signatures.includes(item.status)"
            :data-testid="`mods-count-${item.status}`"
            @click="filters.signatures = filters.signatures.includes(item.status) ? filters.signatures.filter((s) => s !== item.status) : [...filters.signatures, item.status]">
            {{ item.label }} {{ item.count }}
          </button>
        </div>
        <p class="mods-hint">维度之间同时满足，同一维度多选任一满足。此处仅检查文件覆盖与公钥内容，不是密码学验证，也不保证玩家可以加入。</p>

        <div class="mods-bar">
          <span class="mods-bar-label">全部禁用</span>
          <el-button size="small" @click="disableMods('client')">客户端</el-button>
          <el-button size="small" @click="disableMods('server')">服务器</el-button>
          <el-button size="small" @click="disableMods('hc')">无头客户端</el-button>
          <el-button size="small" @click="disableMods('all')">全部</el-button>
        </div>

        <div class="mods-bar mods-bikey-bar">
          <span class="bikey-summary">{{ bikeySummary }}</span>
          <el-button size="small" :disabled="!filteredList.length" data-testid="mods-copy-list" @click="copyFilteredList">复制筛选清单</el-button>
          <el-button size="small" :disabled="!filteredList.length" data-testid="mods-export-csv" @click="exportFilteredCsv">导出 CSV</el-button>
          <el-button size="small" data-testid="mods-select-keys" @click="selectVisibleKeys">选择当前可部署项</el-button>
          <el-button size="small" @click="clearKeySelection">清除公钥选择</el-button>
          <el-button size="small" :loading="copyingBikey" :disabled="!selectedKeyRows.length"
            data-testid="btn-copy-missing-bikey" @click="deploySelectedKeys">
            部署选中公钥（{{ selectedKeyRows.length }} 个模组）
          </el-button>
        </div>

        <div class="mods-archive-head">
          <div>
            <p class="mods-archive-kicker">WORKSHOP / SYNC</p>
            <h2 class="mods-archive-title">模组列表</h2>
          </div>
          <span class="mods-archive-count">共 {{ filteredList.length }} 项</span>
        </div>

        <div v-if="isMobile" v-loading="scanning" class="mods-card-list" data-testid="mods-card-list">
          <div
            v-for="row in filteredList"
            :key="modRowKey(row)"
            class="mods-card"
          >
            <div class="mods-card__header">
              <el-checkbox
                v-model="row.updateSelected"
                :disabled="row.workshopId <= 0"
              />
              <div class="mods-card__titles">
                <h3 class="mods-card__title">{{ row.name || row.dirName }}</h3>
                <p class="mods-card__meta">{{ row.dirName }}</p>
              </div>
              <el-tag
                v-if="row.workshopId > 0 && row.updateStatus"
                size="small"
                :type="updateStatusTagType(row.updateStatus)"
              >
                {{ updateStatusLabel(row.updateStatus) }}
              </el-tag>
            </div>
            <div class="mods-card__roles">
              <button
                type="button"
                class="m3-role-chip"
                :class="{ 'is-on': row.isClientMod }"
                :aria-pressed="row.isClientMod"
                data-testid="mod-role-client"
                @click="onRoleChange(row, 'client', !row.isClientMod)"
              >
                客模
              </button>
              <button
                type="button"
                class="m3-role-chip"
                :class="{ 'is-on': row.isServerMod }"
                :aria-pressed="row.isServerMod"
                data-testid="mod-role-server"
                @click="onRoleChange(row, 'server', !row.isServerMod)"
              >
                服模
              </button>
              <button
                type="button"
                class="m3-role-chip"
                :class="{ 'is-on': row.isHcMod }"
                :aria-pressed="row.isHcMod"
                data-testid="mod-role-hc"
                @click="onRoleChange(row, 'hc', !row.isHcMod)"
              >
                HC
              </button>
            </div>
            <div class="mods-card__footer">
              <span class="bikey-status-cell">
                <span class="bikey-icon">{{ bikeyStatusIcon(row.bikeyStatus) }}</span>
                <span class="bikey-label">{{ row.bikeyLabel }}</span>
              </span>
              <el-button size="small" text @click="toggleModPath(row)">
                <template v-if="expandedModPaths[modRowKey(row)]">收起路径</template>
                <template v-else>查看路径</template>
              </el-button>
            </div>
            <el-checkbox v-model="row.keySelected" :disabled="!canDeployModKeys(row)" data-testid="mod-key-select">选择部署公钥</el-checkbox>
            <p class="mods-hint">{{ row.signatureEvidence?.reason || row.bikeyHint }}</p>
            <p class="mods-hint">{{ row.bikeyHint }} {{ modSignatureRisk(row) }}</p>
            <p v-if="expandedModPaths[modRowKey(row)]" class="mods-card__path">{{ row.path }}</p>
          </div>
          <el-empty v-if="!filteredList.length && !scanning" description="暂无模组" />
        </div>

        <div v-else v-loading="scanning" class="mods-table-wrap mods-archive-table">
          <el-table :data="filteredList" stripe size="small" height="100%">
            <el-table-column label="序号" width="52" align="center">
              <template #default="{ $index }">{{ $index + 1 }}</template>
            </el-table-column>
            <el-table-column label="更新" width="60" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.updateSelected" :disabled="row.workshopId <= 0" />
              </template>
            </el-table-column>
            <el-table-column prop="dirName" label="文件夹名" min-width="120" show-overflow-tooltip />
            <el-table-column prop="name" label="模组名" min-width="140" show-overflow-tooltip />
            <el-table-column label="客模" width="76" align="center">
              <template #default="{ row }">
                <button
                  type="button"
                  class="m3-role-chip"
                  :class="{ 'is-on': row.isClientMod }"
                  :aria-pressed="row.isClientMod"
                  data-testid="mod-role-client"
                  @click="onRoleChange(row, 'client', !row.isClientMod)"
                >
                  客模
                </button>
              </template>
            </el-table-column>
            <el-table-column label="服模" width="76" align="center">
              <template #default="{ row }">
                <button
                  type="button"
                  class="m3-role-chip"
                  :class="{ 'is-on': row.isServerMod }"
                  :aria-pressed="row.isServerMod"
                  data-testid="mod-role-server"
                  @click="onRoleChange(row, 'server', !row.isServerMod)"
                >
                  服模
                </button>
              </template>
            </el-table-column>
            <el-table-column label="HC" width="68" align="center">
              <template #default="{ row }">
                <button
                  type="button"
                  class="m3-role-chip"
                  :class="{ 'is-on': row.isHcMod }"
                  :aria-pressed="row.isHcMod"
                  data-testid="mod-role-hc"
                  @click="onRoleChange(row, 'hc', !row.isHcMod)"
                >
                  HC
                </button>
              </template>
            </el-table-column>
            <el-table-column label="本地导入" width="72" align="center">
              <template #default="{ row }">{{ row.inputLocalMod ? "是" : "否" }}</template>
            </el-table-column>
            <el-table-column label="公钥选择" width="82" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.keySelected" :disabled="!canDeployModKeys(row)" :aria-label="`选择 ${row.name} 的公钥`" data-testid="mod-key-select" />
              </template>
            </el-table-column>
            <el-table-column label="签名文件证据与操作" min-width="330">
              <template #default="{ row }">
                <span :class="['bikey-status', `bikey-status--${row.bikeyStatus}`]">{{ bikeyStatusIcon(row.bikeyStatus) }} {{ row.bikeyLabel }}</span>
                <p class="mods-hint">{{ row.signatureEvidence?.reason || '尚无逐 PBO 证据，请重新扫描' }}</p>
                <p class="mods-hint">{{ row.bikeyHint }}</p>
                <p class="mods-hint">{{ modSignatureRisk(row) }}</p>
              </template>
            </el-table-column>
            <el-table-column prop="path" label="路径" min-width="160" show-overflow-tooltip />
            <el-table-column label="远程更新" width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.remoteUpdatedLabel ?? "-" }}</template>
            </el-table-column>
            <el-table-column prop="updatedTime" label="本地更新" width="140" show-overflow-tooltip />
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.workshopId > 0 && row.updateStatus"
                  size="small"
                  :type="updateStatusTagType(row.updateStatus)"
                >
                  {{ updateStatusLabel(row.updateStatus) }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="mods-options">
          <el-checkbox v-model="autoCopyBikey" @change="saveAutoCopyBikey">
            扫描后自动部署适用模组的公钥到服务器 Keys 目录
          </el-checkbox>
          <p class="mods-hint">公钥表示服务器信任的签名来源；多余公钥可能扩大信任范围。部署公钥不能补签 PBO，也不会关闭服务器签名校验。</p>
          <div class="mods-dlc-row">
            <el-checkbox v-model="dlcMods.contact" @change="saveDlc">Contact 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.gm" @change="saveDlc">GM 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.csla" @change="saveDlc">CSLA 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.ws" @change="saveDlc">Western Sahara 资料片</el-checkbox>
            <el-checkbox v-model="dlcMods.vn" @change="saveDlc">S.O.G. 资料片</el-checkbox>
          </div>
          <p class="mods-hint">提示：DLC 选项仅作为启动命令行参数，不写入 server.cfg。</p>
        </div>
    </div>
  </ConsolePageLayout>

  <input type="file" accept=".html,.htm" ref="htmlFileInput" class="hidden-input" @change="onHtmlFileSelected" />

  <ModDownloadConfirmDialog
    v-model:visible="showDownloadConfirm"
    :mod-ids="pendingDownloadIds"
    :fetch-details="fetchWorkshopDetails"
    @confirm="onDownloadConfirm"
  />

  <HtmlModEnableDialog
    v-model:visible="showHtmlEnable"
    :entries="htmlEnableEntries"
    :is-installed="isModInstalled"
    :can-download="steamCmdReady"
    @confirm="applyHtmlEnable"
    @download-missing="downloadMissingFromHtml"
  />

  <ModBikeyListDialog
    v-model:visible="showBikeyList"
    :keys-dir="bikeyKeysDir"
    :files="bikeyListFiles"
  />

  <el-dialog v-model="showScanPathDialog" title="模组扫描路径" :width="scanPathDialogWidth">
    <el-table :data="scanPaths" stripe size="small">
      <el-table-column label="扫描路径" min-width="280">
        <template #default="{ row }">
          <PathInput v-model="row.modulePath" mode="directory" placeholder="D:\Steam\steamapps\workshop\content\107410" />
        </template>
      </el-table-column>
      <el-table-column label="前缀过滤" width="120">
        <template #default="{ row }">
          <el-input v-model="row.prefix" size="small" placeholder="可选" />
        </template>
      </el-table-column>
      <el-table-column label="备注" width="140">
        <template #default="{ row }">
          <el-input v-model="row.remark" size="small" />
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top: 8px">
      <el-button size="small" @click="addScanPathRow">添加</el-button>
      <el-button size="small" :disabled="!scanPaths.length" @click="removeScanPathRow">删除</el-button>
    </div>
    <template #footer>
      <el-button @click="showScanPathDialog = false">取消</el-button>
      <el-button type="primary" :loading="savingScanPaths" @click="saveScanPaths">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mods-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  gap: 4px;
  padding: 6px 8px;
  box-sizing: border-box;
}
.mods-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.mods-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 6px;
}
.bikey-status { font-weight: 600; color: var(--el-color-warning-dark-2); }
.bikey-status--ready { color: var(--el-color-success-dark-2); }
.bikey-status--read_error { color: var(--el-color-danger); }
.mods-bar-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mods-bikey-bar {
  justify-content: flex-start;
}
.bikey-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mods-bar--first {
  padding-top: 2px;
}
.mods-table-wrap {
  flex: 1;
  min-height: 200px;
}
.mods-options {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 8px;
  font-size: 12px;
}
.mods-dlc-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
}
.mods-hint {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.bikey-icon {
  font-size: 14px;
}
.bikey-status-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1.2;
}
.bikey-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.hidden-input {
  display: none;
}
</style>
