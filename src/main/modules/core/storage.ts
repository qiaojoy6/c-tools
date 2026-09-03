import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/**
 * 轻量 JSON 文件存储（原子写入）
 */
export class JsonStore<T> {
  constructor(private filePath: string) {}

  read(): T | null {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf-8')) as T
      }
    } catch (err) {
      console.error(`[storage] 读取失败 ${this.filePath}:`, err)
    }
    return null
  }

  write(data: T): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(data), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.error(`[storage] 写入失败 ${this.filePath}:`, err)
    }
  }
}
