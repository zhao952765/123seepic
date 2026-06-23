<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewerState, viewerActions } from '../stores/viewer';
  import { get } from 'svelte/store';
  import * as pdfjsLib from 'pdfjs-dist';
  import { PdfRenderEngine } from '../utils/imageProcessor';
  
  // ✅ 配置 PDF.js worker - 使用本地文件（纯本地运行）
  import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
  const pdfWorkerInstance = new PdfWorker();
  // @ts-ignore - Worker类型兼容性问题
  pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorkerInstance.port || pdfWorkerInstance;

  export let filePath: string;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  
  let pdfEngine: PdfRenderEngine | null = null;
  
  let currentPage = 1;
  let totalPages = 0;
  let currentScale = 1.0;
  let isRendering = false;
  let pdfError: string | null = null;
  
  let zoomTimeout: number | null = null;
  let isZooming = false;

  onMount(async () => {
    ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    
    pdfEngine = new PdfRenderEngine(5);
    await loadPdf();
    
    // KN-005: 窗口大小变化时自动适配 PDF
    window.addEventListener('resize', handleResize);
  });

  // KN-005: 窗口 resize 适配
  function handleResize() {
    if (!container || !pdfEngine || pdfError) return;
    const state = get(viewerState);
    if (state.fitMode === 'fit') {
      fitToPage();
    } else if (state.fitMode === 'width') {
      fitToWidth();
    }
  }

  // ✅ 滚轮：Ctrl+Wheel 缩放，Plain Wheel 翻页
  function handleWheel(event: WheelEvent) {
    event.preventDefault();

    if (event.ctrlKey) {
      // === Ctrl+Wheel: 缩放 ===
      const newScale = event.deltaY > 0
        ? Math.max(currentScale - 0.2, 0.2)
        : Math.min(currentScale + 0.2, 5.0);
      handleZoom(newScale);
    } else {
      // === Plain Wheel: 翻页 ===
      if (event.deltaY > 50) {
        nextPage();
      } else if (event.deltaY < -50) {
        prevPage();
      }
    }
  }

  onDestroy(async () => {
    window.removeEventListener('resize', handleResize);
    
    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }
    
    if (pdfEngine) {
      await pdfEngine.destroy();
      pdfEngine = null;
    }
    
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    
    ctx = null;
  });

  async function loadPdf() {
    try {
      pdfError = null;
      
      await pdfEngine!.loadDocument(pdfjsLib, filePath);
      
      const doc = pdfEngine!.getDocument();
      totalPages = doc.numPages;
      
      viewerState.update(s => ({
        ...s,
        pdfTotalPages: totalPages,
        pdfPage: 1,
      }));
      
      currentPage = 1;
      await renderPage(currentPage);
      
      await pdfEngine!.preloadAdjacentPages(currentPage, totalPages);
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('password') || msg.includes('encrypt') || msg.includes('No password')) {
        pdfError = '此 PDF 文件已加密，需要密码才能打开。当前版本暂不支持密码输入，请使用其他工具解密后重试。';
      } else if (msg.includes('Invalid PDF') || msg.includes('not a valid PDF')) {
        pdfError = '无法打开此文件：文件格式无效或已损坏。';
      } else {
        pdfError = `加载 PDF 失败：${msg}`;
      }
      console.error('加载 PDF 失败:', error);
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfEngine || !ctx || isRendering) return;
    
    isRendering = true;
    
    try {
      // ✅ 使用渲染引擎异步渲染（OffscreenCanvas + Worker）
      await pdfEngine.renderPage(pageNum, currentScale, canvas);
      
      currentPage = pageNum;
      viewerState.update(s => ({
        ...s,
        pdfPage: pageNum,
      }));
      
      // ✅ 预加载相邻页面
      await pdfEngine.preloadAdjacentPages(pageNum, totalPages);
      
    } catch (error) {
      console.error('渲染页面失败:', error);
    } finally {
      isRendering = false;
    }
  }

  // 翻页功能
  export async function nextPage() {
    if (currentPage < totalPages) {
      await renderPage(currentPage + 1);
    }
  }

  export async function prevPage() {
    if (currentPage > 1) {
      await renderPage(currentPage - 1);
    }
  }

  export async function goToPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= totalPages) {
      await renderPage(pageNum);
    }
  }

  // ✅ 缩放功能（带延迟高清重绘）
  export async function zoomIn() {
    const newScale = Math.min(currentScale + 0.2, 5.0);
    await handleZoom(newScale);
  }

  export async function zoomOut() {
    const newScale = Math.max(currentScale - 0.2, 0.2);
    await handleZoom(newScale);
  }

  export async function resetZoom() {
    await handleZoom(1.0);
  }

  // ✅ 统一缩放处理
  async function handleZoom(newScale: number) {
    currentScale = newScale;
    viewerActions.setZoom(newScale);
    
    // ✅ 取消之前的高清重绘定时器
    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }
    
    // ✅ 立即低质量渲染（快速响应）
    isZooming = true;
    await renderPage(currentPage);
    
    // ✅ 延迟执行高清重绘（300ms后）
    zoomTimeout = setTimeout(async () => {
      isZooming = false;
      // 强制重新渲染以获得最高质量
      await renderPage(currentPage);
      zoomTimeout = null;
    }, 300);
  }

  // 适应宽度
  export async function fitToWidth() {
    if (!container || !pdfEngine) return;
    
    const doc = pdfEngine.getDocument();
    const page = await doc.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.0 });
    const newScale = container.clientWidth / viewport.width;
    
    await handleZoom(newScale);
    page.cleanup();
  }

  // 适应页面
  export async function fitToPage() {
    if (!container || !pdfEngine) return;
    
    const doc = pdfEngine.getDocument();
    const page = await doc.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.0 });
    const scaleX = container.clientWidth / viewport.width;
    const scaleY = container.clientHeight / viewport.height;
    const newScale = Math.min(scaleX, scaleY);
    
    await handleZoom(newScale);
    page.cleanup();
  }

  // 监听状态变化
  $: if (viewerState) {
    const state = get(viewerState);
    if (state.pdfPage !== currentPage && !isRendering) {
      renderPage(state.pdfPage);
    }
  }
</script>

<div class="pdf-viewer" bind:this={container} on:wheel|nonpassive={handleWheel}>
  {#if pdfError}
    <div class="error-overlay">
      <div class="error-icon">⚠️</div>
      <p class="error-title">PDF 无法打开</p>
      <p class="error-message">{pdfError}</p>
    </div>
  {:else}
    <canvas bind:this={canvas} on:wheel|nonpassive={handleWheel} />
  {/if}
  
  {#if isRendering}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>渲染中...</p>
    </div>
  {/if}
</div>

<style>
  .pdf-viewer {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #2a2a2a;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  
  canvas {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    max-width: 100%;
    max-height: 100%;
  }
  
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
    z-index: 10;
  }

  .error-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #ccc;
    text-align: center;
    padding: 40px;
    max-width: 500px;
  }

  .error-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .error-title {
    font-size: 18px;
    font-weight: 600;
    color: #e74c3c;
    margin: 0 0 12px 0;
  }

  .error-message {
    font-size: 14px;
    color: #999;
    line-height: 1.6;
    margin: 0;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #3d3d3d;
    border-top-color: #0078d4;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>