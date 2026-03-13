import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Proxy /api/* → backend so we avoid CORS in dev
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
