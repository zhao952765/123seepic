/**
 * 🧩 超大图片瓦片渲染引擎
 * 
 * 适用于 >10000x10000 的超大图片
 * 仅渲染当前可视区域，内存可控，GPU占用稳定
 * 
 * 核心策略：
 * 1. 将图片划分为固定大小的瓦片（默认256x256）
 * 2. 仅加载和渲染视口内的瓦片
 * 3. LRU缓存管理，内存上限可控
 * 4. 并发加载控制（最大4个并发请求）
 * 5. 智能预加载：预取视口周边瓦片
 */

export interface TileCoord {
  tx: number;   // 瓦片列索引
  ty: number;   // 瓦片行索引
}

export interface TileInfo extends TileCoord {
  key: string;   // 唯一标识
  loaded: boolean;
  loading: boolean;
  bitmap: ImageBitmap | null;
  lastUsed: number;
  priority: number; // 优先级评分
}

export interface ViewportInfo {
  x: number;      // 视口左上角x（图片逻辑坐标）
  y: number;      // 视口左上角y
  width: number;  // 视口宽度
  height: number; // 视口高度
  zoom: number;   // 当前缩放比
}

export interface TileEngineOptions {
  tileSize?: number;          // 瓦片尺寸，默认256
  maxCacheMB?: number;        // 最大缓存内存(MB)，默认128
  maxConcurrent?: number;     // 最大并发加载数，默认4
  preloadMargin?: number;     // 预加载边缘瓦片数，默认2
}

export type TileDataCallback = (tile: TileCoord, tileSize: number) => Promise<ArrayBuffer>;

/**
 * 瓦片渲染引擎
 * 管理超大图片的视口计算、瓦片调度、缓存和渲染
 */
export class TileEngine {
  // 图片元信息
  private imageWidth = 0;
  private imageHeight = 0;
  private totalTilesX = 0;
  private totalTilesY = 0;
  
  // 瓦片配置
  private tileSize: number;
  private maxCacheMB: number;
  private maxConcurrent: number;
  private preloadMargin: number;
  
  // 瓦片数据回调（从后端获取瓦片数据）
  private fetchTileData: TileDataCallback | null = null;
  
  // 瓦片缓存
  private tiles = new Map<string, TileInfo>();
  private loadingQueue: TileCoord[] = [];
  private activeLoads = 0;
  
  // LRU跟踪
  private accessCounter = 0;
  
  // 当前视口
  private viewport: ViewportInfo = { x: 0, y: 0, width: 0, height: 0, zoom: 1 };
  
  // Canvas渲染上下文
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private containerWidth = 0;
  private containerHeight = 0;
  
  // 动画帧控制
  private animationId: number | null = null;
  private needsRender = false;
  private renderStartTime = 0;
  
  // 统计信息
  stats = {
    totalTilesLoaded: 0,
    totalTilesSkipped: 0,
    currentCacheSize: 0,    // MB
    estimatedCacheCount: 0,
    visibleTiles: 0,
    loadedTiles: 0,
  };
  
  // 是否正在使用瓦片渲染模式
  private _isActive = false;
  
  // 缓存清理定时器
  private cleanupTimer: number | null = null;
  
  constructor(options: TileEngineOptions = {}) {
    this.tileSize = options.tileSize ?? 256;
    this.maxCacheMB = options.maxCacheMB ?? 128;
    this.maxConcurrent = options.maxConcurrent ?? 4;
    this.preloadMargin = options.preloadMargin ?? 2;
  }
  
  /**
   * 判断是否需要启动瓦片渲染
   */
  static isTileModeNeeded(width: number, height: number): boolean {
    return width > 10000 || height > 10000;
  }
  
  /**
   * 获取图片中的瓦片总数
   */
  getTileGridInfo() {
    return {
      tilesX: this.totalTilesX,
      tilesY: this.totalTilesY,
      tileSize: this.tileSize,
      totalTiles: this.totalTilesX * this.totalTilesY,
    };
  }
  
  /**
   * 初始化瓦片引擎
   * @param width 图片完整宽度
   * @param height 图片完整高度
   * @param fetchCallback 获取瓦片数据的回调
   */
  init(
    width: number,
    height: number,
    fetchCallback: TileDataCallback
  ): void {
    this.imageWidth = width;
    this.imageHeight = height;
    this.totalTilesX = Math.ceil(width / this.tileSize);
    this.totalTilesY = Math.ceil(height / this.tileSize);
    this.fetchTileData = fetchCallback;
    this._isActive = true;
    
    console.log(`🧩 瓦片引擎初始化: ${width}x${height}, 瓦片数=${this.totalTilesX}x${this.totalTilesY}, 瓦片大小=${this.tileSize}px`);
    
    // 启动缓存清理循环（每5秒检查一次）
    this.startCacheCleanup();
  }
  
  /**
   * 绑定Canvas渲染上下文
   */
  attachCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }
  
  /**
   * 更新容器尺寸
   */
  updateContainerSize(width: number, height: number): void {
    this.containerWidth = width;
    this.containerHeight = height;
  }
  
  /**
   * 更新视口并触发调度
   */
  updateViewport(viewport: Partial<ViewportInfo>): void {
    const prevZoom = this.viewport.zoom;
    this.viewport = { ...this.viewport, ...viewport };
    
    // 检查视口是否有实际变化
    const zoomChanged = prevZoom !== this.viewport.zoom;
    if (zoomChanged) {
      // 缩放变化时清理缓存（因为瓦片尺寸逻辑变化）
      this.pruneCache(true);
    }
    
    // 调度瓦片加载
    this.scheduleTiles();
    this.markForRender();
  }
  
  /**
   * 获取当前视口
   */
  getViewport(): ViewportInfo {
    return { ...this.viewport };
  }
  
  /**
   * 标记需要渲染
   */
  markForRender(): void {
    if (!this.needsRender) {
      this.needsRender = true;
      this.requestRender();
    }
  }
  
  /**
   * 请求渲染帧
   */
  private requestRender(): void {
    if (this.animationId !== null) return;
    
    this.animationId = requestAnimationFrame(() => {
      this.animationId = null;
      if (this.needsRender) {
        this.render();
        this.needsRender = false;
      }
    });
  }
  
  /**
   * 渲染当前视口中的瓦片
   */
  private render(): void {
    if (!this.ctx || !this.canvas) return;
    
    const { x: vx, y: vy, width: vw, height: vh, zoom } = this.viewport;
    const ctx = this.ctx;
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    
    // 清空画布
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // 计算需要渲染的瓦片范围（考虑缩放）
    const scale = zoom; // 当前缩放比
    const displayTileSize = this.tileSize * scale;
    
    // 视口在图片完整坐标系中的位置
    const imgViewX = -vx; // 视口左上角在图片中的X
    const imgViewY = -vy; // 视口左上角在图片中的Y
    
    // 计算视口覆盖的瓦片范围
    const startTX = Math.max(0, Math.floor(imgViewX / this.tileSize));
    const startTY = Math.max(0, Math.floor(imgViewY / this.tileSize));
    const endTX = Math.min(this.totalTilesX - 1, Math.ceil((imgViewX + vw / scale) / this.tileSize));
    const endTY = Math.min(this.totalTilesY - 1, Math.ceil((imgViewY + vh / scale) / this.tileSize));
    
    // 绘制每个瓦片
    let visibleCount = 0;
    let loadedCount = 0;
    
    ctx.save();
    
    // 移动到画布中心（与主渲染保持一致）
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    // 应用缩放
    ctx.scale(scale, scale);
    // 应用平移
    ctx.translate(vx / scale, vy / scale);
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        visibleCount++;
        const key = `${tx}_${ty}`;
        const tile = this.tiles.get(key);
        
        if (tile?.bitmap) {
          loadedCount++;
          // 计算瓦片在图片坐标系中的位置
          const tileX = tx * this.tileSize;
          const tileY = ty * this.tileSize;
          
          ctx.drawImage(tile.bitmap, tileX, tileY);
        }
      }
    }
    
    ctx.restore();
    
    // 更新统计
    this.stats.visibleTiles = visibleCount;
    this.stats.loadedTiles = loadedCount;
  }
  
  /**
   * 调度瓦片加载任务
   */
  private scheduleTiles(): void {
    if (!this.fetchTileData) return;
    
    const { x: vx, y: vy, width: vw, height: vh, zoom } = this.viewport;
    const scale = zoom;
    
    // 视口覆盖的图片区域
    const imgViewX = Math.max(0, -vx / scale);
    const imgViewY = Math.max(0, -vy / scale);
    const imgViewW = Math.min(this.imageWidth - imgViewX, vw / scale);
    const imgViewH = Math.min(this.imageHeight - imgViewY, vh / scale);
    
    // 计算瓦片范围（含预加载边缘）
    const startTX = Math.max(0, Math.floor(imgViewX / this.tileSize) - this.preloadMargin);
    const startTY = Math.max(0, Math.floor(imgViewY / this.tileSize) - this.preloadMargin);
    const endTX = Math.min(this.totalTilesX - 1, Math.ceil((imgViewX + imgViewW) / this.tileSize) + this.preloadMargin);
    const endTY = Math.min(this.totalTilesY - 1, Math.ceil((imgViewY + imgViewH) / this.tileSize) + this.preloadMargin);
    
    // 更新优先级并收集需要加载的瓦片
    const toLoad: TileCoord[] = [];
    
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const key = `${tx}_${ty}`;
        let tile = this.tiles.get(key);
        
        if (!tile) {
          tile = {
            tx, ty, key,
            loaded: false,
            loading: false,
            bitmap: null,
            lastUsed: 0,
            priority: 0,
          };
          this.tiles.set(key, tile);
        }
        
        // 计算优先级：视口中心距离越近优先级越高
        const tileCenterX = (tx + 0.5) * this.tileSize;
        const tileCenterY = (ty + 0.5) * this.tileSize;
        const viewCenterX = imgViewX + imgViewW / 2;
        const viewCenterY = imgViewY + imgViewH / 2;
        const dist = Math.sqrt(
          (tileCenterX - viewCenterX) ** 2 + 
          (tileCenterY - viewCenterY) ** 2
        );
        tile.priority = -dist; // 负距离，距离越小优先级越高
        tile.lastUsed = ++this.accessCounter;
        
        // 如果瓦片未加载且未在加载中，加入加载队列
        if (!tile.loaded && !tile.loading) {
          toLoad.push({ tx, ty });
        }
      }
    }
    
    // 按优先级排序（从高到低）
    toLoad.sort((a, b) => {
      const tileA = this.tiles.get(`${a.tx}_${a.ty}`);
      const tileB = this.tiles.get(`${b.tx}_${b.ty}`);
      return (tileB?.priority ?? 0) - (tileA?.priority ?? 0);
    });
    
    // 合并到加载队列（避免重复）
    const existingKeys = new Set(this.loadingQueue.map(t => `${t.tx}_${t.ty}`));
    for (const tc of toLoad) {
      const key = `${tc.tx}_${tc.ty}`;
      if (!existingKeys.has(key)) {
        this.loadingQueue.push(tc);
        existingKeys.add(key);
      }
    }
    
    // 触发加载
    this.processLoadingQueue();
  }
  
  /**
   * 处理加载队列
   */
  private async processLoadingQueue(): Promise<void> {
    while (this.loadingQueue.length > 0 && this.activeLoads < this.maxConcurrent) {
      const tile = this.loadingQueue.shift()!;
      if (!tile) continue;
      
      const key = `${tile.tx}_${tile.ty}`;
      const entry = this.tiles.get(key);
      if (!entry || entry.loaded || entry.loading) continue;
      
      entry.loading = true;
      this.activeLoads++;
      
      this.loadTile(tile, key).finally(() => {
        this.activeLoads--;
        entry!.loading = false;
        this.processLoadingQueue();
      });
    }
  }
  
  /**
   * 加载单个瓦片
   */
  private async loadTile(tile: TileCoord, key: string): Promise<void> {
    const entry = this.tiles.get(key);
    if (!entry || !this.fetchTileData) return;
    
    try {
      // 检查缓存内存限制
      this.enforceCacheLimit();
      
      const startTime = performance.now();
      const data = await this.fetchTileData(tile, this.tileSize);
      
      if (!this._isActive) return; // 引擎已关闭
      
      // 将ArrayBuffer转为ImageBitmap
      const blob = new Blob([data], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      
      if (!this._isActive) {
        bitmap.close();
        return;
      }
      
      // 更新缓存
      entry.bitmap = bitmap;
      entry.loaded = true;
      entry.loading = false;
      entry.lastUsed = ++this.accessCounter;
      
      // 更新统计
      this.stats.totalTilesLoaded++;
      this.stats.currentCacheSize = this.estimateCacheSize();
      this.stats.estimatedCacheCount = this.tiles.size;
      
      const loadTime = performance.now() - startTime;
      
      // 标记重绘
      this.markForRender();
    } catch (error) {
      console.warn(`🧩 瓦片加载失败 [${key}]:`, error);
      this.stats.totalTilesSkipped++;
      
      // 从缓存中移除失败的条目
      this.tiles.delete(key);
    }
  }
  
  /**
   * 估算当前缓存大小（MB）
   */
  private estimateCacheSize(): number {
    let totalMB = 0;
    for (const [, tile] of this.tiles) {
      if (tile.bitmap) {
        // RGBA: width * height * 4
        const bytes = tile.bitmap.width * tile.bitmap.height * 4;
        totalMB += bytes / (1024 * 1024);
      }
    }
    return totalMB;
  }
  
  /**
   * 强制执行缓存上限
   */
  private enforceCacheLimit(): void {
    let cacheSize = this.estimateCacheSize();
    const maxBytes = this.maxCacheMB * 1024 * 1024;
    
    if (cacheSize < maxBytes) return;
    
    // 获取所有已加载的瓦片，按LRU排序
    const loaded = Array.from(this.tiles.values())
      .filter(t => t.bitmap !== null)
      .sort((a, b) => a.lastUsed - b.lastUsed); // 最早的在前
    
    // 逐出最久未使用的瓦片，直到缓存低于上限
    while (loaded.length > 0 && cacheSize > maxBytes * 0.7) { // 降至70%避免频繁触发
      const oldest = loaded.shift()!;
      if (oldest.bitmap) {
        oldest.bitmap.close();
        oldest.bitmap = null;
        oldest.loaded = false;
        
        const bytes = this.tileSize * this.tileSize * 4;
        cacheSize -= bytes / (1024 * 1024);
      }
    }
    
    this.stats.currentCacheSize = this.estimateCacheSize();
  }
  
  /**
   * 清理缓存（可选强制清理所有）
   */
  pruneCache(forceAll: boolean = false): void {
    if (forceAll) {
      // 清理所有非当前视口的瓦片
      const { x: vx, y: vy, width: vw, height: vh, zoom } = this.viewport;
      const scale = zoom;
      
      const imgViewX = Math.max(0, -vx / scale);
      const imgViewY = Math.max(0, -vy / scale);
      const imgViewW = vw / scale;
      const imgViewH = vh / scale;
      
      // 当前视口瓦片范围
      const startTX = Math.max(0, Math.floor(imgViewX / this.tileSize));
      const startTY = Math.max(0, Math.floor(imgViewY / this.tileSize));
      const endTX = Math.min(this.totalTilesX - 1, Math.ceil((imgViewX + imgViewW) / this.tileSize));
      const endTY = Math.min(this.totalTilesY - 1, Math.ceil((imgViewY + imgViewH) / this.tileSize));
      
      const currentKeys = new Set<string>();
      for (let ty = startTY; ty <= endTY; ty++) {
        for (let tx = startTX; tx <= endTX; tx++) {
          currentKeys.add(`${tx}_${ty}`);
        }
      }
      
      for (const [key, tile] of this.tiles) {
        if (!currentKeys.has(key) && tile.bitmap) {
          tile.bitmap.close();
          tile.bitmap = null;
          tile.loaded = false;
        }
      }
    }
    
    this.stats.currentCacheSize = this.estimateCacheSize();
  }
  
  /**
   * 启动缓存自动清理
   */
  private startCacheCleanup(): void {
    if (this.cleanupTimer !== null) return;
    
    this.cleanupTimer = window.setInterval(() => {
      this.enforceCacheLimit();
    }, 5000);
  }
  
  /**
   * 停止缓存清理
   */
  private stopCacheCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  
  /**
   * 销毁引擎，释放所有资源
   */
  dispose(): void {
    this._isActive = false;
    this.stopCacheCleanup();
    
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // 释放所有瓦片位图
    for (const [, tile] of this.tiles) {
      if (tile.bitmap) {
        tile.bitmap.close();
        tile.bitmap = null;
      }
    }
    this.tiles.clear();
    this.loadingQueue = [];
    this.activeLoads = 0;
    this.canvas = null;
    this.ctx = null;
    this.fetchTileData = null;
    
    console.log('🧩 瓦片引擎已销毁');
  }
  
  /**
   * 获取当前是否激活
   */
  get isActive(): boolean {
    return this._isActive;
  }
}