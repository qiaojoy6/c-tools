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
    this.baseline()
    this.stop()
    this.timer = setInterval(() => this.poll(), this.getPollMs())
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 初始化基线：启动时不收录启动前已存在的剪贴内容 */
  private baseline(): void {
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
      const png = img.toPNG()
      const sig = `${size.width}x${size.height}:${png.byteLength}`
      if (sig !== this.lastImageSig) {
        this.lastImageSig = sig
        this.onCapture({
          type: 'image',
          base64: png.toString('base64'),
          width: size.width,
          height: size.height
        })
      }
    } catch (err) {
      // 系统剪贴板异常时不崩溃，等待下一轮
      console.error('[clipboard] poll error:', err)
    }
  }

  private imageSignature(): string {
    const img = clipboard.readImage()
    if (img.isEmpty()) return ''
    const size = img.getSize()
    return `${size.width}x${size.height}:${img.toPNG().byteLength}`
  }
}
