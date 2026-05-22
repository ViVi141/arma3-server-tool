using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class ModDownloadConfirmForm : Form
    {
        private readonly DataGridView grid;
        private readonly Label statusLabel;
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
        {
            Text = "确认需要更新/下载的模组";
            Width = 900;
            Height = 520;
            StartPosition = FormStartPosition.CenterParent;
            mods = initialMods;

            statusLabel = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(12, 12, 12, 6),
                Text = "正在从 Steam API 加载模组信息...",
            };

            grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                ReadOnly = false,
            };
            grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Selected", HeaderText = "确认下载" });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Title", HeaderText = "模组名称", ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "ModId", HeaderText = "Workshop ID", ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "FileSizeMb", HeaderText = "大小", ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Description", HeaderText = "描述", ReadOnly = true });

            var okButton = new Button { Text = "开始下载", DialogResult = DialogResult.OK, Width = 90 };
            var cancelButton = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 90 };
            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 44,
                Padding = new Padding(12, 6, 12, 8),
            };
            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(okButton);

            Controls.Add(grid);
            Controls.Add(statusLabel);
            Controls.Add(buttons);
            AcceptButton = okButton;
            CancelButton = cancelButton;

            ReloadGrid();
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
                List<SteamWorkshopModInfo> loaded = await Task.Run(
                    delegate
                    {
                        return new SteamWorkshopApiService().FetchModDetails(ids);
                    }).ConfigureAwait(true);

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

            ReloadGrid();
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
                    mods.Add(new SteamWorkshopModInfo
                    {
                        ModId = missingId,
                        Title = titleById.ContainsKey(missingId) ? titleById[missingId] : "Workshop " + missingId,
                        Selected = selectedById[missingId],
                        FileSizeMb = "-",
                        Description = string.Empty,
                    });
                }
            }
        }

        private void ReloadGrid()
        {
            grid.Rows.Clear();
            foreach (SteamWorkshopModInfo mod in mods)
            {
                grid.Rows.Add(mod.Selected, mod.Title, mod.ModId, mod.FileSizeMb, mod.Description);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (DialogResult == DialogResult.OK)
            {
                for (int i = 0; i < grid.Rows.Count; i++)
                {
                    if (i >= mods.Count)
                    {
                        break;
                    }

                    object cellValue = grid.Rows[i].Cells["Selected"].Value;
                    mods[i].Selected = cellValue != null && Convert.ToBoolean(cellValue);
                }
            }

            base.OnFormClosing(e);
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
