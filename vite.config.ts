import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [sveltekit(), electronRelativePaths()],

  base: './',
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});