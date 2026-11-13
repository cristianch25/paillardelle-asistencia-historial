import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // server.js y .env.example del backend definen 3000 sin otra configuración local.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
