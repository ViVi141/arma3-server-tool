using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntLabel = AntdUI.Label;
using AntSelect = AntdUI.Select;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal enum ModTableSortMode
    {
        ScanOrder = 0,
        DirName = 1,
        ModName = 2,
        UpdatedTime = 3,
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

    internal sealed class ModSettingsPanel : UserControl, IApplyOnlySettingsPanel
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
        private readonly AntLabel bikeySummaryLabel;
        private readonly AntdUI.Button copyMissingBikeyButton;

        private readonly IAppServices appServices;
        private ArmaServerConfig boundConfig;
        private List<ScannedModRow> allRows = new List<ScannedModRow>();
        private ModTableSortMode sortMode = ModTableSortMode.ScanOrder;
        private ModTableVisibilityFilter visibilityFilter = ModTableVisibilityFilter.All;
        private int scanVersion;

        public ModSettingsPanel(IAppServices appServices)
        {
            this.appServices = appServices;
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                WrapContents = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };

            // 核心操作按钮
            AntdUI.Button refreshButton = SettingsLayoutHelper.CreateButton("扫描刷新");
            refreshButton.Click += delegate { ScanMods(); };
            refreshButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            toolbar.Controls.Add(refreshButton);

            // 获取模组下拉菜单
            var getModsDropdown = new AntdUI.Dropdown
            {
                Text = "获取模组",
                Type = AntdUI.TTypeMini.Default,
                Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4)),
            };
            getModsDropdown.Items.Add(new AntdUI.MenuItem("add_local", "添加本地模组"));
            getModsDropdown.Items.Add(new AntdUI.MenuItem("download", "下载选中模组"));
            getModsDropdown.Items.Add(new AntdUI.MenuItem("paste", "从剪贴板导入 ID"));
            getModsDropdown.Items.Add(new AntdUI.MenuItem("html_download", "从 HTML 下载..."));
            getModsDropdown.Items.Add(new AntdUI.MenuItem("html_enable", "从 HTML 启用..."));
            getModsDropdown.ItemClick += OnGetModsMenuClick;
            toolbar.Controls.Add(getModsDropdown);

            // Bikey 管理下拉菜单
            var bikeyDropdown = new AntdUI.Dropdown
            {
                Text = "Bikey 管理",
                Type = AntdUI.TTypeMini.Default,
                Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4)),
            };
            bikeyDropdown.Items.Add(new AntdUI.MenuItem("manage", "管理 Bikey"));
            bikeyDropdown.Items.Add(new AntdUI.MenuItem("copy_all", "复制全部 Bikey"));
            bikeyDropdown.ItemClick += OnBikeyMenuClick;
            toolbar.Controls.Add(bikeyDropdown);

            // 设置按钮
            AntdUI.Button scanPathButton = SettingsLayoutHelper.CreateButton("扫描路径...");
            scanPathButton.Click += OnEditScanPaths;
            scanPathButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            toolbar.Controls.Add(scanPathButton);

            sortSelect = SettingsLayoutHelper.CreateSelect(
                140,
                "扫描顺序",
                "文件夹名",
                "模组名",
                "更新时间");
            sortSelect.SelectedIndex = 0;
            sortSelect.SelectedIndexChanged += OnSortOrFilterChanged;

            visibilitySelect = SettingsLayoutHelper.CreateSelect(140, "显示全部", "仅已选择", "仅未选择");
            visibilitySelect.SelectedIndex = 0;
            visibilitySelect.SelectedIndexChanged += OnSortOrFilterChanged;

            var viewBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                WrapContents = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            viewBar.Controls.Add(new AntdUI.Label
            {
                Text = "排序",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(6), UiScaleHelper.Scale(4)),
            });
            viewBar.Controls.Add(sortSelect);
            viewBar.Controls.Add(new AntdUI.Label
            {
                Text = "可见性",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(UiScaleHelper.Scale(12), UiScaleHelper.Scale(8), UiScaleHelper.Scale(6), UiScaleHelper.Scale(4)),
            });
            viewBar.Controls.Add(visibilitySelect);

            var disableBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                WrapContents = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            disableBar.Controls.Add(new AntdUI.Label
            {
                Text = "全部禁用",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(6), UiScaleHelper.Scale(4)),
            });
            AntdUI.Button disableClientButton = SettingsLayoutHelper.CreateButton("客户端");
            AntdUI.Button disableServerButton = SettingsLayoutHelper.CreateButton("服务器");
            AntdUI.Button disableHcButton = SettingsLayoutHelper.CreateButton("无头客户端");
            AntdUI.Button disableAllButton = SettingsLayoutHelper.CreateButton("全部");
            disableClientButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            disableServerButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            disableHcButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            disableAllButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            disableClientButton.Click += delegate { DisableMods(ModDisableScope.Client); };
            disableServerButton.Click += delegate { DisableMods(ModDisableScope.Server); };
            disableHcButton.Click += delegate { DisableMods(ModDisableScope.HeadlessClient); };
            disableAllButton.Click += delegate { DisableMods(ModDisableScope.All); };
            disableBar.Controls.Add(disableClientButton);
            disableBar.Controls.Add(disableServerButton);
            disableBar.Controls.Add(disableHcButton);
            disableBar.Controls.Add(disableAllButton);

            var bikeyReadinessBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                WrapContents = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            bikeySummaryLabel = new AntLabel
            {
                Text = "Bikey 就绪: —",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(12), UiScaleHelper.Scale(4)),
            };
            copyMissingBikeyButton = SettingsLayoutHelper.CreateButton("复制缺失 Bikey");
            copyMissingBikeyButton.Margin = new Padding(0, 0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(4));
            copyMissingBikeyButton.Click += OnCopyMissingBikeys;
            bikeyReadinessBar.Controls.Add(bikeySummaryLabel);
            bikeyReadinessBar.Controls.Add(copyMissingBikeyButton);

            modsTable = AntdTableHelper.CreateStandardTable();
            var updateCol = new AntdUI.ColumnSwitch("UpdateSelected", "更新");
            updateCol.Call = OnModSwitchCall;
            var localCol = new AntdUI.ColumnSwitch("LocalMod", "客户端模组");
            localCol.Call = OnModSwitchCall;
            var serverCol = new AntdUI.ColumnSwitch("ServerMod", "服务器模组");
            serverCol.Call = OnModSwitchCall;
            var hcCol = new AntdUI.ColumnSwitch("HeadlessClientMod", "无头客户端模组");
            hcCol.Call = OnModSwitchCall;

            modsTable.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("RowIndex", "序号")
                {
                    ReadOnly = true,
                    Width = "3%",
                    MaxWidth = "60",
                },
                updateCol,
                new AntdUI.Column("ModDirName", "文件夹名")
                {
                    ReadOnly = true,
                    Width = "12%",
                    MaxWidth = "200",
                    SortOrder = true,
                },
                new AntdUI.Column("ModName", "模组名")
                {
                    ReadOnly = true,
                    Width = "22%",
                    MaxWidth = "400",
                    SortOrder = true,
                },
                localCol,
                serverCol,
                hcCol,
                new AntdUI.Column("InputLocalModLabel", "本地导入")
                {
                    ReadOnly = true,
                    Width = "5%",
                    MaxWidth = "100",
                },
                new AntdUI.Column("BikeyStatus", "签名")
                {
                    ReadOnly = true,
                    Width = "3%",
                    MaxWidth = "50",
                    Align = AntdUI.ColumnAlign.Center,
                },
                new AntdUI.Column("ModPath", "路径")
                {
                    ReadOnly = true,
                    Width = "20%",
                    MaxWidth = "500",
                },
                new AntdUI.Column("UpdatedTime", "更新时间")
                {
                    ReadOnly = true,
                    Width = "9%",
                    MaxWidth = "150",
                    SortOrder = true,
                },
            };

            var optionsLayout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            autoCopyBikeyCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "自动复制密钥",
                SettingsLayoutHelper.CreateCheckbox("扫描模组时自动复制 bikey 到服务器 Keys 目录", true));
            AntLabel bikeyHint = AntdUiHelper.CreateHintLabel(
                "提示：Keys 目录中多余的 bikey 不影响服务器运行，游戏按实际加载的模组按需使用密钥。",
                560);
            optionsLayout.RowCount++;
            optionsLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            optionsLayout.Controls.Add(bikeyHint, 0, optionsLayout.RowCount - 1);
            optionsLayout.SetColumnSpan(bikeyHint, 2);
            dlcContactCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "Contact 资料片",
                SettingsLayoutHelper.CreateCheckbox("启用 Contact 资料片", false));
            dlcGmCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "GM 资料片",
                SettingsLayoutHelper.CreateCheckbox("启用 Global Mobilization 资料片", false));
            dlcCslaCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "CSLA 资料片",
                SettingsLayoutHelper.CreateCheckbox("启用 CSLA Iron Curtain 资料片", false));
            dlcWsCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "Western Sahara 资料片",
                SettingsLayoutHelper.CreateCheckbox("启用 Western Sahara 资料片", false));
            dlcVnCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "S.O.G. 资料片",
                SettingsLayoutHelper.CreateCheckbox("启用 S.O.G. Prairie Fire 资料片", false));
            AntLabel dlcHint = AntdUiHelper.CreateHintLabel(
                "提示：DLC 选项仅作为启动命令行参数，不写入 server.cfg。",
                560);
            optionsLayout.RowCount++;
            optionsLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            optionsLayout.Controls.Add(dlcHint, 0, optionsLayout.RowCount - 1);
            optionsLayout.SetColumnSpan(dlcHint, 2);

            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
            };
            SplitContainerHelper.BindProportionalSplit(split, 0.68, true, 180, 140);
            split.Panel1.Controls.Add(modsTable);
            split.Panel2.Controls.Add(SettingsLayoutHelper.CreateScrollHost(optionsLayout));

            Controls.Add(split);
            Controls.Add(bikeyReadinessBar);
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
            LoadRowsFromSavedMods();
            ScanMods();
        }

        public void BindForApply(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            autoCopyBikeyCheckBox.Checked = config.AutoCopyBikey;
            dlcContactCheckBox.Checked = config.StartupParameters.DLCcontact;
            dlcGmCheckBox.Checked = config.StartupParameters.DLCGM;
            dlcCslaCheckBox.Checked = config.StartupParameters.DLCCSLA;
            dlcWsCheckBox.Checked = config.StartupParameters.DLCWS;
            dlcVnCheckBox.Checked = config.StartupParameters.DLCVN;
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            if (allRows.Count == 0
                && boundConfig.StartupParameters != null
                && boundConfig.StartupParameters.modsEntities != null
                && boundConfig.StartupParameters.modsEntities.Count > 0)
            {
                boundConfig.AutoCopyBikey = autoCopyBikeyCheckBox.Checked;
                boundConfig.StartupParameters.DLCcontact = dlcContactCheckBox.Checked;
                boundConfig.StartupParameters.DLCGM = dlcGmCheckBox.Checked;
                boundConfig.StartupParameters.DLCCSLA = dlcCslaCheckBox.Checked;
                boundConfig.StartupParameters.DLCWS = dlcWsCheckBox.Checked;
                boundConfig.StartupParameters.DLCVN = dlcVnCheckBox.Checked;
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

            RefreshTableViewIfNeeded();
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

            RefreshTableViewIfNeeded();
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
                    SyncBikeysForRow(row);
                    changed = true;
                }
            }

            if (scope == ModDisableScope.HeadlessClient || scope == ModDisableScope.All)
            {
                if (row.HeadlessClientMod)
                {
                    row.HeadlessClientMod = false;
                    SyncBikeysForRow(row);
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

            appServices.BikeyService.CopyBikeysForMod(boundConfig, ToModsEntity(row));
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
            sortMode = (ModTableSortMode)SettingsLayoutHelper.Clamp(0, 3, sortSelect.SelectedIndex);
            visibilityFilter = (ModTableVisibilityFilter)SettingsLayoutHelper.Clamp(0, 2, visibilitySelect.SelectedIndex);
            RefreshTableView();
        }

        private void RefreshTableViewIfNeeded()
        {
            if (visibilityFilter == ModTableVisibilityFilter.All)
            {
                modsTable.Refresh();
                return;
            }

            RefreshTableView();
        }

        private async void ScanMods()
        {
            if (boundConfig == null)
            {
                return;
            }

            int currentVersion = Interlocked.Increment(ref scanVersion);
            UseWaitCursor = true;
            Stopwatch stopwatch = Stopwatch.StartNew();
            try
            {
                ArmaServerConfig config = boundConfig;
                SteamcmdEntity settings = appServices.GetSteamCmdSettings();
                ModScanResult scanResult = await Task.Run(
                    delegate
                    {
                        return appServices.ModScannerService.Scan(config, settings, includeBikeyStatus: false);
                    }).ConfigureAwait(true);

                if (currentVersion != scanVersion || IsDisposed)
                {
                    return;
                }

                allRows = scanResult.Rows;
                RefreshTableView();
                if (autoCopyBikeyCheckBox.Checked && allRows.Count > 0)
                {
                    CopyBikeysForAllRows(manualCopy: false);
                }

                if (scanResult.InaccessiblePaths.Count > 0)
                {
                    var message = new System.Text.StringBuilder();
                    message.AppendLine("以下扫描路径因权限不足无法访问，已跳过：");
                    for (int i = 0; i < scanResult.InaccessiblePaths.Count; i++)
                    {
                        message.AppendLine(scanResult.InaccessiblePaths[i]);
                    }

                    message.AppendLine();
                    message.Append("请检查模组扫描路径，避免使用系统受保护目录。");
                    AntdUiHelper.ShowWarning(FindForm(), message.ToString(), "模组扫描");
                }

                string context = "rows=" + scanResult.Rows.Count + ";server=" + config.ServerUUID;
                UiPerformanceProbe.LogDuration("ModSettings.ScanMods", stopwatch.ElapsedMilliseconds, context);
            }
            catch (Exception ex)
            {
                if (currentVersion == scanVersion && !IsDisposed)
                {
                    AntdUiHelper.ShowError(
                        FindForm(),
                        "扫描模组时发生错误：" + ex.Message,
                        "模组扫描");
                }
            }
            finally
            {
                if (currentVersion == scanVersion && !IsDisposed)
                {
                    UseWaitCursor = false;
                }
            }
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
            UpdateBikeyReadinessSummary();
        }

        private void UpdateBikeyReadinessSummary()
        {
            if (bikeySummaryLabel == null)
            {
                return;
            }

            ModBikeyReadinessSummary summary = appServices.ModBikeyReadinessService.SummarizeEnabledMods(allRows);
            bikeySummaryLabel.Text = "Bikey 就绪 · " + summary.ToSummaryText();
            if (copyMissingBikeyButton != null)
            {
                copyMissingBikeyButton.Enabled = summary.NeedsAttentionCount > 0
                    && boundConfig != null
                    && !string.IsNullOrEmpty(boundConfig.ServerDir);
            }
        }

        private void OnCopyMissingBikeys(object sender, EventArgs e)
        {
            if (boundConfig == null || string.IsNullOrEmpty(boundConfig.ServerDir))
            {
                AntdUiHelper.ShowWarning(FindForm(), "请先选择服务器并配置服务器目录。", "提示");
                return;
            }

            BikeyBulkCopyResult result = appServices.ModBikeyReadinessService.CopyMissingBikeysForEnabledMods(
                boundConfig,
                allRows);
            RefreshBikeyStatuses();

            if (result.ModsWithKeys == 0 && result.FailedModCount == 0)
            {
                AntdUiHelper.ShowInfo(
                    FindForm(),
                    "没有需要复制的 Bikey（已启用模组均已就绪或未签名）。",
                    "提示");
                return;
            }

            var message = new StringBuilder();
            message.Append("已为 ");
            message.Append(result.ModsWithKeys);
            message.Append(" 个模组复制 ");
            message.Append(result.KeyFileCount);
            message.Append(" 个 bikey 文件。");
            if (result.FailedModCount > 0)
            {
                message.Append(Environment.NewLine);
                message.Append("失败 ");
                message.Append(result.FailedModCount);
                message.Append(" 个模组。");
                AntdUiHelper.ShowWarning(FindForm(), message.ToString(), "复制完成");
                return;
            }

            AntdUiHelper.ShowInfo(FindForm(), message.ToString(), "复制完成");
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

            if (sortMode == ModTableSortMode.UpdatedTime)
            {
                return source.OrderByDescending(row => row.UpdatedAt ?? DateTime.MinValue);
            }

            return source.OrderBy(row => row.ScanOrder);
        }

        private void OnEditScanPaths(object sender, EventArgs e)
        {
            using (var dialog = new ModuleScanPathForm(appServices.ModScannerService.GetScanPaths()))
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                appServices.ModScannerService.SaveScanPaths(dialog.GetPaths());
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
                        true,
                        true,
                        false,
                        true));
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
            SteamcmdEntity settings = appServices.GetSteamCmdSettings();
            ModEnableUiHelper.TryEnableModsFromHtml(
                FindForm(),
                entries,
                boundConfig,
                settings,
                appServices.BikeyService,
                ScanMods,
                appServices.SteamCmdService,
                appServices.Paths,
                appServices.ModWorkshopWorkflow);
        }

        private async void OnDownloadSelected(object sender, EventArgs e)
        {
            SteamcmdEntity settings = appServices.GetSteamCmdSettings();
            var modIds = new List<ulong>();
            foreach (ScannedModRow row in allRows)
            {
                if (row.UpdateSelected && row.ModId > 0)
                {
                    modIds.Add((ulong)row.ModId);
                }
            }

            if (await ModDownloadUiHelper.TryDownloadModsAsync(
                    FindForm(),
                    modIds,
                    allRows,
                    settings,
                    appServices.SteamCmdService,
                    appServices.Paths).ConfigureAwait(true))
            {
                ScanMods();
            }
        }

        private async void OnPasteModIds(object sender, EventArgs e)
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

            SteamcmdEntity settings = appServices.GetSteamCmdSettings();
            if (await ModDownloadUiHelper.TryDownloadModsAsync(
                    FindForm(),
                    ids,
                    null,
                    settings,
                    appServices.SteamCmdService,
                    appServices.Paths).ConfigureAwait(true))
            {
                ScanMods();
            }
        }

        private async void OnImportFromHtmlDownload(object sender, EventArgs e)
        {
            List<LauncherHtmlModEntry> entries = TryLoadHtmlEntries();
            if (entries == null)
            {
                return;
            }

            SteamcmdEntity settings = appServices.GetSteamCmdSettings();
            if (await ModDownloadUiHelper.TryDownloadModsFromHtmlAsync(
                    FindForm(),
                    entries,
                    settings,
                    appServices.SteamCmdService,
                    appServices.Paths).ConfigureAwait(true))
            {
                ScanMods();
            }
        }

        private void OnManageBikeys(object sender, EventArgs e)
        {
            if (boundConfig == null || string.IsNullOrEmpty(boundConfig.ServerDir))
            {
                return;
            }

            List<string> keys = appServices.BikeyService.ListServerBikeys(boundConfig.ServerDir);
            using (var dialog = new BikeyListForm(boundConfig.ServerDir, keys))
            {
                dialog.ShowDialog(FindForm());
            }
        }

        private void OnCopyAllBikeys(object sender, EventArgs e)
        {
            if (boundConfig == null || string.IsNullOrEmpty(boundConfig.ServerDir))
            {
                AntdUiHelper.ShowWarning(FindForm(), "请先选择服务器并配置服务器目录。", "提示");
                return;
            }

            if (allRows.Count == 0)
            {
                AntdUiHelper.ShowInfo(FindForm(), "当前没有已扫描的模组，请先点击「扫描刷新」。", "提示");
                return;
            }

            var mods = new List<ModsEntity>(allRows.Count);
            foreach (ScannedModRow row in allRows)
            {
                mods.Add(ToModsEntity(row));
            }

            BikeyBulkCopyResult result = appServices.BikeyService.CopyBikeysForAllMods(
                boundConfig,
                mods,
                manualCopy: true);
            RefreshBikeyStatuses();

            var message = new StringBuilder();
            message.Append("已复制 ");
            message.Append(result.ModsWithKeys);
            message.Append(" 个模组的 ");
            message.Append(result.KeyFileCount);
            message.Append(" 个 bikey 文件到服务器 Keys 目录。");
            if (result.SkippedModCount > 0)
            {
                message.Append(Environment.NewLine);
                message.Append("跳过 ");
                message.Append(result.SkippedModCount);
                message.Append(" 个无密钥或未签名的模组。");
            }

            if (result.FailedModCount > 0)
            {
                message.Append(Environment.NewLine);
                message.Append("失败 ");
                message.Append(result.FailedModCount);
                message.Append(" 个模组：");
                for (int i = 0; i < result.Errors.Count; i++)
                {
                    message.Append(Environment.NewLine);
                    message.Append(result.Errors[i]);
                }

                AntdUiHelper.ShowWarning(FindForm(), message.ToString(), "复制完成");
                return;
            }

            if (result.ModsWithKeys == 0)
            {
                AntdUiHelper.ShowInfo(
                    FindForm(),
                    "未找到可复制的 bikey 文件。请确认模组目录内包含 .bikey 文件。",
                    "复制完成");
                return;
            }

            AntdUiHelper.ShowInfo(FindForm(), message.ToString(), "复制完成");
        }

        private void CopyBikeysForAllRows(bool manualCopy)
        {
            if (boundConfig == null || allRows.Count == 0)
            {
                return;
            }

            var mods = new List<ModsEntity>(allRows.Count);
            foreach (ScannedModRow row in allRows)
            {
                mods.Add(ToModsEntity(row));
            }

            appServices.BikeyService.CopyBikeysForAllMods(boundConfig, mods, manualCopy);
            RefreshBikeyStatuses();
        }

        private void LoadRowsFromSavedMods()
        {
            allRows.Clear();
            if (boundConfig == null
                || boundConfig.StartupParameters == null
                || boundConfig.StartupParameters.modsEntities == null)
            {
                RefreshTableView();
                return;
            }

            int scanOrder = 0;
            foreach (ModsEntity saved in boundConfig.StartupParameters.modsEntities)
            {
                if (saved == null || string.IsNullOrEmpty(saved.ModPath))
                {
                    continue;
                }

                var row = new ScannedModRow();
                row.ModPath = saved.ModPath;
                row.ModDirName = saved.ModDirName;
                row.ModName = string.IsNullOrEmpty(saved.ModName) ? saved.ModDirName : saved.ModName;
                row.ModId = saved.ModId;
                row.LocalMod = saved.LocalMod;
                row.ServerMod = saved.ServerMod;
                row.HeadlessClientMod = saved.HeadlessClientMod;
                row.InputLocalMod = saved.InputLocalMod;
                row.ScanOrder = scanOrder;
                scanOrder++;
                row.HasBikeyFile = false;
                row.BikeyStatus = "⚫";
                allRows.Add(row);
            }

            RefreshTableView();
        }

        private async void RefreshBikeyStatusesAsync()
        {
            if (boundConfig == null || allRows.Count == 0)
            {
                return;
            }

            string serverDir = boundConfig.ServerDir;
            List<ScannedModRow> rowsSnapshot = allRows.ToList();
            await Task.Run(
                delegate
                {
                    for (int i = 0; i < rowsSnapshot.Count; i++)
                    {
                        ScannedModRow row = rowsSnapshot[i];
                        ModBikeyInspectionResult inspection = appServices.BikeyService.InspectMod(
                            row.ModPath,
                            row.ModDirName,
                            serverDir);
                        row.HasBikeyFile = inspection.HasBikeyInMod;
                        row.BikeyStatus = inspection.StatusIcon;
                    }
                }).ConfigureAwait(true);

            if (IsDisposed)
            {
                return;
            }

            RefreshTableViewIfNeeded();
            UpdateBikeyReadinessSummary();
        }

        private void RefreshBikeyStatuses()
        {
            RefreshBikeyStatusesAsync();
        }

        private void OnGetModsMenuClick(object sender, AntdUI.ObjectNEventArgs e)
        {
            string key = Convert.ToString(e.Value);
            if (key == null)
            {
                return;
            }

            if (key == "add_local")
            {
                OnAddLocalMod(sender, EventArgs.Empty);
            }
            else if (key == "download")
            {
                OnDownloadSelected(sender, EventArgs.Empty);
            }
            else if (key == "paste")
            {
                OnPasteModIds(sender, EventArgs.Empty);
            }
            else if (key == "html_download")
            {
                OnImportFromHtmlDownload(sender, EventArgs.Empty);
            }
            else if (key == "html_enable")
            {
                OnImportFromHtmlEnable(sender, EventArgs.Empty);
            }
        }

        private void OnBikeyMenuClick(object sender, AntdUI.ObjectNEventArgs e)
        {
            string key = Convert.ToString(e.Value);
            if (key == null)
            {
                return;
            }

            if (key == "manage")
            {
                OnManageBikeys(sender, EventArgs.Empty);
            }
            else if (key == "copy_all")
            {
                OnCopyAllBikeys(sender, EventArgs.Empty);
            }
        }
    }
}
