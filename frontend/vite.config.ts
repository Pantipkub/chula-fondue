import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The gateway has no CORS, so the browser only talks to this server:
// /api/* is forwarded to the gateway (without the /api prefix), /uploads/* serves local photos.
const gateway = process.env.GATEWAY_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: gateway, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') },
      '/uploads': { target: gateway, changeOrigin: true },
    },
  },
});
