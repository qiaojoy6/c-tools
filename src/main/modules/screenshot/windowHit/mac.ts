import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ShotWindowInfo } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * macOS：只枚举「当前屏幕上能看见」的顶层窗口（CoreGraphics）。
 * CFArray 在 JXA 里不是 NSArray，须用 CFArrayGetValueAtIndex + castRefToObject。
 */
export async function listWindowsMac(): Promise<ShotWindowInfo[]> {
  const script = `
    ObjC.import('CoreGraphics');
    const opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
    const list = $.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID);
    const n = Number($.CFArrayGetCount(list));
    const skipOwners = {
      Dock: 1, WindowServer: 1, 'Window Server': 1, 'Control Center': 1,
      Wallpaper: 1, 'Notification Centre': 1, 'Notification Center': 1,
      loginwindow: 1, ScreenSaverEngine: 1, Spotlight: 1
    };
    const out = [];
    for (let i = 0; i < n; i++) {
      const info = ObjC.deepUnwrap(ObjC.castRefToObject($.CFArrayGetValueAtIndex(list, i)));
      if (!info) continue;
      const layer = Number(info.kCGWindowLayer || 0);
      if (layer !== 0) continue;
      const alpha = Number(info.kCGWindowAlpha != null ? info.kCGWindowAlpha : 1);
      if (alpha < 0.1) continue;
      const owner = String(info.kCGWindowOwnerName || '');
      if (skipOwners[owner] === 1) continue;
      if (/^c-tools$/i.test(owner) || /Electron/i.test(owner)) continue;
      const b = info.kCGWindowBounds || {};
      const x = Number(b.X || 0), y = Number(b.Y || 0);
      const w = Number(b.Width || 0), h = Number(b.Height || 0);
      if (w < 120 || h < 80) continue;
      const title = String(info.kCGWindowName || owner || 'Window');
      const wid = String(info.kCGWindowNumber || i);
      out.push({
        id: wid,
        title: title,
        bounds: { x: x, y: y, width: w, height: h }
      });
    }
    JSON.stringify(out);
  `

  try {
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
      timeout: 2500,
      maxBuffer: 2 * 1024 * 1024
    })
    const parsed = JSON.parse(String(stdout).trim()) as ShotWindowInfo[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('[screenshot] mac on-screen window list failed (将仅框选):', err)
    return []
  }
}
