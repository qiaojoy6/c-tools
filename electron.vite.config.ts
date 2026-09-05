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
    // koffi 含平台 .node，不可被打包进 bundle
    build: {
      rollupOptions: {
        external: ['koffi']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
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
