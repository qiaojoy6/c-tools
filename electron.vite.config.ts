import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    // koffi / ffmpeg-static 含原生二进制，不可被打包进 bundle
    build: {
      rollupOptions: {
        external: ['koffi', 'ffmpeg-static']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          'recorder-border': resolve('src/renderer/recorder-border.html'),
          'recorder-float': resolve('src/renderer/recorder-float.html')
        }
      }
    },
    plugins: [
      tailwindcss(),
      vue({
        template: {
          compilerOptions: {
            // Electron <webview> 为原生自定义元素
            isCustomElement: (tag) => tag === 'webview'
          }
        }
      })
    ]
  }
})
