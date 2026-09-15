#!/usr/bin/env bash
# 编译 recorder-napi + focus-paste-napi，并拷贝到项目 native/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/native"

mkdir -p "$OUT_DIR"

bash "$ROOT/scripts/patch-electron-plist.sh" || true

build_napi() {
  local NAPI_DIR="$1"
  local GLOB_PREFIX="$2"

  if [[ ! -d "$NAPI_DIR/node_modules/@napi-rs/cli" ]]; then
    (cd "$NAPI_DIR" && npm install --no-fund --no-audit)
  fi

  (cd "$NAPI_DIR" && npm run build)

  shopt -s nullglob
  for f in "$NAPI_DIR"/${GLOB_PREFIX}.*.node; do
    cp -f "$f" "$OUT_DIR/"
    echo "copied $(basename "$f") -> native/"
  done
}

build_napi "$ROOT/native-rs/recorder-napi" "recorder"
build_napi "$ROOT/native-rs/focus-paste-napi" "focus-paste"

echo "done. binaries in $OUT_DIR"
ls -la "$OUT_DIR"
