import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [sveltekit()],

  // Electron 联调配置
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true, // Electron 开发时需要固定端口
    host: '127.0.0.1',
  },

  // 生产构建配置
  base: './', // 使用相对路径，适配 Electron 的 file:// 协议加载
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    emptyOutDir: true,
  },

  // 优化 worker 打包（pdf.js worker 需要）
  worker: {
    format: 'es',
  },
});
