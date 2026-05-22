using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntTable = AntdUI.Table;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal enum ModTableSortMode
    {
        ScanOrder = 0,
        DirName = 1,
        ModName = 2,
        ModId = 3,
        UpdatedTime = 4,
    }

    internal enum ModTableVisibilityFilter
    {
        All = 0,
        SelectedOnly = 1,
        UnselectedOnly = 2,
    }

    internal enum ModDisableScope
    {
        Client = 0,
        Server = 1,
        HeadlessClient = 2,
        All = 3,
    }

    internal sealed class ModSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntTable modsTable;
        private readonly AntSelect sortSelect;
        private readonly AntSelect visibilitySelect;
        private readonly AntdUI.Checkbox autoCopyBikeyCheckBox;
        private readonly AntdUI.Checkbox dlcContactCheckBox;
        private readonly AntdUI.Checkbox dlcGmCheckBox;
        private readonly AntdUI.Checkbox dlcCslaCheckBox;
        private readonly AntdUI.Checkbox dlcWsCheckBox;
        private readonly AntdUI.Checkbox dlcVnCheckBox;

        private ArmaServerConfig boundConfig;
        private List<ScannedModRow> allRows = new List<ScannedModRow>();
        private ModTableSortMode sortMode = ModTableSortMode.ScanOrder;
        private ModTableVisibilityFilter visibilityFilter = ModTableVisibilityFilter.All;

        public ModSettingsPanel()
        {
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            AntdUI.Button refreshButton = SettingsLayoutHelper.CreateButton("扫描刷新");
            AntdUI.Button scanPathButton = SettingsLayoutHelper.CreateButton("扫描路径...");
            AntdUI.Button addLocalButton = SettingsLayoutHelper.CreateButton("添加本地模组");
            AntdUI.Button downloadButton = SettingsLayoutHelper.CreateButton("下载选中模组");
            AntdUI.Button pasteButton = SettingsLayoutHelper.CreateButton("从剪贴板导入 ID");
            AntdUI.Button htmlDownloadButton = SettingsLayoutHelper.CreateButton("从 HTML 下载...");
            AntdUI.Button htmlEnableButton = SettingsLayoutHelper.CreateButton("从 HTML 启用...");
            AntdUI.Button bikeyButton = SettingsLayoutHelper.CreateButton("管理 Bikey");
            refreshButton.Click += delegate { ScanMods(); };
            scanPathButton.Click += OnEditScanPaths;
            addLocalButton.Click += OnAddLocalMod;
            downloadButton.Click += OnDownloadSelected;
            pasteButton.Click += OnPasteModIds;
            htmlDownloadButton.Click += OnImportFromHtmlDownload;
            htmlEnableButton.Click += OnImportFromHtmlEnable;
            bikeyButton.Click += OnManageBikeys;
            toolbar.Controls.Add(refreshButton);
            toolbar.Controls.Add(scanPathButton);
            toolbar.Controls.Add(addLocalButton);
            toolbar.Controls.Add(downloadButton);
            toolbar.Controls.Add(pasteButton);
            toolbar.Controls.Add(htmlDownloadButton);
            toolbar.Controls.Add(htmlEnableButton);
            toolbar.Controls.Add(bikeyButton);

            sortSelect = SettingsLayoutHelper.CreateSelect(
                140,
                "扫描顺序",
                "文件夹名",
                "模组名",
                "Workshop ID",
                "更新时间");
            sortSelect.SelectedIndex = 0;
            sortSelect.SelectedIndexChanged += OnSortOrFilterChanged;

            visibilitySelect = SettingsLayoutHelper.CreateSelect(140, "显示全部", "仅已选择", "仅未选择");
            visibilitySelect.SelectedIndex = 0;
            visibilitySelect.SelectedIndexChanged += OnSortOrFilterChanged;

            var viewBar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            viewBar.Controls.Add(new AntdUI.Label
            {
                Text = "排序",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(6), 0),
            });
            viewBar.Controls.Add(sortSelect);
            viewBar.Controls.Add(new AntdUI.Label
            {
                Text = "可见性",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(UiScaleHelper.Scale(12), UiScaleHelper.Scale(8), UiScaleHelper.Scale(6), 0),
            });
            viewBar.Controls.Add(visibilitySelect);

            var disableBar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            disableBar.Controls.Add(new AntdUI.Label
            {
                Text = "全部禁用",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(6), 0),
            });
            AntdUI.Button disableClientButton = SettingsLayoutHelper.CreateButton("客户端");
            AntdUI.Button disableServerButton = SettingsLayoutHelper.CreateButton("服务器");
            AntdUI.Button disableHcButton = SettingsLayoutHelper.CreateButton("HC");
            AntdUI.Button disableAllButton = SettingsLayoutHelper.CreateButton("全部");
            disableClientButton.Click += delegate { DisableMods(ModDisableScope.Client); };
            disableServerButton.Click += delegate { DisableMods(ModDisableScope.Server); };
            disableHcButton.Click += delegate { DisableMods(ModDisableScope.HeadlessClient); };
            disableAllButton.Click += delegate { DisableMods(ModDisableScope.All); };
            disableBar.Controls.Add(disableClientButton);
            disableBar.Controls.Add(disableServerButton);
            disableBar.Controls.Add(disableHcButton);
            disableBar.Controls.Add(disableAllButton);

            modsTable = AntdTableHelper.CreateStandardTable();
            var updateCol = new AntdUI.ColumnSwitch("UpdateSelected", "更新");
            updateCol.Call = OnModSwitchCall;
            var localCol = new AntdUI.ColumnSwitch("LocalMod", "客户端模组");
            localCol.Call = OnModSwitchCall;
            var serverCol = new AntdUI.ColumnSwitch("ServerMod", "服务器模组");
            serverCol.Call = OnModSwitchCall;
            var hcCol = new AntdUI.ColumnSwitch("HeadlessClientMod", "HC 模组");
            hcCol.Call = OnModSwitchCall;

            modsTable.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("RowIndex", "序号") { ReadOnly = true, Width = "4%" },
                updateCol,
                new AntdUI.Column("ModDirName", "文件夹名")
                {
                    ReadOnly = true,
                    Width = "9%",
                    SortOrder = true,
                },
                new AntdUI.Column("ModName", "模组名")
                {
                    ReadOnly = true,
                    Width = "13%",
                    SortOrder = true,
                },
                new AntdUI.Column("ModId", "Workshop ID")
                {
                    ReadOnly = true,
                    Width = "8%",
                    SortOrder = true,
                },
                localCol,
                serverCol,
                hcCol,
                new AntdUI.Column("InputLocalModLabel", "本地导入")
                {
                    ReadOnly = true,
                    Width = "6%",
                },
                new AntdUI.Column("ModPath", "路径") { ReadOnly = true, Width = "22%" },
                new AntdUI.Column("UpdatedTime", "更新时间")
                {
                    ReadOnly = true,
                    Width = "10%",
                    SortOrder = true,
                },
            };

            var optionsLayout = SettingsLayoutHelper.CreateFormLayout(120);
            autoCopyBikeyCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "AutoCopyBikey",
                SettingsLayoutHelper.CreateCheckbox("自动复制 bikey 到服务器 Keys", true));
            dlcContactCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "DLC Contact",
                SettingsLayoutHelper.CreateCheckbox("Contact DLC", false));
            dlcGmCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "DLC GM",
                SettingsLayoutHelper.CreateCheckbox("GM DLC", false));
            dlcCslaCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "DLC CSLA",
                SettingsLayoutHelper.CreateCheckbox("CSLA DLC", false));
            dlcWsCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "DLC WS",
                SettingsLayoutHelper.CreateCheckbox("Western Sahara DLC", false));
            dlcVnCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "DLC VN",
                SettingsLayoutHelper.CreateCheckbox("S.O.G. DLC", false));

            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
            };
            SplitContainerHelper.BindProportionalSplit(split, 0.68, true, 180, 140);
            split.Panel1.Controls.Add(modsTable);
            split.Panel2.Controls.Add(SettingsLayoutHelper.CreateScrollHost(optionsLayout));

            Controls.Add(split);
            Controls.Add(disableBar);
            Controls.Add(viewBar);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                allRows.Clear();
                RefreshTableView();
                return;
            }

            Enabled = true;
            autoCopyBikeyCheckBox.Checked = config.AutoCopyBikey;
            dlcContactCheckBox.Checked = config.StartupParameters.DLCcontact;
            dlcGmCheckBox.Checked = config.StartupParameters.DLCGM;
            dlcCslaCheckBox.Checked = config.StartupParameters.DLCCSLA;
            dlcWsCheckBox.Checked = config.StartupParameters.DLCWS;
            dlcVnCheckBox.Checked = config.StartupParameters.DLCVN;
            ScanMods();
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.StartupParameters.modsEntities.Clear();
            foreach (ScannedModRow row in allRows)
            {
                boundConfig.StartupParameters.modsEntities.Add(
                    new ModsEntity(
                        row.ModPath,
                        row.ModDirName,
                        row.ModName,
                        row.ModId,
                        row.LocalMod,
                        row.ServerMod,
                        row.HeadlessClientMod,
                        row.InputLocalMod));
            }

            boundConfig.AutoCopyBikey = autoCopyBikeyCheckBox.Checked;
            boundConfig.StartupParameters.DLCcontact = dlcContactCheckBox.Checked;
            boundConfig.StartupParameters.DLCGM = dlcGmCheckBox.Checked;
            boundConfig.StartupParameters.DLCCSLA = dlcCslaCheckBox.Checked;
            boundConfig.StartupParameters.DLCWS = dlcWsCheckBox.Checked;
            boundConfig.StartupParameters.DLCVN = dlcVnCheckBox.Checked;
        }

        private bool OnModSwitchCall(bool checkedAfterChange, object record, int rowIndex, int columnIndex)
        {
            if (record is ScannedModRow row)
            {
                SyncBikeysForRow(row);
            }

            RefreshTableView();
            return checkedAfterChange;
        }

        private void DisableMods(ModDisableScope scope)
        {
            if (boundConfig == null || allRows.Count == 0)
            {
                return;
            }

            bool changed = false;
            foreach (ScannedModRow row in allRows)
            {
                if (ApplyDisableScope(row, scope))
                {
                    changed = true;
                }
            }

            if (!changed)
            {
                return;
            }

            RefreshTableView();
        }

        private bool ApplyDisableScope(ScannedModRow row, ModDisableScope scope)
        {
            bool changed = false;

            if (scope == ModDisableScope.Client || scope == ModDisableScope.All)
            {
                if (row.LocalMod)
                {
                    row.LocalMod = false;
                    SyncBikeysForRow(row);
                    changed = true;
                }
            }

            if (scope == ModDisableScope.Server || scope == ModDisableScope.All)
            {
                if (row.ServerMod)
                {
                    row.ServerMod = false;
                    changed = true;
                }
            }

            if (scope == ModDisableScope.HeadlessClient || scope == ModDisableScope.All)
            {
                if (row.HeadlessClientMod)
                {
                    row.HeadlessClientMod = false;
                    changed = true;
                }
            }

            return changed;
        }

        private void SyncBikeysForRow(ScannedModRow row)
        {
            if (boundConfig == null)
            {
                return;
            }

            AppServices.Instance.BikeyService.CopyBikeysForMod(boundConfig, ToModsEntity(row));
        }

        private static ModsEntity ToModsEntity(ScannedModRow row)
        {
            return new ModsEntity(
                row.ModPath,
                row.ModDirName,
                row.ModName,
                row.ModId,
                row.LocalMod,
                row.ServerMod,
                row.HeadlessClientMod,
                row.InputLocalMod);
        }

        private void OnSortOrFilterChanged(object sender, EventArgs e)
        {
            sortMode = (ModTableSortMode)SettingsLayoutHelper.Clamp(0, 4, sortSelect.SelectedIndex);
            visibilityFilter = (ModTableVisibilityFilter)SettingsLayoutHelper.Clamp(0, 2, visibilitySelect.SelectedIndex);
            RefreshTableView();
        }

        private void ScanMods()
        {
            if (boundConfig == null)
            {
                return;
            }

            allRows = AppServices.Instance.ModScannerService
                .Scan(boundConfig, AppServices.Instance.GetSteamCmdSettings())
                .ToList();
            RefreshTableView();
        }

        private void RefreshTableView()
        {
            IEnumerable<ScannedModRow> query = allRows;

            if (visibilityFilter == ModTableVisibilityFilter.SelectedOnly)
            {
                query = query.Where(row => row.IsAnyModSelected);
            }
            else if (visibilityFilter == ModTableVisibilityFilter.UnselectedOnly)
            {
                query = query.Where(row => !row.IsAnyModSelected);
            }

            query = ApplySort(query);

            List<ScannedModRow> displayRows = query.ToList();
            for (int i = 0; i < displayRows.Count; i++)
            {
                displayRows[i].RowIndex = i + 1;
            }

            AntdTableHelper.BindList(modsTable, displayRows);
        }

        private IEnumerable<ScannedModRow> ApplySort(IEnumerable<ScannedModRow> source)
        {
            if (sortMode == ModTableSortMode.DirName)
            {
                return source.OrderBy(row => row.ModDirName, StringComparer.OrdinalIgnoreCase);
            }

            if (sortMode == ModTableSortMode.ModName)
            {
                return source.OrderBy(row => row.ModName, StringComparer.OrdinalIgnoreCase);
            }

            if (sortMode == ModTableSortMode.ModId)
            {
                return source.OrderBy(row => row.ModId);
            }

            if (sortMode == ModTableSortMode.UpdatedTime)
            {
                return source.OrderByDescending(row => row.UpdatedAt ?? DateTime.MinValue);
            }

            return source.OrderBy(row => row.ScanOrder);
        }

        private void OnEditScanPaths(object sender, EventArgs e)
        {
            using (var dialog = new ModuleScanPathForm(AppServices.Instance.ModScannerService.GetScanPaths()))
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                AppServices.Instance.ModScannerService.SaveScanPaths(dialog.GetPaths());
                ScanMods();
            }
        }

        private void OnAddLocalMod(object sender, EventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                if (!Directory.Exists(Path.Combine(dialog.SelectedPath, "addons")))
                {
                    AntdUiHelper.ShowWarning(FindForm(), "所选目录不是有效的 Arma3 模组目录（缺少 addons）。", "无效模组");
                    return;
                }

                ApplyToModel();
                boundConfig.StartupParameters.modsEntities.Add(
                    new ModsEntity(
                        dialog.SelectedPath,
                        Path.GetFileName(dialog.SelectedPath.TrimEnd('\\')),
                        Path.GetFileName(dialog.SelectedPath.TrimEnd('\\')),
                        0,
                        false,
                        false,
                        false,
                        true));
                ScanMods();
            }
        }

        private void OnDownloadSelected(object sender, EventArgs e)
        {
            SteamcmdEntity settings = AppServices.Instance.GetSteamCmdSettings();
            var modIds = new List<ulong>();
            foreach (ScannedModRow row in allRows)
            {
                if (row.UpdateSelected && row.ModId > 0)
                {
                    modIds.Add((ulong)row.ModId);
                }
            }

            if (ModDownloadUiHelper.TryDownloadMods(
                    FindForm(),
                    modIds,
                    allRows,
                    settings,
                    AppServices.Instance.SteamCmdService))
            {
                ScanMods();
            }
        }

        private void OnPasteModIds(object sender, EventArgs e)
        {
            string clipboard = Clipboard.GetText();
            if (string.IsNullOrWhiteSpace(clipboard))
            {
                return;
            }

            var ids = new List<ulong>();
            foreach (Match match in Regex.Matches(clipboard, @"\bid=.*?(\d{5,12})\b"))
            {
                ulong id;
                if (ulong.TryParse(match.Groups[1].Value, out id))
                {
                    ids.Add(id);
                }
            }

            if (ids.Count == 0)
            {
                foreach (Match match in Regex.Matches(clipboard, @"\d{5,12}"))
                {
                    ulong id;
                    if (ulong.TryParse(match.Value, out id))
                    {
                        ids.Add(id);
                    }
                }
            }

            if (ids.Count == 0)
            {
                AntdUiHelper.ShowInfo(FindForm(), "剪贴板中未找到 Workshop ID。", "提示");
                return;
            }

            SteamcmdEntity settings = AppServices.Instance.GetSteamCmdSettings();
            if (ModDownloadUiHelper.TryDownloadMods(
                    FindForm(),
                    ids,
                    null,
                    settings,
                    AppServices.Instance.SteamCmdService))
            {
                ScanMods();
            }
        }

        private List<LauncherHtmlModEntry> TryLoadHtmlEntries()
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Filter = "Arma3 启动器预设 (*.html)|*.html|所有文件 (*.*)|*.*";
                dialog.Title = "选择 Arma3 启动器导出的 HTML 预设";
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return null;
                }

                string html;
                try
                {
                    html = File.ReadAllText(dialog.FileName, Encoding.UTF8);
                }
                catch (Exception ex)
                {
                    AntdUiHelper.ShowError(FindForm(), "读取 HTML 失败: " + ex.Message, "错误");
                    return null;
                }

                List<LauncherHtmlModEntry> entries = LauncherHtmlModParser.Parse(html);
                if (entries.Count == 0)
                {
                    AntdUiHelper.ShowWarning(FindForm(), "没有从 HTML 中解析到 Workshop 模组 ID。", "读取失败");
                    return null;
                }

                return entries;
            }
        }

        private void OnImportFromHtmlDownload(object sender, EventArgs e)
        {
            List<LauncherHtmlModEntry> entries = TryLoadHtmlEntries();
            if (entries == null)
            {
                return;
            }

            SteamcmdEntity settings = AppServices.Instance.GetSteamCmdSettings();
            if (ModDownloadUiHelper.TryDownloadModsFromHtml(
                    FindForm(),
                    entries,
                    settings,
                    AppServices.Instance.SteamCmdService))
            {
                ScanMods();
            }
        }

        private void OnImportFromHtmlEnable(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            List<LauncherHtmlModEntry> entries = TryLoadHtmlEntries();
            if (entries == null)
            {
                return;
            }

            ApplyToModel();
            SteamcmdEntity settings = AppServices.Instance.GetSteamCmdSettings();
            ModEnableUiHelper.TryEnableModsFromHtml(
                FindForm(),
                entries,
                boundConfig,
                settings,
                AppServices.Instance.SteamCmdService,
                AppServices.Instance.BikeyService,
                ScanMods);
        }

        private void OnManageBikeys(object sender, EventArgs e)
        {
            if (boundConfig == null || string.IsNullOrEmpty(boundConfig.ServerDir))
            {
                return;
            }

            List<string> keys = AppServices.Instance.BikeyService.ListServerBikeys(boundConfig.ServerDir);
            var builder = new StringBuilder();
            builder.AppendLine("服务器 Keys 目录:");
            foreach (string key in keys)
            {
                builder.AppendLine(key);
            }

            AntdUiHelper.ShowInfo(FindForm(), builder.ToString(), "Bikey 列表");
        }
    }
}
