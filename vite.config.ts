import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function electronRelativePaths() {
  return {
    name: 'electron-relative-paths',
    apply: 'build',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist', 'index.html');
      let html = readFileSync(htmlPath, 'utf-8');
      html = html.replace(/(src|href)="\/(_app\/)/g, '$1="./$2');
      html = html.replace(/(import\(")\/(_app\/)/g, '$1./$2');
      html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
      html = html.replace(/\n\s*\n\s*\n/g, '\n\n');
      writeFileSync(htmlPath, html, 'utf-8');
      console.log('[electron-relative-paths] 已修复 index.html（相对路径 + 移除 modulepreload）');
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [sveltekit(), electronRelativePaths()],

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