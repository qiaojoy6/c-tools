import { clipboard } from 'electron'

export interface ClipboardCapture {
  type: 'text' | 'image'
  text?: string
  base64?: string
  width?: number
  height?: number
}

/**
 * 剪贴板监听器：轮询系统剪贴板，捕获文本 / 图片变化
 */
export class ClipboardWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastText = ''
  private lastImageSig = ''

  constructor(
    private getPollMs: () => number,
    private onCapture: (capture: ClipboardCapture) => void
  ) {}

  start(): void {
    this.syncBaseline()
    this.stop()
    this.timer = setInterval(() => this.poll(), this.getPollMs())
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 将当前剪贴板设为基线（粘贴写入后调用，避免重复入库与额外读图） */
  syncBaseline(): void {
    this.lastText = clipboard.readText()
    this.lastImageSig = this.imageSignature()
  }

  private poll(): void {
    try {
      const text = clipboard.readText()
      if (text && text !== this.lastText) {
        this.lastText = text
        this.lastImageSig = this.imageSignature()
        this.onCapture({ type: 'text', text })
        return
      }

      // 文本未变化时检测图片
      const img = clipboard.readImage()
      if (img.isEmpty()) {
        this.lastImageSig = ''
        return
      }
      const size = img.getSize()
      const sig = `${size.width}x${size.height}:${img.toBitmap().byteLength}`
      if (sig !== this.lastImageSig) {
        this.lastImageSig = sig
        // 仅在确认变更时才做 PNG 编码入库
        this.onCapture({
          type: 'image',
          base64: img.toPNG().toString('base64'),
          width: size.width,
          height: size.height
        })
      }
    } catch (err) {
      // 系统剪贴板异常时不崩溃，等待下一轮
      console.error('[clipboard] poll error:', err)
    }
  }

  /** 轻量签名：避免轮询路径上反复 toPNG（会卡住系统剪贴板） */
  private imageSignature(): string {
    const img = clipboard.readImage()
    if (img.isEmpty()) return ''
    const size = img.getSize()
    return `${size.width}x${size.height}:${img.toBitmap().byteLength}`
  }
}
