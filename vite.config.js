import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api/* to the FastAPI backend during dev so CORS isn't needed
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});

