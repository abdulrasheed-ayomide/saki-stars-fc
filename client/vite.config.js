import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Reads .env, .env.local, etc. so VITE_DEV_API_TARGET can live in client/.env.local.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:4000';
  return {
    plugins: [react(), tailwindcss()],
    // Same-origin /api in development mirrors the Vercel rewrite in vercel.json,
    // so the refresh cookie behaves the same locally as in production.
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/sitemap.xml': { target: apiTarget, changeOrigin: true, rewrite: () => '/api/v1/sitemap.xml' },
        '/robots.txt': { target: apiTarget, changeOrigin: true, rewrite: () => '/api/v1/robots.txt' },
      },
    },
    preview: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
    },
  };
});
