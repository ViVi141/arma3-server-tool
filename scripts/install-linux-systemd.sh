#!/usr/bin/env bash
# 按当前便携包路径生成 systemd 单元并安装。
# 默认写 user 单元（无需 root）；加 --system 则安装系统单元（需要 sudo）。
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="user"
if [ "${1:-}" = "--system" ]; then MODE="system"; fi

if [ ! -f "$DIR/a3st.env" ]; then
  echo "错误：缺少 $DIR/a3st.env（请先从 a3st.env.example 复制并填写）。" >&2
  exit 1
fi

# API_TOKEN 等密钥不得世界可读。
chmod 600 "$DIR/a3st.env" || true
ENV_MODE="$(stat -c '%a' "$DIR/a3st.env" 2>/dev/null || stat -f '%OLp' "$DIR/a3st.env" 2>/dev/null || echo unknown)"
if [ "$ENV_MODE" != "600" ] && [ "$ENV_MODE" != "0600" ]; then
  echo "警告：无法将 a3st.env 权限设为 600（当前 $ENV_MODE）。请手动 chmod 600。" >&2
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "$NODE_BIN" ]; then
  echo "错误：找不到 node，请先安装 Node.js >= 20 并确保在 PATH 中。" >&2
  exit 1
fi
# systemd 不会加载交互式 shell 的 PATH；写入绝对路径。
NODE_BIN="$(readlink -f "$NODE_BIN" 2>/dev/null || realpath "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")"

UNIT_NAME="a3st.service"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"
# SSH 非登录会话常缺少 user systemd 总线；显式补齐后才能 systemctl --user。
if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "$XDG_RUNTIME_DIR/bus" ]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi
DATA_DIR_VALUE="$DIR/data"
if grep -q "^DATA_DIR=" "$DIR/a3st.env"; then
  DATA_DIR_VALUE="$(grep "^DATA_DIR=" "$DIR/a3st.env" | head -1 | cut -d= -f2- | tr -d '\r')"
fi
case "$DATA_DIR_VALUE" in
  /*) ;;
  *) DATA_DIR_VALUE="$DIR/$DATA_DIR_VALUE" ;;
esac

write_unit() {
  local wanted_by="$1"
  local extra_user="$2"
  cat <<EOF
[Unit]
Description=Arma3 Server Tools (Service + Web UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
$extra_user
WorkingDirectory=$DIR
EnvironmentFile=$DIR/a3st.env
Environment=WEB_ROOT=$DIR/web
Environment=DATA_DIR=$DATA_DIR_VALUE
ExecStart=$NODE_BIN $DIR/service/dist/index.js
Restart=on-failure
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=$wanted_by
EOF
}

if [ "$MODE" = "system" ]; then
  TARGET="/etc/systemd/system/$UNIT_NAME"
  write_unit "multi-user.target" "User=$RUN_USER
Group=$RUN_GROUP" | sudo tee "$TARGET" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$UNIT_NAME"
  echo "已安装系统单元：$TARGET"
  echo "查看日志：sudo journalctl -u $UNIT_NAME -f"
else
  mkdir -p "$HOME/.config/systemd/user"
  TARGET="$HOME/.config/systemd/user/$UNIT_NAME"
  write_unit "default.target" "" > "$TARGET"
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT_NAME"
  loginctl enable-linger "$RUN_USER" 2>/dev/null || true
  echo "已安装用户单元：$TARGET"
  echo "查看日志：journalctl --user -u $UNIT_NAME -f"
fi
