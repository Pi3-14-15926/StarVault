import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { backupPlugin } from './vite-plugin-backup'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), backupPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  base: '/SoftwareHub/',
})
