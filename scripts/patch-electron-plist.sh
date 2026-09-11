#!/usr/bin/env bash
# 给开发态 Electron.app 写入麦克风/系统声用途描述，否则 Process Tap 无法弹权/采声
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$ROOT/node_modules/electron/dist/Electron.app/Contents/Info.plist"
if [[ ! -f "$PLIST" ]]; then
  echo "skip: Electron Info.plist not found"
  exit 0
fi

set_key() {
  local key="$1"
  local val="$2"
  if /usr/libexec/PlistBuddy -c "Print :$key" "$PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :$key $val" "$PLIST"
  else
    /usr/libexec/PlistBuddy -c "Add :$key string $val" "$PLIST"
  fi
}

set_key NSMicrophoneUsageDescription "c-tools 需要使用麦克风以便在录屏时采集人声。"
set_key NSAudioCaptureUsageDescription "c-tools 需要采集系统声音以便录屏时收录电脑播放的音频。"
echo "patched $PLIST"
