import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' để deploy được cả ở thư mục con (GitHub Pages...) lẫn gốc domain (Vercel, Netlify...)
export default defineConfig({
  base: './',
  plugins: [react()],
  preview: { host: '0.0.0.0', allowedHosts: true },
})
