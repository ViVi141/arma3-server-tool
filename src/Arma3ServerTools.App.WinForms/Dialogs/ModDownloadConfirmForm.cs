using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Services;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class ModDownloadConfirmForm : AntdDialogForm
    {
        private readonly AntTable grid;
        private readonly AntLabel statusLabel;
        private readonly List<SteamWorkshopModInfo> mods;

        public ModDownloadConfirmForm(IList<ulong> modIds)
            : this(ConvertIds(modIds))
        {
        }

        public ModDownloadConfirmForm(IList<LauncherHtmlModEntry> htmlEntries)
            : this(ConvertHtmlEntries(htmlEntries))
        {
            statusLabel.Text = "已从 HTML 解析 " + mods.Count + " 个模组，请勾选需要下载的项。";
        }

        private ModDownloadConfirmForm(List<SteamWorkshopModInfo> initialMods)
            : base()
        {
            Text = "确认需要更新/下载的模组";
            ApplyPreferredDialogSizing(900, 520, null);

            mods = initialMods;

            statusLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = UiScaleHelper.ScalePadding(12, 6),
                Text = "正在从 Steam API 加载模组信息...",
            };

            grid = AntdTableHelper.CreateStandardTable();
            grid.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.ColumnCheck("Selected", "确认下载") { Width = "10%", Editable = true },
                new AntdUI.Column("Title", "模组名称") { Width = "24%", Ellipsis = true, ReadOnly = true },
                new AntdUI.Column("ModId", "Workshop ID") { Width = "14%", Align = AntdUI.ColumnAlign.Center },
                new AntdUI.Column("FileSizeMb", "大小") { Width = "10%", Align = AntdUI.ColumnAlign.Center },
                new AntdUI.Column("Description", "描述") { Width = "42%", Ellipsis = true, ReadOnly = true },
            };
            grid.CheckedChanged += OnGridCheckedChanged;

            var cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var okButton = AntdUiHelper.CreatePrimaryButton("开始下载");
            okButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };

            Control buttonBar = CreateButtonBar(okButton, cancelButton, "开始下载", "取消");

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(grid);

            Controls.Add(buttonBar);
            Controls.Add(statusLabel);
            Controls.Add(filler);

            ReloadTable();
            Shown += OnShown;
        }

        public IList<ulong> GetSelectedModIds()
        {
            var result = new List<ulong>();
            foreach (SteamWorkshopModInfo mod in mods)
            {
                if (mod.Selected)
                {
                    result.Add(mod.ModId);
                }
            }

            return result;
        }

        private async void OnShown(object sender, EventArgs e)
        {
            var ids = new List<ulong>();
            foreach (SteamWorkshopModInfo mod in mods)
            {
                ids.Add(mod.ModId);
            }

            try
            {
                List<SteamWorkshopModInfo> loaded = await new SteamWorkshopApiService()
                    .FetchModDetailsAsync(ids, default)
                    .ConfigureAwait(true);

                if (loaded.Count > 0)
                {
                    MergeLoadedDetails(loaded);
                    statusLabel.Text = "已加载 " + mods.Count + " 个模组，请勾选确认后下载。";
                }
                else
                {
                    statusLabel.Text = "无法加载 Steam 详情，仍可按 HTML/ID 勾选下载。";
                }
            }
            catch
            {
                statusLabel.Text = "加载 Steam 详情失败，仍可按 HTML/ID 勾选下载。";
            }

            if (!IsDisposed)
            {
                ReloadTable();
            }
        }

        private void OnGridCheckedChanged(object sender, AntdUI.TableCheckEventArgs e)
        {
            var modInfo = e.Record as SteamWorkshopModInfo;
            if (modInfo == null)
            {
                return;
            }

            modInfo.Selected = e.Value;
        }

        private void MergeLoadedDetails(List<SteamWorkshopModInfo> loaded)
        {
            var selectedById = new Dictionary<ulong, bool>();
            var titleById = new Dictionary<ulong, string>();
            foreach (SteamWorkshopModInfo mod in mods)
            {
                selectedById[mod.ModId] = mod.Selected;
                if (!string.IsNullOrWhiteSpace(mod.Title) && !mod.Title.StartsWith("Workshop ", StringComparison.Ordinal))
                {
                    titleById[mod.ModId] = mod.Title;
                }
            }

            mods.Clear();
            foreach (SteamWorkshopModInfo loadedMod in loaded)
            {
                bool selected = true;
                if (selectedById.ContainsKey(loadedMod.ModId))
                {
                    selected = selectedById[loadedMod.ModId];
                }

                if (titleById.ContainsKey(loadedMod.ModId)
                    && (string.IsNullOrWhiteSpace(loadedMod.Title) || loadedMod.Title.StartsWith("Workshop ", StringComparison.Ordinal)))
                {
                    loadedMod.Title = titleById[loadedMod.ModId];
                }

                loadedMod.Selected = selected;
                mods.Add(loadedMod);
            }

            foreach (ulong missingId in selectedById.Keys)
            {
                bool exists = false;
                foreach (SteamWorkshopModInfo mod in mods)
                {
                    if (mod.ModId == missingId)
                    {
                        exists = true;
                        break;
                    }
                }

                if (!exists)
                {
                    string missingTitle;
                    if (titleById.ContainsKey(missingId))
                    {
                        missingTitle = titleById[missingId];
                    }
                    else
                    {
                        missingTitle = "Workshop " + missingId;
                    }

                    mods.Add(new SteamWorkshopModInfo
                    {
                        ModId = missingId,
                        Title = missingTitle,
                        Selected = selectedById[missingId],
                        FileSizeMb = "-",
                        Description = string.Empty,
                    });
                }
            }
        }

        private void ReloadTable()
        {
            grid.DataSource = null;
            AntdTableHelper.BindList(grid, mods);
        }

        private static List<SteamWorkshopModInfo> ConvertIds(IList<ulong> modIds)
        {
            var result = new List<SteamWorkshopModInfo>();
            foreach (ulong modId in modIds)
            {
                result.Add(new SteamWorkshopModInfo
                {
                    ModId = modId,
                    Title = "加载中...",
                    Selected = true,
                });
            }

            return result;
        }

        private static List<SteamWorkshopModInfo> ConvertHtmlEntries(IList<LauncherHtmlModEntry> htmlEntries)
        {
            var result = new List<SteamWorkshopModInfo>();
            foreach (LauncherHtmlModEntry entry in htmlEntries)
            {
                string title = entry.DisplayName;
                if (string.IsNullOrWhiteSpace(title))
                {
                    title = "Workshop " + entry.ModId;
                }

                result.Add(new SteamWorkshopModInfo
                {
                    ModId = entry.ModId,
                    Title = title,
                    Selected = entry.Selected,
                });
            }

            return result;
        }
    }
}
