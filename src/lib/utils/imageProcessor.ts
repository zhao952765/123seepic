import type { ImageInfo, ThumbnailData } from '../types/image';

/**
 * 读取文件信息（包括图片元数据）
 */
export async function loadFileInfo(filePath: string): Promise<ImageInfo> {
  const info = await window.electronAPI.readFileInfo(filePath);
  return info;
}

/**
 * Electron IPC 将 Node.js Buffer 序列化为 {type:'Buffer', data:[...]}
 * 此函数将其还原为 ArrayBuffer
 */
function toArrayBuffer(data: any): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) return data.buffer;
  if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
    return new Uint8Array(data.data).buffer;
  }
  return data;
}

/**
 * ✅ 高性能加载图片为ArrayBuffer（替代base64方案）
 * 直接通过file://协议读取二进制数据，避免base64编码膨胀
 */
export async function loadImageArrayBuffer(path: string): Promise<ArrayBuffer> {
  try {
    const raw = await window.electronAPI.readFileBuffer(path);
    return toArrayBuffer(raw);
  } catch (error) {
    console.error('加载图片失败:', error);
    throw error;
  }
}

/**
 * ✅ 将ArrayBuffer转换为ImageBitmap（GPU纹理）
 * 使用createImageBitmap进行硬件加速解码
 */
export async function arrayBufferToImageBitmap(
  buffer: ArrayBuffer, 
  mimeType: string = 'image/jpeg'
): Promise<ImageBitmap> {
  try {
    const blob = new Blob([buffer], { type: mimeType });
    
    // createImageBitmap 会自动利用 GPU 解码
    // 支持多种选项优化性能
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
      imageOrientation: 'from-image',
    });
    
    return bitmap;
  } catch (error) {
    console.error('转换为ImageBitmap失败:', error);
    throw error;
  }
}

/**
 * ✅ 直接加载图片为ImageBitmap（推荐方式）
 * 结合上述两个步骤，提供简洁API
 */
export async function loadImageAsBitmap(path: string): Promise<ImageBitmap> {
  const buffer = await loadImageArrayBuffer(path);
  
  // 根据文件扩展名判断MIME类型
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    bmp: 'image/bmp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
    tiff: 'image/tiff',
    tif: 'image/tiff',
  };
  
  const mimeType = mimeTypes[ext || ''] || 'image/jpeg';
  return await arrayBufferToImageBitmap(buffer, mimeType);
}

/**
 * ✅ PDF页面缓存项
 */
export interface PdfPageCache {
  pageNumber: number;
  canvas: OffscreenCanvas;
  viewport: any;
  timestamp: number;
}

/**
 * ✅ PDF渲染引擎（Worker模式 + 分页缓存）
 * 实现异步渲染、前后页缓存、缩放优化
 */
export class PdfRenderEngine {
  private pdfDoc: any = null;
  private pageCache: Map<number, PdfPageCache>;
  private maxCacheSize: number;
  private renderQueue: Map<number, Promise<void>>;
  private currentScale: number = 1.0;
  
  constructor(maxCacheSize: number = 5) {
    this.pageCache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.renderQueue = new Map();
  }
  
  /**
   * 加载PDF文档
   */
  async loadDocument(pdfjsLib: any, filePath: string): Promise<void> {
    try {
      const loadingTask = pdfjsLib.getDocument(filePath);
      this.pdfDoc = await loadingTask.promise;
    } catch (error) {
      console.error('PDF加载失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取PDF文档
   */
  getDocument(): any {
    return this.pdfDoc;
  }
  
  /**
   * 异步渲染指定页（带缓存）
   */
  async renderPage(
    pageNumber: number,
    scale: number,
    canvas: HTMLCanvasElement
  ): Promise<void> {
    if (!this.pdfDoc) {
      throw new Error('PDF文档未加载');
    }
    
    this.currentScale = scale;
    
    // ✅ 检查缓存
    const cached = this.pageCache.get(pageNumber);
    if (cached && cached.viewport.scale === scale) {
      this.copyCachedToCanvas(cached.canvas, canvas);
      return;
    }
    
    // ✅ 检查是否已在渲染队列中
    if (this.renderQueue.has(pageNumber)) {
      await this.renderQueue.get(pageNumber);
      const recached = this.pageCache.get(pageNumber);
      if (recached) {
        this.copyCachedToCanvas(recached.canvas, canvas);
      }
      return;
    }
    
    // ✅ 加入渲染队列
    const renderPromise = this.doRenderPage(pageNumber, scale, canvas);
    this.renderQueue.set(pageNumber, renderPromise);
    
    try {
      await renderPromise;
    } finally {
      this.renderQueue.delete(pageNumber);
    }
  }
  
  /**
   * 执行实际渲染（OffscreenCanvas + Worker）
   */
  private async doRenderPage(
    pageNumber: number,
    scale: number,
    targetCanvas: HTMLCanvasElement
  ): Promise<void> {
    try {
      const page = await this.pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      
      // ✅ 创建离屏Canvas（不阻塞主线程）
      const offscreenCanvas = new OffscreenCanvas(
        Math.floor(viewport.width),
        Math.floor(viewport.height)
      );
      const offscreenCtx = offscreenCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
      
      if (!offscreenCtx) {
        throw new Error('无法创建离屏Canvas上下文');
      }
      
      // ✅ 在离屏Canvas上渲染
      const renderContext = {
        canvasContext: offscreenCtx,
        viewport: viewport,
        enableWebGL: false, // OffscreenCanvas不支持WebGL
      };
      
      await page.render(renderContext).promise;
      
      // ✅ 缓存渲染结果
      this.cachePage(pageNumber, offscreenCanvas, viewport);
      
      // ✅ 复制到目标Canvas
      this.copyCachedToCanvas(offscreenCanvas, targetCanvas);
      
      // ✅ 复制到目标Canvas
      this.copyCachedToCanvas(offscreenCanvas, targetCanvas);
      
      // ✅ 清理page对象
      page.cleanup();
      
    } catch (error) {
      console.error(`渲染第${pageNumber}页失败:`, error);
      throw error;
    }
  }
  
  /**
   * 缓存页面
   */
  private cachePage(
    pageNumber: number,
    canvas: OffscreenCanvas,
    viewport: any
  ): void {
    // ✅ LRU淘汰策略
    if (this.pageCache.size >= this.maxCacheSize) {
      const oldestKey = Array.from(this.pageCache.keys())[0];
      const oldest = this.pageCache.get(oldestKey);
      if (oldest) {
        // ✅ 释放离屏Canvas（设置为最小尺寸）
        oldest.canvas.width = 1;
        oldest.canvas.height = 1;
        this.pageCache.delete(oldestKey);
      }
    }
    
    this.pageCache.set(pageNumber, {
      pageNumber,
      canvas,
      viewport,
      timestamp: Date.now(),
    });
  }
  
  /**
   * 复制离屏Canvas到目标Canvas
   */
  private copyCachedToCanvas(
    source: OffscreenCanvas,
    target: HTMLCanvasElement
  ): void {
    const ctx = target.getContext('2d');
    if (!ctx) return;
    
    target.width = source.width;
    target.height = source.height;
    
    ctx.drawImage(source, 0, 0);
  }
  
  /**
   * 预加载相邻页面
   */
  async preloadAdjacentPages(currentPage: number, totalPages: number): Promise<void> {
    const pagesToPreload: number[] = [];
    
    // 上一页
    if (currentPage > 1) {
      pagesToPreload.push(currentPage - 1);
    }
    
    // 下一页
    if (currentPage < totalPages) {
      pagesToPreload.push(currentPage + 1);
    }
    
    // ✅ 并行预加载
    const promises = pagesToPreload.map(async (pageNum) => {
      if (!this.pageCache.has(pageNum)) {
        try {
          const page = await this.pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: this.currentScale });
          
          const offscreenCanvas = new OffscreenCanvas(
            Math.floor(viewport.width),
            Math.floor(viewport.height)
          );
          const offscreenCtx = offscreenCanvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
          });
          
          if (offscreenCtx) {
            await page.render({
              canvasContext: offscreenCtx,
              viewport: viewport,
            }).promise;
            
            this.cachePage(pageNum, offscreenCanvas, viewport);
          }
          
          page.cleanup();
        } catch (error) {
          console.warn(`预加载第${pageNum}页失败:`, error);
        }
      }
    });
    
    await Promise.allSettled(promises);
  }
  
  /**
   * 清除所有缓存
   */
  clearCache(): void {
    for (const cache of this.pageCache.values()) {
      // ✅ 释放所有离屏Canvas（设置为最小尺寸）
      cache.canvas.width = 1;
      cache.canvas.height = 1;
    }
    this.pageCache.clear();
  }
  
  /**
   * 销毁引擎
   */
  async destroy(): Promise<void> {
    this.clearCache();
    
    if (this.pdfDoc) {
      await this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
    
    this.renderQueue.clear();
  }
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; pages: number[] } {
    return {
      size: this.pageCache.size,
      pages: Array.from(this.pageCache.keys()),
    };
  }
}

/**
 * ✅ 智能图片缓存池（LRU策略）
 * 仅缓存：当前图片、上一张、下一张
 * 实现秒切图体验
 */
export class ImageCachePool {
  private cache: Map<string, ImageBitmap>;
  private accessOrder: string[]; // 访问顺序（LRU）
  private maxSize: number;       // 最大缓存数量（默认3）
  
  constructor(maxSize: number = 3) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
  }
  
  /**
   * 获取缓存的图片
   */
  get(path: string): ImageBitmap | null {
    const bitmap = this.cache.get(path);
    
    if (bitmap) {
      // ✅ 更新访问顺序（移到末尾表示最近使用）
      this.accessOrder = this.accessOrder.filter(p => p !== path);
      this.accessOrder.push(path);
      
      return bitmap;
    }
    
    return null;
  }
  
  /**
   * 设置缓存
   */
  set(path: string, bitmap: ImageBitmap): void {
    // 如果已存在，先删除旧条目
    if (this.cache.has(path)) {
      this.cache.delete(path);
      this.accessOrder = this.accessOrder.filter(p => p !== path);
    }
    
    // ✅ 检查缓存是否已满
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      // 删除最久未使用的（LRU）
      const oldestPath = this.accessOrder.shift()!;
      const oldBitmap = this.cache.get(oldestPath);
      
      if (oldBitmap) {
        oldBitmap.close(); // ✅ 立即释放内存
        this.cache.delete(oldestPath);
      }
    }
    
    // 添加新缓存
    this.cache.set(path, bitmap);
    this.accessOrder.push(path);
  }
  
  /**
   * 预加载图片到缓存
   */
  async preload(path: string): Promise<ImageBitmap | null> {
    // 如果已在缓存中，直接返回
    const cached = this.get(path);
    if (cached) {
      return cached;
    }
    
    try {
      const bitmap = await loadImageAsBitmap(path);
      this.set(path, bitmap);
      return bitmap;
    } catch (error) {
      console.error(`预加载失败: ${path}`, error);
      return null;
    }
  }
  
  /**
   * 批量预加载（上一张、下一张）
   */
  async preloadBatch(paths: string[]): Promise<void> {
    // ✅ 并行预加载所有路径
    const promises = paths.map(path => this.preload(path));
    await Promise.allSettled(promises);
  }
  
  /**
   * 移除指定图片的缓存
   */
  remove(path: string): void {
    const bitmap = this.cache.get(path);
    if (bitmap) {
      bitmap.close(); // ✅ 立即释放内存
      this.cache.delete(path);
      this.accessOrder = this.accessOrder.filter(p => p !== path);
    }
  }
  
  /**
   * 清空所有缓存
   */
  clear(): void {
    for (const bitmap of this.cache.values()) {
      bitmap.close(); // ✅ 立即释放所有内存
    }
    this.cache.clear();
    this.accessOrder = [];
  }
  
  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; paths: string[] } {
    return {
      size: this.cache.size,
      paths: [...this.accessOrder],
    };
  }
  
  /**
   * 估算缓存占用内存（RGBA每像素4字节）
   */
  estimateMemoryUsage(): number {
    let totalBytes = 0;
    
    for (const bitmap of this.cache.values()) {
      totalBytes += bitmap.width * bitmap.height * 4;
    }
    
    return totalBytes / (1024 * 1024); // 转换为MB
  }
}

/**
 * ✅ 惯性动画引擎（Win11原生级手感）
 * 实现平滑的缩放和拖拽惯性效果
 */
export class InertiaEngine {
  private velocity = 0;           // 当前速度
  private position = 0;           // 当前位置/值
  private targetPosition = 0;     // 目标位置
  private isAnimating = false;
  private animationId: number | null = null;
  private onUpdate: (value: number) => void;
  private onComplete: () => void;
  
  // 物理参数（可调节手感）
  private readonly FRICTION = 0.95;        // 摩擦力（0-1）
  private readonly STOP_THRESHOLD = 0.01;  // 停止阈值
  private readonly MAX_VELOCITY = 100;     // 最大速度
  
  constructor(
    initialValue: number,
    onUpdate: (value: number) => void,
    onComplete: () => void
  ) {
    this.position = initialValue;
    this.targetPosition = initialValue;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
  }
  
  /**
   * 启动惯性动画
   * @param initialVelocity 初始速度（正负表示方向）
   */
  start(initialVelocity: number) {
    // 限制最大速度
    this.velocity = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, initialVelocity));
    this.isAnimating = true;
    
    // 取消之前的动画
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    this.animate();
  }
  
  /**
   * 平滑过渡到目标值
   * @param target 目标值
   * @param duration 动画时长(ms)，默认300ms
   */
  smoothTo(target: number, duration: number = 300) {
    const startValue = this.position;
    const delta = target - startValue;
    const startTime = performance.now();
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    this.isAnimating = true;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用ease-out-cubic缓动函数
      const eased = 1 - Math.pow(1 - progress, 3);
      
      this.position = startValue + delta * eased;
      this.onUpdate(this.position);
      
      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.isAnimating = false;
        this.onComplete();
      }
    };
    
    this.animationId = requestAnimationFrame(animate);
  }
  
  /**
   * 立即停止动画
   */
  stop() {
    this.isAnimating = false;
    this.velocity = 0;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  /**
   * 惯性动画循环
   */
  private animate() {
    if (!this.isAnimating) return;
    
    // 应用摩擦力
    this.velocity *= this.FRICTION;
    this.position += this.velocity;
    
    // 通知更新
    this.onUpdate(this.position);
    
    // 检查是否停止
    if (Math.abs(this.velocity) < this.STOP_THRESHOLD) {
      this.isAnimating = false;
      this.velocity = 0;
      this.onComplete();
      return;
    }
    
    this.animationId = requestAnimationFrame(() => this.animate());
  }
  
  /**
   * 获取当前值
   */
  getValue(): number {
    return this.position;
  }
  
  /**
   * 是否正在动画中
   */
  isRunning(): boolean {
    return this.isAnimating;
  }
}

/**
 * ✅ 双阶段渲染系统
 * 缩放时使用低质量快速渲染，结束后高清重绘
 */
export class TwoStageRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lowQualityCanvas: HTMLCanvasElement | null = null;
  private lowQualityCtx: CanvasRenderingContext2D | null = null;
  private useLowQuality = false;
  
  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }
  
  /**
   * 开始快速缩放（使用中等质量渲染，1/2 分辨率）
   */
  beginFastZoom() {
    this.useLowQuality = true;
    
    if (!this.lowQualityCanvas) {
      this.lowQualityCanvas = document.createElement('canvas');
      this.lowQualityCtx = this.lowQualityCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
    }
    
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    // 1/2 分辨率（比 1/4 清晰，缩放时仍保持可读性）
    this.lowQualityCanvas.width = Math.floor(width / 2);
    this.lowQualityCanvas.height = Math.floor(height / 2);
  }
  
  /**
   * 结束快速缩放（高清重绘）
   */
  endFastZoom(renderCallback: () => void) {
    this.useLowQuality = false;
    
    // 立即执行高清渲染
    renderCallback();
  }
  
  /**
   * 渲染（根据模式选择质量）
   */
  render(renderCallback: () => void) {
    if (this.useLowQuality && this.lowQualityCanvas && this.lowQualityCtx) {
      // 1/2 分辨率渲染到离屏Canvas
      this.lowQualityCtx.save();
      this.lowQualityCtx.fillStyle = '#1a1a1a';
      this.lowQualityCtx.fillRect(0, 0, this.lowQualityCanvas.width, this.lowQualityCanvas.height);
      
      this.lowQualityCtx.scale(0.5, 0.5);
      renderCallback();
      this.lowQualityCtx.restore();
      
      // 放大到主Canvas（浏览器自动插值）
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'medium';
      this.ctx.drawImage(
        this.lowQualityCanvas,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );
    } else {
      // 高质量渲染
      renderCallback();
    }
  }
  
  /**
   * 清理资源
   */
  dispose() {
    if (this.lowQualityCanvas) {
      this.lowQualityCanvas.width = 0;
      this.lowQualityCanvas.height = 0;
      this.lowQualityCanvas = null;
      this.lowQualityCtx = null;
    }
  }
}

/**
 * 渲染性能监控工具
 * 用于检测和验证GPU高清渲染系统的性能指标
 */

export interface RenderMetrics {
  fps: number;              // 帧率
  renderTime: number;       // 单次渲染耗时(ms)
  memoryUsage: number;      // 内存占用(MB)
  canvasSize: {             // Canvas尺寸
    width: number;
    height: number;
    physicalWidth: number;  // 物理像素
    physicalHeight: number;
  };
  devicePixelRatio: number; // DPR
  imageBitmapSize?: {       // ImageBitmap尺寸
    width: number;
    height: number;
  };
}

class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;
  private metrics: RenderMetrics | null = null;
  private observers: Array<(metrics: RenderMetrics) => void> = [];

  /**
   * 启动性能监控
   */
  start() {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.updateFPS();
  }

  /**
   * 记录一帧
   */
  recordFrame(renderTime: number, canvas: HTMLCanvasElement, dpr: number, bitmap?: ImageBitmap) {
    this.frameCount++;
    
    this.metrics = {
      fps: this.fps,
      renderTime,
      memoryUsage: this.estimateMemoryUsage(bitmap),
      canvasSize: {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        physicalWidth: canvas.width,
        physicalHeight: canvas.height,
      },
      devicePixelRatio: dpr,
      imageBitmapSize: bitmap ? {
        width: bitmap.width,
        height: bitmap.height,
      } : undefined,
    };

    // 通知观察者
    this.observers.forEach(cb => cb(this.metrics!));
  }

  /**
   * 估算ImageBitmap内存占用
   */
  private estimateMemoryUsage(bitmap?: ImageBitmap): number {
    if (!bitmap) return 0;
    
    // RGBA每像素4字节
    const bytes = bitmap.width * bitmap.height * 4;
    return bytes / (1024 * 1024); // 转换为MB
  }

  /**
   * 更新FPS
   */
  private updateFPS() {
    const now = performance.now();
    const elapsed = now - this.lastTime;
    
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastTime = now;
    }
    
    requestAnimationFrame(() => this.updateFPS());
  }

  /**
   * 获取当前指标
   */
  getMetrics(): RenderMetrics | null {
    return this.metrics;
  }

  /**
   * 订阅指标变化
   */
  subscribe(callback: (metrics: RenderMetrics) => void): () => void {
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter(cb => cb !== callback);
    };
  }

  /**
   * 打印性能报告
   */
  printReport() {
    if (!this.metrics) {
      return;
    }

    console.group('📊 渲染性能报告');
    console.warn('帧率:', `${this.metrics.fps} FPS`);
    console.warn('渲染耗时:', `${this.metrics.renderTime.toFixed(2)} ms`);
    console.warn('内存占用:', `${this.metrics.memoryUsage.toFixed(2)} MB`);
    console.warn('Canvas尺寸:', `${this.metrics.canvasSize.width}x${this.metrics.canvasSize.height}`);
    console.warn('物理像素:', `${this.metrics.canvasSize.physicalWidth}x${this.metrics.canvasSize.physicalHeight}`);
    console.warn('设备像素比:', this.metrics.devicePixelRatio);
    
    if (this.metrics.imageBitmapSize) {
      console.warn('图片尺寸:', `${this.metrics.imageBitmapSize.width}x${this.metrics.imageBitmapSize.height}`);
      
      const zoomX = this.metrics.canvasSize.physicalWidth / this.metrics.imageBitmapSize.width;
      const zoomY = this.metrics.canvasSize.physicalHeight / this.metrics.imageBitmapSize.height;
      console.warn('缩放比例:', `${(zoomX * 100).toFixed(1)}% x ${(zoomY * 100).toFixed(1)}%`);
    }
    
    if (this.metrics.renderTime < 5) {
      console.warn('✅ 渲染性能优秀');
    } else if (this.metrics.renderTime < 16) {
      console.warn('⚠️ 渲染性能良好（接近60fps阈值）');
    } else {
      console.warn('❌ 渲染耗时过长，建议优化');
    }
    
    console.groupEnd();
  }
}

// 导出单例
export const perfMonitor = new PerformanceMonitor();

/**
 * 🧩 获取图片完整尺寸（不解码整张图片，仅读取头部）
 * 用于瓦片渲染的初始化判断
 */
export async function getImageDimensions(path: string): Promise<{ width: number; height: number }> {
  try {
    const result = await window.electronAPI.getImageDimensions(path);
    return result;
  } catch (error) {
    console.error('获取图片尺寸失败:', error);
    throw error;
  }
}

/**
 * 🧩 提取图片瓦片（从 Electron 后端获取指定区域的 JPEG 数据）
 * 用于超大图片的瓦片渲染，使用 Lanczos3 高质量缩放
 */
export async function extractTile(
  path: string,
  tileX: number,
  tileY: number,
  tileSize: number,
  outputWidth: number = 256,
  outputHeight: number = 256
): Promise<ArrayBuffer> {
  try {
    const result = await window.electronAPI.extractTile(path, tileX, tileY, tileSize, outputWidth, outputHeight);
    return result;
  } catch (error) {
    console.error('提取瓦片失败:', error);
    throw error;
  }
}

/**
 * 便捷函数：测量渲染时间
 */
export function measureRender<T>(fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  return result;
}

/**
 * 读取图片并转换为 base64（保留作为备用方案）
 * @deprecated 优先使用 loadImageAsBitmap
 */
export async function loadImageBase64(path: string): Promise<string> {
  try {
    const raw = await window.electronAPI.readFileBuffer(path);
    const buffer = toArrayBuffer(raw);
    const blob = new Blob([buffer]);
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('加载图片失败:', error);
    throw error;
  }
}

/**
 * 生成缩略图
 */
export async function generateThumbnail(path: string, maxSize: number = 200): Promise<ThumbnailData> {
  try {
    const thumbnail = await window.electronAPI.generateThumbnail(path, maxSize);
    return thumbnail;
  } catch (error) {
    console.error('生成缩略图失败:', error);
    throw error;
  }
}

/**
 * 在资源管理器中打开文件所在文件夹
 */
export async function openInExplorer(path: string): Promise<void> {
  try {
    await window.electronAPI.openInExplorer(path);
  } catch (error) {
    console.error('打开文件夹失败:', error);
    throw error;
  }
}

/**
 * 设置为桌面壁纸
 */
export async function setAsWallpaper(path: string, mode: string = 'fill'): Promise<void> {
  try {
    await window.electronAPI.setAsWallpaper(path, mode);
  } catch (error) {
    console.error('设置壁纸失败:', error);
    throw error;
  }
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;

  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  } else if (bytes >= mb) {
    return `${(bytes / mb).toFixed(2)} MB`;
  } else if (bytes >= kb) {
    return `${(bytes / kb).toFixed(2)} KB`;
  } else {
    return `${bytes} B`;
  }
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * 检查是否为支持的图片格式
 */
export function isImageFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'gif', 'ico', 'svg', 'heic', 'heif'];
  return imageExts.includes(ext);
}

/**
 * 检查是否为 PDF 文件
 */
export function isPdfFile(filename: string): boolean {
  return getFileExtension(filename) === 'pdf';
}