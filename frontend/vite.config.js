import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// frontend/vite.config.js

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Directs any browser hit to /api straight over to our active Node service
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})