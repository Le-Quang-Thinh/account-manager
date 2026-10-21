import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const { api } = createRequire(import.meta.url)('./server/store-api.cjs')

// Cùng một API (đăng nhập + lưu SQLite) cho cả `vite` (dev) và `vite preview`
const storeFilePlugin = (): Plugin => ({
  name: 'store-file-api',
  configureServer(server) { server.middlewares.use('/api', api) },
  configurePreviewServer(server) { server.middlewares.use('/api', api) },
})

// base './' để deploy được cả ở thư mục con (GitHub Pages...) lẫn gốc domain (Vercel, Netlify...)
export default defineConfig({
  base: './',
  plugins: [react(), storeFilePlugin()],
  preview: { host: '0.0.0.0', allowedHosts: true },
})
