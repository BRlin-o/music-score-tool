import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  appType: 'mpa',
  base: '/music-score-tool/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        v2: 'v2/index.html',
        v3: 'v3/index.html',
      },
    },
  },
})
