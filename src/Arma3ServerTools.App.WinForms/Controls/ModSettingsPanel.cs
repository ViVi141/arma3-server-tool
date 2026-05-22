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

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ModSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly DataGridView modsGrid;
        private readonly CheckBox autoCopyBikeyCheckBox;
        private readonly CheckBox dlcContactCheckBox;
        private readonly CheckBox dlcGmCheckBox;
        private readonly CheckBox dlcCslaCheckBox;
        private readonly CheckBox dlcWsCheckBox;
        private readonly CheckBox dlcVnCheckBox;

        private ArmaServerConfig boundConfig;
        private List<ScannedModRow> rows = new List<ScannedModRow>();

        public ModSettingsPanel()
        {
            Dock = DockStyle.Fill;
            Padding = new Padding(12);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            var refreshButton = new Button { Text = "扫描刷新", AutoSize = true };
            var scanPathButton = new Button { Text = "扫描路径...", AutoSize = true };
            var addLocalButton = new Button { Text = "添加本地模组", AutoSize = true };
            var downloadButton = new Button { Text = "下载选中模组", AutoSize = true };
            var pasteButton = new Button { Text = "从剪贴板导入 ID", AutoSize = true };
            var htmlDownloadButton = new Button { Text = "从 HTML 下载...", AutoSize = true };
            var htmlEnableButton = new Button { Text = "从 HTML 启用...", AutoSize = true };
            var bikeyButton = new Button { Text = "管理 Bikey", AutoSize = true };
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

            modsGrid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };
            modsGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "UpdateSelected", HeaderText = "更新" });
            modsGrid.Columns.Add("ModDirName", "文件夹名");
            modsGrid.Columns["ModDirName"].ReadOnly = true;
            modsGrid.Columns.Add("ModName", "模组名");
            modsGrid.Columns["ModName"].ReadOnly = true;
            modsGrid.Columns.Add("ModId", "Workshop ID");
            modsGrid.Columns["ModId"].ReadOnly = true;
            modsGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "LocalMod", HeaderText = "客户端模组" });
            modsGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "ServerMod", HeaderText = "服务器模组" });
            modsGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "HeadlessClientMod", HeaderText = "HC 模组" });
            modsGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "InputLocalMod", HeaderText = "本地导入" });
            modsGrid.Columns["InputLocalMod"].ReadOnly = true;
            modsGrid.Columns.Add("ModPath", "路径");
            modsGrid.Columns["ModPath"].ReadOnly = true;
            modsGrid.Columns.Add("UpdatedTime", "更新时间");
            modsGrid.Columns["UpdatedTime"].ReadOnly = true;
            modsGrid.CellValueChanged += OnModCellChanged;

            var optionsLayout = SettingsLayoutHelper.CreateFormLayout(120);
            autoCopyBikeyCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "AutoCopyBikey", new CheckBox { Text = "自动复制 bikey 到服务器 Keys", AutoSize = true, Checked = true });
            dlcContactCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "DLC Contact", new CheckBox { Text = "Contact DLC", AutoSize = true });
            dlcGmCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "DLC GM", new CheckBox { Text = "GM DLC", AutoSize = true });
            dlcCslaCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "DLC CSLA", new CheckBox { Text = "CSLA DLC", AutoSize = true });
            dlcWsCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "DLC WS", new CheckBox { Text = "Western Sahara DLC", AutoSize = true });
            dlcVnCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "DLC VN", new CheckBox { Text = "S.O.G. DLC", AutoSize = true });

            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 320,
            };
            split.Panel1.Controls.Add(modsGrid);
            split.Panel2.Controls.Add(SettingsLayoutHelper.CreateScrollHost(optionsLayout));

            Controls.Add(split);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                rows.Clear();
                modsGrid.Rows.Clear();
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

            SyncRowsFromGrid();
            boundConfig.StartupParameters.modsEntities.Clear();
            foreach (ScannedModRow row in rows)
            {
                boundConfig.StartupParameters.modsEntities.Add(new ModsEntity(
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

        private void ScanMods()
        {
            if (boundConfig == null)
            {
                return;
            }

            rows = AppServices.Instance.ModScannerService
                .Scan(boundConfig, AppServices.Instance.GetSteamCmdSettings())
                .ToList();
            ReloadGrid();
        }

        private void ReloadGrid()
        {
            modsGrid.Rows.Clear();
            foreach (ScannedModRow row in rows)
            {
                modsGrid.Rows.Add(
                    row.UpdateSelected,
                    row.ModDirName,
                    row.ModName,
                    row.ModId,
                    row.LocalMod,
                    row.ServerMod,
                    row.HeadlessClientMod,
                    row.InputLocalMod,
                    row.ModPath,
                    row.UpdatedTime);
            }
        }

        private void SyncRowsFromGrid()
        {
            rows.Clear();
            foreach (DataGridViewRow gridRow in modsGrid.Rows)
            {
                if (gridRow.IsNewRow)
                {
                    continue;
                }

                rows.Add(new ScannedModRow
                {
                    UpdateSelected = Convert.ToBoolean(gridRow.Cells["UpdateSelected"].Value ?? false),
                    ModDirName = Convert.ToString(gridRow.Cells["ModDirName"].Value),
                    ModName = Convert.ToString(gridRow.Cells["ModName"].Value),
                    ModId = Convert.ToInt64(gridRow.Cells["ModId"].Value ?? 0L),
                    LocalMod = Convert.ToBoolean(gridRow.Cells["LocalMod"].Value ?? false),
                    ServerMod = Convert.ToBoolean(gridRow.Cells["ServerMod"].Value ?? false),
                    HeadlessClientMod = Convert.ToBoolean(gridRow.Cells["HeadlessClientMod"].Value ?? false),
                    InputLocalMod = Convert.ToBoolean(gridRow.Cells["InputLocalMod"].Value ?? false),
                    ModPath = Convert.ToString(gridRow.Cells["ModPath"].Value),
                    UpdatedTime = Convert.ToString(gridRow.Cells["UpdatedTime"].Value),
                });
            }
        }

        private void OnModCellChanged(object sender, DataGridViewCellEventArgs e)
        {
            if (boundConfig == null || e.RowIndex < 0)
            {
                return;
            }

            SyncRowsFromGrid();
            if (e.RowIndex >= rows.Count)
            {
                return;
            }

            ScannedModRow row = rows[e.RowIndex];
            var mod = new ModsEntity(row.ModPath, row.ModDirName, row.ModName, row.ModId, row.LocalMod, row.ServerMod, row.HeadlessClientMod, row.InputLocalMod);
            AppServices.Instance.BikeyService.CopyBikeysForMod(boundConfig, mod);
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
                    MessageBox.Show("所选目录不是有效的 Arma3 模组目录（缺少 addons）。", "无效模组", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                ApplyToModel();
                boundConfig.StartupParameters.modsEntities.Add(new ModsEntity(
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
            SyncRowsFromGrid();
            var modIds = new List<ulong>();
            foreach (ScannedModRow row in rows)
            {
                if (row.UpdateSelected && row.ModId > 0)
                {
                    modIds.Add((ulong)row.ModId);
                }
            }

            if (ModDownloadUiHelper.TryDownloadMods(
                FindForm(),
                modIds,
                rows,
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
                MessageBox.Show("剪贴板中未找到 Workshop ID。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
                    MessageBox.Show("读取 HTML 失败: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return null;
                }

                List<LauncherHtmlModEntry> entries = LauncherHtmlModParser.Parse(html);
                if (entries.Count == 0)
                {
                    MessageBox.Show("没有从 HTML 中解析到 Workshop 模组 ID。", "读取失败", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
            if (ModEnableUiHelper.TryEnableModsFromHtml(
                FindForm(),
                entries,
                boundConfig,
                settings,
                AppServices.Instance.SteamCmdService,
                AppServices.Instance.BikeyService,
                ScanMods))
            {
            }
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

            MessageBox.Show(builder.ToString(), "Bikey 列表", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
