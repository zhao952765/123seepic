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
  
  // ✅ PDF渲染引擎
  let pdfEngine: PdfRenderEngine | null = null;
  
  // ✅ 状态管理
  let currentPage = 1;
  let totalPages = 0;
  let currentScale = 1.0;
  let isRendering = false;
  
  // ✅ 缩放优化
  let zoomTimeout: number | null = null;
  let isZooming = false;

  onMount(async () => {
    ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    
    // ✅ 初始化PDF渲染引擎
    pdfEngine = new PdfRenderEngine(5); // 缓存5页
    
    await loadPdf();
  });

  onDestroy(async () => {
    // ✅ 清理所有资源
    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }
    
    // ✅ 销毁PDF引擎（自动清理所有Canvas和缓存）
    if (pdfEngine) {
      await pdfEngine.destroy();
      pdfEngine = null;
    }
    
    // ✅ 清空Canvas
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    
    ctx = null;
  });

  async function loadPdf() {
    try {
      console.log(`⏳ 加载PDF文档: ${filePath}`);
      
      // ✅ 通过渲染引擎加载
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
      
      // ✅ 预加载相邻页面
      await pdfEngine!.preloadAdjacentPages(currentPage, totalPages);
      
      console.log(`✅ PDF加载完成: ${totalPages}页`);
    } catch (error) {
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

<div class="pdf-viewer" bind:this={container}>
  <canvas bind:this={canvas} />
  
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
    overflow: auto;
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
