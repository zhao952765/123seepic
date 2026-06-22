<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewerState, viewerActions } from '../stores/viewer';
  import { get } from 'svelte/store';
  import { 
    loadImageAsBitmap, 
    perfMonitor,
    InertiaEngine,
    TwoStageRenderer,
    ImageCachePool
  } from '../utils/imageProcessor';

  export let filePath: string;
  
  // ✅ 新增：文件列表和当前索引（用于预加载）
  export let fileList: string[] = [];
  export let currentIndex: number = 0;

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let imageBitmap: ImageBitmap | null = null;
  
  // ✅ 智能缓存池（仅缓存3张：当前、上一张、下一张）
  let cachePool: ImageCachePool | null = null;
  
  // ✅ 渲染优化状态
  let animationFrameId: number | null = null;
  let needsRender = false;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let offsetX = 0;
  let offsetY = 0;
  
  // ✅ 设备像素比（高DPI支持）
  let dpr = 1;
  
  // ✅ 惯性动画引擎
  let zoomInertia: InertiaEngine | null = null;
  let panInertiaX: InertiaEngine | null = null;
  let panInertiaY: InertiaEngine | null = null;
  
  // ✅ 双阶段渲染器
  let twoStageRenderer: TwoStageRenderer | null = null;
  
  // ✅ 缩放手势跟踪
  let lastWheelTime = 0;
  let wheelVelocity = 0;
  let isZooming = false;
  let zoomTimeout: number | null = null;

  // 初始化 Canvas
  onMount(async () => {
    // ✅ 获取设备像素比
    dpr = window.devicePixelRatio || 1;
    
    // ✅ 创建高性能Canvas上下文
    ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true, // GPU加速
      willReadFrequently: false, // 优化写入性能
    });
    
    if (!ctx) {
      console.error('无法创建Canvas上下文');
      return;
    }
    
    // ✅ 初始化双阶段渲染器
    twoStageRenderer = new TwoStageRenderer(canvas, ctx);
    
    // ✅ 初始化智能缓存池
    cachePool = new ImageCachePool(3); // 最多缓存3张
    
    // ✅ 设置Canvas物理像素尺寸
    resizeCanvas();

    // 加载图片
    await loadImage();
    
    // ✅ 预加载相邻图片（上一张、下一张）
    preloadAdjacentImages();

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
    
    // ✅ 启动性能监控
    perfMonitor.start();
    
    // ✅ 启动渲染循环
    requestRenderLoop();
  });

  onDestroy(() => {
    // ✅ 清理资源
    window.removeEventListener('resize', handleResize);
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    
    // ✅ 停止所有惯性动画
    zoomInertia?.stop();
    panInertiaX?.stop();
    panInertiaY?.stop();
    
    // ✅ 清理双阶段渲染器
    twoStageRenderer?.dispose();
    
    // ✅ 清除超时定时器
    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }
    
    // ✅ 清空缓存池并释放所有内存
    cachePool?.clear();
    cachePool = null;
    
    // ✅ 立即释放ImageBitmap
    releaseBitmap();
    
    // 打印性能报告
    perfMonitor.printReport();
  });

  // ✅ 释放ImageBitmap资源
  function releaseBitmap() {
    if (imageBitmap) {
      imageBitmap.close();
      imageBitmap = null;
    }
  }

  // ✅ 加载图片文件（优先从缓存获取）
  async function loadImage() {
    try {
      // ✅ 先从缓存池查找
      const cached = cachePool?.get(filePath);
      
      if (cached) {
        // ✅ 缓存命中：直接使用
        console.log(`🚀 秒开（缓存命中）: ${filePath}`);
        imageBitmap = cached;
      } else {
        // ❌ 缓存未命中：加载并缓存
        console.log(`⏳ 加载中: ${filePath}`);
        const startTime = performance.now();
        imageBitmap = await loadImageAsBitmap(filePath);
        const loadTime = performance.now() - startTime;
        
        console.log(`✅ 图片加载耗时: ${loadTime.toFixed(2)}ms`);
        
        // ✅ 存入缓存池
        cachePool?.set(filePath, imageBitmap);
      }
      
      // 自动适应窗口
      autoFit();
      
      // 标记需要重绘
      markForRender();
    } catch (error) {
      console.error('加载图片失败:', error);
    }
  }
  
  // ✅ 预加载相邻图片（上一张、下一张）
  async function preloadAdjacentImages() {
    if (!fileList || fileList.length === 0) return;
    
    const pathsToPreload: string[] = [];
    
    // 上一张
    if (currentIndex > 0) {
      pathsToPreload.push(fileList[currentIndex - 1]);
    }
    
    // 下一张
    if (currentIndex < fileList.length - 1) {
      pathsToPreload.push(fileList[currentIndex + 1]);
    }
    
    if (pathsToPreload.length > 0) {
      console.log(`⏳ 预加载相邻图片: ${pathsToPreload.join(', ')}`);
      // ✅ 后台并行预加载，不阻塞当前显示
      cachePool?.preloadBatch(pathsToPreload);
    }
  }

  // ✅ 自动适应窗口
  function autoFit() {
    if (!imageBitmap || !container) return;
    
    const state = get(viewerState);
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    if (state.fitMode === 'fit') {
      // 适应窗口（保持比例）
      const scaleX = containerWidth / imageBitmap.width;
      const scaleY = containerHeight / imageBitmap.height;
      viewerActions.setZoom(Math.min(scaleX, scaleY));
    } else if (state.fitMode === 'fill') {
      // 填充窗口
      const scaleX = containerWidth / imageBitmap.width;
      const scaleY = containerHeight / imageBitmap.height;
      viewerActions.setZoom(Math.max(scaleX, scaleY));
    } else if (state.fitMode === 'width') {
      // 适应宽度
      viewerActions.setZoom(containerWidth / imageBitmap.width);
    } else {
      // 实际尺寸
      viewerActions.setZoom(1);
    }
    
    // 居中显示
    offsetX = 0;
    offsetY = 0;
  }

  // ✅ Canvas尺寸适配高DPI屏幕
  function resizeCanvas() {
    if (!canvas || !container || !ctx) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // ✅ 设置物理像素尺寸（乘以devicePixelRatio）
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    
    // CSS尺寸保持逻辑像素
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    // ✅ 缩放上下文以匹配DPR
    ctx.scale(dpr, dpr);
    
    // 标记需要重绘
    markForRender();
  }

  // ✅ 标记需要渲染（避免重复调用）
  function markForRender() {
    if (!needsRender) {
      needsRender = true;
    }
  }

  // ✅ 渲染循环（requestAnimationFrame）
  function requestRenderLoop() {
    function loop() {
      if (needsRender) {
        const startTime = performance.now();
        
        // ✅ 使用双阶段渲染器
        if (twoStageRenderer) {
          twoStageRenderer.render(() => render());
        } else {
          render();
        }
        
        const renderTime = performance.now() - startTime;
        
        // ✅ 记录性能指标
        perfMonitor.recordFrame(renderTime, canvas, dpr, imageBitmap || undefined);
        
        needsRender = false;
      }
      animationFrameId = requestAnimationFrame(loop);
    }
    loop();
  }

  // ✅ 高清渲染图片到Canvas
  function render() {
    if (!ctx || !imageBitmap || !container) return;
    
    const state = get(viewerState);
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // ✅ 清空画布
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    ctx.save();
    
    // ✅ 移动到画布中心
    ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
    
    // ✅ 应用旋转
    ctx.rotate((state.rotation * Math.PI) / 180);
    
    // ✅ 应用翻转
    const scaleX = state.flipH ? -1 : 1;
    const scaleY = state.flipV ? -1 : 1;
    ctx.scale(scaleX, scaleY);
    
    // ✅ 计算绘制尺寸
    const drawWidth = imageBitmap.width * state.zoom;
    const drawHeight = imageBitmap.height * state.zoom;
    
    // ✅ 启用高质量双线性插值（GPU加速）
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high'; // Lanczos3算法
    
    // ✅ 绘制图片（居中）
    ctx.drawImage(
      imageBitmap,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );
    
    ctx.restore();
  }

  // ✅ 处理窗口大小变化
  function handleResize() {
    // ✅ 更新DPR（可能在不同显示器间移动）
    dpr = window.devicePixelRatio || 1;
    resizeCanvas();
  }

  // ✅ 滚轮平滑缩放（带惯性和节流）
  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    
    const now = performance.now();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    
    // 计算滚轮速度（用于惯性）
    const timeDelta = now - lastWheelTime;
    if (timeDelta > 0 && timeDelta < 100) {
      wheelVelocity = delta / timeDelta * 1000;
    }
    lastWheelTime = now;
    
    const state = get(viewerState);
    const newZoom = Math.max(0.1, Math.min(10, state.zoom + delta));
    
    // ✅ 开始快速缩放模式（低质量渲染）
    if (!isZooming && twoStageRenderer) {
      isZooming = true;
      twoStageRenderer.beginFastZoom();
    }
    
    // 取消之前的延迟高清渲染
    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }
    
    // 更新缩放值
    viewerActions.setZoom(newZoom);
    markForRender();
    
    // ✅ 缩放手势结束后，延迟执行高清重绘
    zoomTimeout = setTimeout(() => {
      isZooming = false;
      
      if (twoStageRenderer) {
        twoStageRenderer.endFastZoom(() => {
          // 强制高清重绘
          ctx!.imageSmoothingQuality = 'high';
          render();
        });
      }
      
      // ✅ 启动缩放惯性动画
      startZoomInertia(wheelVelocity);
      
      zoomTimeout = null;
    }, 150); // 150ms后认为手势结束
  }
  
  // ✅ 启动缩放惯性
  function startZoomInertia(velocity: number) {
    if (Math.abs(velocity) < 0.1) return; // 速度太小不启动惯性
    
    const state = get(viewerState);
    
    // 创建或复用惯性引擎
    if (!zoomInertia) {
      zoomInertia = new InertiaEngine(
        state.zoom,
        (value) => {
          viewerActions.setZoom(value);
          markForRender();
        },
        () => {
          // 惯性结束后，确保最终高清渲染
          if (twoStageRenderer) {
            twoStageRenderer.endFastZoom(() => render());
          }
        }
      );
    }
    
    zoomInertia.start(velocity * 0.01); // 调整惯性强度
  }

  // ✅ 鼠标拖拽（带惯性）
  function handleMouseDown(event: MouseEvent) {
    if (event.button === 0) { // 左键
      isDragging = true;
      dragStartX = event.clientX - offsetX;
      dragStartY = event.clientY - offsetY;
      canvas.style.cursor = 'grabbing';
      
      // ✅ 停止之前的平移惯性
      panInertiaX?.stop();
      panInertiaY?.stop();
    }
  }

  function handleMouseMove(event: MouseEvent) {
    if (isDragging) {
      offsetX = event.clientX - dragStartX;
      offsetY = event.clientY - dragStartY;
      markForRender();
    }
  }

  function handleMouseUp(event: MouseEvent) {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';
      
      // ✅ 计算拖拽末速度并启动惯性
      const velocityX = event.movementX || 0;
      const velocityY = event.movementY || 0;
      
      if (Math.abs(velocityX) > 1 || Math.abs(velocityY) > 1) {
        startPanInertia(velocityX, velocityY);
      }
    }
  }
  
  // ✅ 启动平移惯性
  function startPanInertia(velocityX: number, velocityY: number) {
    // X轴惯性
    if (!panInertiaX) {
      panInertiaX = new InertiaEngine(
        offsetX,
        (value) => {
          offsetX = value;
          markForRender();
        },
        () => {}
      );
    }
    panInertiaX.smoothTo(offsetX + velocityX * 10, 300);
    
    // Y轴惯性
    if (!panInertiaY) {
      panInertiaY = new InertiaEngine(
        offsetY,
        (value) => {
          offsetY = value;
          markForRender();
        },
        () => {}
      );
    }
    panInertiaY.smoothTo(offsetY + velocityY * 10, 300);
  }

  // ✅ 双击智能缩放（适应 ↔ 实际尺寸切换）
  function handleDoubleClick() {
    const state = get(viewerState);
    
    if (state.zoom !== 1) {
      // 当前不是1:1，切换到实际尺寸
      viewerActions.setZoom(1);
      viewerActions.setFitMode('actual');
    } else {
      // 当前是1:1，切换到适应窗口
      viewerActions.setFitMode('fit');
      autoFit();
    }
    
    // ✅ 平滑过渡动画
    if (zoomInertia) {
      zoomInertia.smoothTo(get(viewerState).zoom, 300);
    }
    
    markForRender();
  }

  // ✅ 监听状态变化并标记重绘
  $: if (viewerState) {
    markForRender();
  }
  
  // ✅ 监听文件路径变化，重新加载
  $: if (filePath) {
    loadImage();
    preloadAdjacentImages();
  }
</script>

<div 
  bind:this={container} 
  class="image-viewer-container"
  on:wheel={handleWheel}
>
  <canvas
    bind:this={canvas}
    class="image-canvas"
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
    on:dblclick={handleDoubleClick}
  />
</div>

<style>
  .image-viewer-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #1a1a1a;
    cursor: grab;
    /* ✅ 禁用浏览器默认的图片渲染优化 */
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }
  
  .image-canvas {
    width: 100%;
    height: 100%;
    display: block;
    /* ✅ 确保Canvas不应用CSS变换 */
    transform: none !important;
  }
</style>