import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 前端构建配置。
 * - base 用相对路径，dist/ 可直接扔到任意静态托管（Cloudflare Pages / 对象存储 / Nginx 子目录）。
 * - 开发期把 /api 代理到本地 Node 服务（server/index.mjs），避免 CORS 与跨域 Cookie 麻烦。
 * - 生产环境若前后端同源部署，/api 天然可用；若静态托管，前端会自动降级为离线引擎。
 */
const API_ORIGIN = process.env.VITE_API_ORIGIN || 'http://127.0.0.1:8787';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
    watch: { ignored: ['**/.selftest-tmp/**', '**/dist/**', '**/.e2e-out/**', '**/node_modules/**'] },
    proxy: {
      '/api': { target: API_ORIGIN, changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 4190, strictPort: true },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
