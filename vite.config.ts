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
  base: '/SoftwareHub/',
})
