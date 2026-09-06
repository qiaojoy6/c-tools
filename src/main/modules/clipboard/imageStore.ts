import { createHash } from 'crypto'
import { app, net, nativeImage, protocol } from 'electron'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { ClipImage } from '@shared/types'

/** 自定义协议：渲染进程用 clipimg://local/{fileId} 读本地图片 */
export const CLIP_IMG_SCHEME = 'clipimg'

/**
 * 剪贴板图片磁盘存储：二进制文件 + hash 去重。
 * JSON 只存元数据；删除记录后由 purgeOrphans 清掉无引用文件。
 */
export class ClipboardImageStore {
  readonly dir: string

  constructor(dir = join(app.getPath('userData'), 'clipboard-images')) {
    this.dir = dir
    mkdirSync(this.dir, { recursive: true })
  }

  absolutePath(fileId: string): string {
    return join(this.dir, fileId)
  }

  /** 校验 fileId，防止路径穿越 */
  isSafeFileId(fileId: string): boolean {
    return /^[a-f0-9]{64}\.(png|jpe?g)$/i.test(fileId)
  }

  /** 按内容寻址写入；已存在同 hash 文件则复用 */
  saveBuffer(buffer: Buffer, ext: 'png' | 'jpg'): Omit<ClipImage, 'width' | 'height'> {
    const hash = createHash('sha256').update(buffer).digest('hex')
    const fileId = `${hash}.${ext}`
    const dest = this.absolutePath(fileId)
    if (!existsSync(dest)) {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(dest, buffer)
    }
    return { fileId, hash, byteLength: buffer.byteLength }
  }

  /** 从系统剪贴板 NativeImage 编码入库（JPEG 明显更小时用 JPEG） */
  saveFromNativeImage(img: Electron.NativeImage): ClipImage | null {
    if (img.isEmpty()) return null
    const { width, height } = img.getSize()
    const png = img.toPNG()
    const jpg = img.toJPEG(85)
    // 体积至少小约 15% 才用有损，避免纯色/UI 截图无谓发糊
    const useJpeg = jpg.byteLength < png.byteLength * 0.85
    const saved = this.saveBuffer(useJpeg ? jpg : png, useJpeg ? 'jpg' : 'png')
    return { ...saved, width, height }
  }

  toNativeImage(fileId: string): Electron.NativeImage | null {
    if (!this.isSafeFileId(fileId)) return null
    const path = this.absolutePath(fileId)
    if (!existsSync(path)) return null
    const img = nativeImage.createFromPath(path)
    return img.isEmpty() ? null : img
  }

  /**
   * 删除未被历史/收藏引用的图片文件。
   * 收藏与历史可共享同一 fileId，须合并引用后再清。
   */
  purgeOrphans(referencedFileIds: Iterable<string>): void {
    const keep = new Set(referencedFileIds)
    let entries: string[]
    try {
      entries = readdirSync(this.dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (!this.isSafeFileId(name)) continue
      if (keep.has(name)) continue
      try {
        unlinkSync(this.absolutePath(name))
      } catch (err) {
        console.error('[clipboard] purge image failed:', name, err)
      }
    }
  }
}

/** 必须在 app ready 之前调用 */
export function registerClipboardImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CLIP_IMG_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

/** app ready 后挂上协议处理 */
export function installClipboardImageProtocol(store: ClipboardImageStore): void {
  protocol.handle(CLIP_IMG_SCHEME, (request) => {
    try {
      const u = new URL(request.url)
      const fileId = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
      if (!store.isSafeFileId(fileId)) {
        return new Response('Bad Request', { status: 400 })
      }
      const filePath = store.absolutePath(fileId)
      if (!existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).href)
    } catch (err) {
      console.error('[clipboard] clipimg protocol error:', err)
      return new Response('Error', { status: 500 })
    }
  })
}
