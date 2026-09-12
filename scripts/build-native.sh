#!/usr/bin/env bash
# 编译 recorder-napi 并拷贝到项目 native/（供 Electron 主进程加载）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAPI_DIR="$ROOT/native-rs/recorder-napi"
OUT_DIR="$ROOT/native"

mkdir -p "$OUT_DIR"

bash "$ROOT/scripts/patch-electron-plist.sh" || true

if [[ ! -d "$NAPI_DIR/node_modules/@napi-rs/cli" ]]; then
  (cd "$NAPI_DIR" && npm install --no-fund --no-audit)
fi

(cd "$NAPI_DIR" && npm run build)

shopt -s nullglob
for f in "$NAPI_DIR"/recorder.*.node; do
  cp -f "$f" "$OUT_DIR/"
  echo "copied $(basename "$f") -> native/"
done

echo "done. binaries in $OUT_DIR"
ls -la "$OUT_DIR"
