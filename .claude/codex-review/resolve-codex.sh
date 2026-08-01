#!/usr/bin/env bash
# Dò binary Codex mới nhất và in ra stdout.
#
# Vì sao cần: máy có thể có nhiều bản Codex cùng lúc —
#   - npm global (`codex` trong PATH), thường CŨ HƠN
#   - binary đi kèm app Codex, đường dẫn chứa mã hash đổi mỗi lần cập nhật
# Bản cũ không chạy được model của tài khoản ChatGPT hiện tại
# (lỗi: "requires a newer version of Codex").
#
# Chiến lược: ưu tiên binary app mới nhất, fallback về PATH.

set -uo pipefail

APP_BIN_DIR="$HOME/AppData/Local/OpenAI/Codex/bin"
BEST=""
BEST_VER=""

ver_of() { "$1" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1; }

# So sánh phiên bản theo thứ tự số (không phải chuỗi)
newer() {
  [ -z "$2" ] && return 0
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ] && [ "$1" != "$2" ]
}

if [ -d "$APP_BIN_DIR" ]; then
  while IFS= read -r c; do
    [ -x "$c" ] || continue
    v=$(ver_of "$c"); [ -n "$v" ] || continue
    if newer "$v" "$BEST_VER"; then BEST="$c"; BEST_VER="$v"; fi
  done < <(find "$APP_BIN_DIR" -maxdepth 2 -name 'codex.exe' 2>/dev/null)
fi

# Fallback: bản trong PATH
if [ -z "$BEST" ] && command -v codex >/dev/null 2>&1; then
  BEST="$(command -v codex)"; BEST_VER="$(ver_of "$BEST")"
fi

if [ -z "$BEST" ]; then
  echo "ERROR: không tìm thấy binary codex nào" >&2
  exit 1
fi

echo "$BEST"
echo "codex $BEST_VER  ($BEST)" >&2
