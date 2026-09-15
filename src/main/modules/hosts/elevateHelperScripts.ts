/** macOS root helper：仅允许写指定 hosts 路径 */
export function buildMacHelperScript(): string {
  return `#!/bin/bash
set -u
DIR="$1"
HOSTS_PATH="$2"
TTL="\${3:-600}"
DEADLINE=$((SECONDS + TTL))
printf '%s' "$(($(date +%s) * 1000))" > "$DIR/heartbeat"
printf '1\\n' > "$DIR/ready"
while (( SECONDS < DEADLINE )); do
  printf '%s' "$(($(date +%s) * 1000))" > "$DIR/heartbeat"
  REQ="$DIR/request"
  if [[ -f "$REQ" ]]; then
    ACTION=""; SRC=""; DEST=""
    {
      IFS= read -r ACTION
      IFS= read -r SRC
      IFS= read -r DEST || true
    } < "$REQ" || true
    rm -f "$REQ"
    if [[ "$ACTION" == "WRITE" && "$DEST" == "$HOSTS_PATH" && -n "$SRC" && -f "$SRC" ]]; then
      if cp "$SRC" "$DEST"; then
        dscacheutil -flushcache >/dev/null 2>&1 || true
        killall -HUP mDNSResponder >/dev/null 2>&1 || true
        printf 'OK\\n' > "$DIR/response"
        DEADLINE=$((SECONDS + TTL))
      else
        printf 'ERR copy failed\\n' > "$DIR/response"
      fi
    elif [[ "$ACTION" == "PING" ]]; then
      printf 'OK\\n' > "$DIR/response"
      DEADLINE=$((SECONDS + TTL))
    elif [[ "$ACTION" == "SHUTDOWN" ]]; then
      printf 'OK\\n' > "$DIR/response"
      exit 0
    else
      printf 'ERR invalid request\\n' > "$DIR/response"
    fi
  fi
  sleep 0.05
done
exit 0
`
}

/** Windows Admin helper */
export function buildWinHelperScript(): string {
  return `param(
  [Parameter(Mandatory=$true)][string]$Dir,
  [Parameter(Mandatory=$true)][string]$HostsPath,
  [int]$TtlSec = 600
)
$ErrorActionPreference = "Stop"
$deadline = (Get-Date).AddSeconds($TtlSec)
function Touch-Heartbeat {
  $ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Set-Content -LiteralPath (Join-Path $Dir "heartbeat") -Value "$ms" -Encoding ascii -NoNewline
}
Touch-Heartbeat
Set-Content -LiteralPath (Join-Path $Dir "ready") -Value "1" -Encoding ascii
while ((Get-Date) -lt $deadline) {
  Touch-Heartbeat
  $req = Join-Path $Dir "request"
  if (Test-Path -LiteralPath $req) {
    $lines = Get-Content -LiteralPath $req -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $req -Force -ErrorAction SilentlyContinue
    $action = if ($lines.Count -ge 1) { $lines[0].Trim() } else { "" }
    $src = if ($lines.Count -ge 2) { $lines[1].Trim() } else { "" }
    $dest = if ($lines.Count -ge 3) { $lines[2].Trim() } else { "" }
    $res = Join-Path $Dir "response"
    if ($action -eq "WRITE" -and $dest -eq $HostsPath -and $src -ne "" -and (Test-Path -LiteralPath $src)) {
      try {
        Copy-Item -LiteralPath $src -Destination $HostsPath -Force
        ipconfig /flushdns | Out-Null
        Set-Content -LiteralPath $res -Value "OK" -Encoding ascii
        $deadline = (Get-Date).AddSeconds($TtlSec)
      } catch {
        Set-Content -LiteralPath $res -Value ("ERR " + $_.Exception.Message) -Encoding ascii
      }
    } elseif ($action -eq "PING") {
      Set-Content -LiteralPath $res -Value "OK" -Encoding ascii
      $deadline = (Get-Date).AddSeconds($TtlSec)
    } elseif ($action -eq "SHUTDOWN") {
      Set-Content -LiteralPath $res -Value "OK" -Encoding ascii
      exit 0
    } else {
      Set-Content -LiteralPath $res -Value "ERR invalid request" -Encoding ascii
    }
  }
  Start-Sleep -Milliseconds 50
}
`
}
