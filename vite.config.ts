import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync } from 'fs'
import { backupPlugin } from './vite-plugin-backup'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    backupPlugin(),
    {
      name: 'copy-404',
      closeBundle() {
        copyFileSync(resolve(__dirname, 'dist', 'index.html'), resolve(__dirname, 'dist', '404.html'))
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('naive-ui')) return 'vendor-ui'
            if (id.includes('/webdav/') || id.includes('webdav/')) return 'vendor-webdav'
            if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/') || id.includes('/@vue/')) return 'vendor-vue'
          }
          return undefined
        },
      },
    },
  },
  base: '/',
})
