import { app, desktopCapturer, screen } from 'electron'
import { execFile } from 'child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import type { ShotDisplayFrame } from '@shared/types'

const execFileAsync = promisify(execFile)

/** 内存中的冻结帧（协议直出，避免二次读盘） */
const frameBuffers = new Map<string, Buffer>()

export function screenshotTempDir(): string {
  return join(app.getPath('userData'), 'screenshot-temp')
}

export function getFrameBuffer(fileName: string): Buffer | undefined {
  return frameBuffers.get(fileName)
}

export function clearFrameBuffers(): void {
  frameBuffers.clear()
}

/** 清理临时目录与内存帧 */
export function resetScreenshotTemp(): string {
  clearFrameBuffers()
  const dir = screenshotTempDir()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

function frameFileName(displayId: number): string {
  return `display-${displayId}.png`
}

function storeFrame(displayId: number, png: Buffer, dir: string): string {
  const fileName = frameFileName(displayId)
  frameBuffers.set(fileName, png)
  const imagePath = join(dir, fileName)
  // 异步落盘兜底，不挡关键路径
  setImmediate(() => {
    try {
      writeFileSync(imagePath, png)
    } catch {
      /* ignore */
    }
  })
  return imagePath
}

/**
 * 抓取所有显示器冻结帧。
 * macOS：screencapture 原生分辨率（更清晰、通常更快）
 * 其它：desktopCapturer 按屏精确尺寸，禁止放大糊化
 */
export async function captureAllDisplays(): Promise<ShotDisplayFrame[]> {
  const dir = resetScreenshotTemp()
  if (process.platform === 'darwin') {
    return captureMac(dir)
  }
  return captureDesktopCapturer(dir)
}

/** macOS：按显示器并行 screencapture */
async function captureMac(dir: string): Promise<ShotDisplayFrame[]> {
  const displays = screen.getAllDisplays()
  const tasks = displays.map(async (display) => {
    const fileName = frameFileName(display.id)
    const imagePath = join(dir, fileName)
    try {
      // -D 使用 CGDirectDisplayID（与 Electron display.id 一致）
      await execFileAsync(
        '/usr/sbin/screencapture',
        ['-x', '-t', 'png', '-D', String(display.id), imagePath],
        { timeout: 5000 }
      )
      const png = readFileSync(imagePath)
      frameBuffers.set(fileName, png)
      return {
        displayId: display.id,
        bounds: {
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height
        },
        workArea: {
          x: display.workArea.x,
          y: display.workArea.y,
          width: display.workArea.width,
          height: display.workArea.height
        },
        scaleFactor: display.scaleFactor,
        imagePath
      } satisfies ShotDisplayFrame
    } catch (err) {
      console.warn('[screenshot] screencapture failed, fallback capturer:', display.id, err)
      return null
    }
  })

  const results = await Promise.all(tasks)
  const frames = results.filter((f): f is ShotDisplayFrame => Boolean(f))
  if (frames.length) return frames
  // 全部失败则回退
  return captureDesktopCapturer(dir)
}

/** desktopCapturer：逐屏请求精确物理像素，避免大画布塞小屏再拉伸 */
async function captureDesktopCapturer(dir: string): Promise<ShotDisplayFrame[]> {
  const displays = screen.getAllDisplays()
  const frames: ShotDisplayFrame[] = []

  // 并行按屏抓取（比一次超大 thumbnail 更清晰）
  await Promise.all(
    displays.map(async (display) => {
      const physW = Math.max(1, Math.round(display.size.width * display.scaleFactor))
      const physH = Math.max(1, Math.round(display.size.height * display.scaleFactor))
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: physW, height: physH },
          fetchWindowIcons: false
        })
        const source =
          sources.find((s) => s.display_id === String(display.id)) ||
          (displays.length === 1 ? sources[0] : undefined)
        if (!source || source.thumbnail.isEmpty()) {
          console.warn('[screenshot] 缺少显示器源:', display.id)
          return
        }

        let img = source.thumbnail
        const size = img.getSize()
        // 仅缩小、绝不放大（放大必糊）
        if (size.width > physW || size.height > physH) {
          img = img.resize({ width: physW, height: physH, quality: 'best' })
        }

        const png = img.toPNG()
        const imagePath = storeFrame(display.id, png, dir)
        frames.push({
          displayId: display.id,
          bounds: {
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height
          },
          workArea: {
            x: display.workArea.x,
            y: display.workArea.y,
            width: display.workArea.width,
            height: display.workArea.height
          },
          scaleFactor: display.scaleFactor,
          imagePath
        })
      } catch (err) {
        console.warn('[screenshot] capturer failed:', display.id, err)
      }
    })
  )

  return frames
}
