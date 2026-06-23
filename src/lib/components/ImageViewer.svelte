<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewerState, viewerActions, boundaryBlocked } from '../stores/viewer';
  import { theme } from '../stores/theme';
  import { get } from 'svelte/store';
  import { 
    loadImageAsBitmap, 
    perfMonitor,
    InertiaEngine,
    TwoStageRenderer,
    ImageCachePool,
    isImageFile
  } from '../utils/imageProcessor';

  export let filePath: string;
  
  export let fileList: string[] = [];
  export let currentIndex: number = 0;

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let imageBitmap: ImageBitmap | null = null;
  
  // KN-002: GIF 动画支持
  let gifImage: HTMLImageElement | null = null;
  let isGif = false;
  let gifObjectUrl: string | null = null;
  
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
  
  // ✅ 主题切换时触发重绘
  $: if ($theme) {
    markForRender();
  }
  
  // ✅ 惯性动画引擎
  let zoomInertia: InertiaEngine | null = null;
  let panInertiaX: InertiaEngine | null = null;
  let panInertiaY: InertiaEngine | null = null;
  
  // ✅ 双阶段渲染器
  let twoStageRenderer: TwoStageRenderer | null = null;
  
  // ✅ 缩放常量
  const ZOOM_STEP = 0.05;        // 每次滚轮缩放 5%（1.05 倍，与2345看图一致）
  const ZOOM_MIN = 0.05;        // 最小缩放 5%
  const ZOOM_MAX = 10;          // 最大缩放 1000%
  const ZOOM_SNAP_100 = 0.03;   // 100% 吸附阈值：±3%内自动吸附到实际大小
  
  // ✅ 滚轮缩放 rAF 防抖
  let wheelRafId: number | null = null;
  let pendingZoom: number | null = null;
  let fileNavCooldown: number | null = null;

  // 窗口最大化/还原状态追踪
  let windowMaximized = false;
  let cleanupMaximized: (() => void) | null = null;
  let isMaximizeRestoreEvent = false;

  // 初始化 Canvas
  onMount(async () => {
    dpr = window.devicePixelRatio || 1;
    
    ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });
    
    if (!ctx) {
      console.error('无法创建Canvas上下文');
      return;
    }
    
    twoStageRenderer = new TwoStageRenderer(canvas, ctx);
    cachePool = new ImageCachePool(3);
    resizeCanvas();

    await loadImage();
    preloadAdjacentImages();

    window.addEventListener('resize', handleResize);

    windowMaximized = await window.electronAPI?.isMaximized() || false;
    cleanupMaximized = window.electronAPI?.onMaximizedChange((maximized: boolean) => {
      isMaximizeRestoreEvent = true;
      windowMaximized = maximized;
      handleResize();
      isMaximizeRestoreEvent = false;
    });

    perfMonitor.start();
    requestRenderLoop();
  });

  onDestroy(() => {
    // ✅ 清理资源
    window.removeEventListener('resize', handleResize);
    if (cleanupMaximized) cleanupMaximized();
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    
    // ✅ 停止所有惯性动画
    zoomInertia?.stop();
    panInertiaX?.stop();
    panInertiaY?.stop();
    
    // ✅ 清理双阶段渲染器
    twoStageRenderer?.dispose();
    if (wheelRafId) {
      cancelAnimationFrame(wheelRafId);
    }
    if (fileNavCooldown) {
      clearTimeout(fileNavCooldown);
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
    // KN-002: 释放 GIF 资源
    if (gifObjectUrl) {
      URL.revokeObjectURL(gifObjectUrl);
      gifObjectUrl = null;
    }
    if (gifImage) {
      gifImage.src = '';
      gifImage = null;
    }
    isGif = false;
  }

  // ✅ 加载图片文件（优先从缓存获取）
  async function loadImage() {
    try {
      releaseBitmap();
      
      // KN-002: 检测 GIF 文件，使用动画渲染路径
      isGif = filePath.toLowerCase().endsWith('.gif');
      
      if (isGif) {
        await loadGifImage();
      } else {
        const cached = cachePool?.get(filePath);
        
        if (cached) {
          imageBitmap = cached;
        } else {
          imageBitmap = await loadImageAsBitmap(filePath);
          cachePool?.set(filePath, imageBitmap);
        }
      }
      
      autoFit();
      markForRender();
    } catch (error) {
      console.error('加载图片失败:', error);
    }
  }
  
  // 加载新图片时重置为实际尺寸
  $: if (filePath) {
    viewerActions.setFitMode('actual');
  }
  
  // KN-002: 加载 GIF 为动画 Image 元素
  async function loadGifImage() {
    try {
      const raw = await window.electronAPI.readFileBuffer(filePath);
      const typedArray = raw && raw.type === 'Buffer' && Array.isArray(raw.data)
        ? new Uint8Array(raw.data)
        : raw;
      const blob = new Blob([typedArray], { type: 'image/gif' });
      gifObjectUrl = URL.createObjectURL(blob);
      
      gifImage = new Image();
      gifImage.src = gifObjectUrl;
      
      await new Promise<void>((resolve, reject) => {
        gifImage!.onload = () => resolve();
        gifImage!.onerror = () => reject(new Error('GIF 加载失败'));
      });
      
      // 开始连续渲染（GIF 动画需要持续绘制）
      markForRender();
    } catch (error) {
      console.error('加载 GIF 动画失败:', error);
      // 降级：尝试用 ImageBitmap 加载静态首帧
      isGif = false;
      imageBitmap = await loadImageAsBitmap(filePath);
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
      cachePool?.preloadBatch(pathsToPreload);
    }
  }

  // ✅ 自动适应窗口
  function autoFit(force: boolean = false) {
    const imgWidth = isGif ? (gifImage?.naturalWidth || 0) : (imageBitmap?.width || 0);
    const imgHeight = isGif ? (gifImage?.naturalHeight || 0) : (imageBitmap?.height || 0);
    
    if (!imgWidth || !imgHeight || !container) return;
    
    const state = get(viewerState);
    
    if (!force && state.fitMode === 'custom') {
      return;
    }
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    let targetZoom = 1;
    
    if (state.fitMode === 'fit') {
      // 适应窗口（保持比例）
      const scaleX = containerWidth / imgWidth;
      const scaleY = containerHeight / imgHeight;
      targetZoom = Math.min(scaleX, scaleY);
    } else if (state.fitMode === 'auto') {
      // 智能适应：图片大于界面时适配，小于界面时用实际尺寸
      if (imgWidth > containerWidth || imgHeight > containerHeight) {
        const scaleX = containerWidth / imgWidth;
        const scaleY = containerHeight / imgHeight;
        targetZoom = Math.min(scaleX, scaleY);
      } else {
        targetZoom = 1;
      }
    } else if (state.fitMode === 'fill') {
      // 填充窗口
      const scaleX = containerWidth / imgWidth;
      const scaleY = containerHeight / imgHeight;
      targetZoom = Math.max(scaleX, scaleY);
    } else if (state.fitMode === 'width') {
      // 适应宽度
      targetZoom = containerWidth / imgWidth;
    } else {
      // 实际尺寸
      targetZoom = 1;
    }
    
    viewerActions.setZoom(targetZoom);
    
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
      // KN-002: GIF 动画每帧都需要渲染
      if (needsRender || isGif) {
        const startTime = performance.now();
        
        // ✅ 使用双阶段渲染器
        if (twoStageRenderer) {
          twoStageRenderer.render(() => render());
        } else {
          render();
        }
        
        const renderTime = performance.now() - startTime;
        
        // ✅ 记录性能指标
        if (imageBitmap && canvas) {
          perfMonitor.recordFrame(renderTime, canvas, dpr, imageBitmap);
        }
        
        needsRender = false;
      }
      animationFrameId = requestAnimationFrame(loop);
    }
    loop();
  }

  // ✅ 高清渲染图片到Canvas
  function render() {
    if (!ctx || !container) return;
    
    const state = get(viewerState);
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // ✅ 清空画布（始终执行，避免透明 canvas 显示穿透内容）
    ctx.fillStyle = $theme === 'light' ? '#ffffff' : '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    const imgWidth = isGif ? (gifImage?.naturalWidth || 0) : (imageBitmap?.width || 0);
    const imgHeight = isGif ? (gifImage?.naturalHeight || 0) : (imageBitmap?.height || 0);
    
    if (!imgWidth || !imgHeight) return;
    
    // ✅ 计算绘制尺寸
    const drawWidth = imgWidth * state.zoom;
    const drawHeight = imgHeight * state.zoom;
    
    ctx.save();
    
    // ✅ 移动到画布中心
    ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
    
    // ✅ 应用旋转
    ctx.rotate((state.rotation * Math.PI) / 180);
    
    // ✅ 应用翻转
    const scaleX = state.flipH ? -1 : 1;
    const scaleY = state.flipV ? -1 : 1;
    ctx.scale(scaleX, scaleY);
    
    // ✅ 高质量平滑插值（始终启用，与2345看图一致）
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // ✅ 绘制图片（居中）
    if (isGif && gifImage && gifImage.complete) {
      ctx.drawImage(
        gifImage,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    } else if (imageBitmap) {
      ctx.drawImage(
        imageBitmap,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    }
    
    ctx.restore();
  }

  // ✅ 处理窗口大小变化
  function handleResize() {
    dpr = window.devicePixelRatio || 1;
    resizeCanvas();

    const state = get(viewerState);
    const imgWidth = isGif ? (gifImage?.naturalWidth || 0) : (imageBitmap?.width || 0);
    const imgHeight = isGif ? (gifImage?.naturalHeight || 0) : (imageBitmap?.height || 0);
    if (!imgWidth || !imgHeight || !container) return;

    const drawWidth = imgWidth * state.zoom;
    const drawHeight = imgHeight * state.zoom;
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;

    if (state.fitMode === 'fit' || state.fitMode === 'auto' || isMaximizeRestoreEvent) {
      autoFit();
      return;
    }

    if (drawWidth > viewWidth || drawHeight > viewHeight) {
      autoFit(true);
    }
  }

  // ✅ 滚轮：Ctrl+Wheel 指数缩放，Plain Wheel 翻文件

  async function handleWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation(); // 防止在 canvas 和容器 div 上重复触发

    if (event.ctrlKey || event.metaKey) {
      // === Ctrl+Wheel: 指数缩放 ===
      // 标准化 delta：一次滚轮刻度 ≈ 100，归一化到 0~1 范围
      const normalizedDelta = -event.deltaY / 100;
      // 指数缩放因子：滚轮上=放大(1.1)，滚轮下=缩小(0.909)
      const factor = Math.pow(1 + ZOOM_STEP, normalizedDelta);

      const state = get(viewerState);
      let newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom * factor));

      // ✅ 100% 吸附：接近实际大小时自动吸附
      if (Math.abs(newZoom - 1) < ZOOM_SNAP_100 && state.zoom !== 1) {
        newZoom = 1;
      }

      // rAF 防抖：合并同一帧内的多次 wheel 事件
      pendingZoom = newZoom;
      if (!wheelRafId) {
        wheelRafId = requestAnimationFrame(() => {
          if (pendingZoom !== null) {
            const currentState = get(viewerState);
            if (currentState.fitMode !== 'custom') {
              // 首次手动缩放，切换到 custom 模式
              viewerActions.setZoomAndFitMode(pendingZoom, 'custom');
            } else {
              viewerActions.setZoom(pendingZoom);
            }
            markForRender();
            pendingZoom = null;
          }
          wheelRafId = null;
        });
      }
    } else {
      // === Plain Wheel: 切换上/下一张图片（翻文件）===
      if (fileNavCooldown) return;
      fileNavCooldown = setTimeout(() => { fileNavCooldown = null; }, 180);

      try {
        const lastSep = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
        const parentDir = lastSep >= 0 ? filePath.substring(0, lastSep) : '.';
        const entries = await window.electronAPI.listDirectory(parentDir);
        if (!entries || entries.length === 0) return;

        const imageFiles = entries
          .filter((f: any) => !f.isDir && isImageFile(f.name))
          .map((f: any) => f.path);

        if (imageFiles.length <= 1) return;

        const idx = imageFiles.indexOf(filePath);
        if (idx === -1) return;

        const isLast = idx >= imageFiles.length - 1;
        const isFirst = idx <= 0;

        if (event.deltaY > 0 && isLast) {
          if (get(boundaryBlocked) === 'last') {
            boundaryBlocked.set(null);
          } else {
            window.dispatchEvent(new CustomEvent('toast', {
              detail: '已经是最后一张'
            }));
            boundaryBlocked.set('last');
            return;
          }
        } else if (event.deltaY < 0 && isFirst) {
          if (get(boundaryBlocked) === 'first') {
            boundaryBlocked.set(null);
          } else {
            window.dispatchEvent(new CustomEvent('toast', {
              detail: '已经是第一张'
            }));
            boundaryBlocked.set('first');
            return;
          }
        } else {
          boundaryBlocked.set(null);
        }

        const nextIdx = event.deltaY > 0
          ? (idx + 1) % imageFiles.length
          : (idx - 1 + imageFiles.length) % imageFiles.length;

        if (nextIdx !== idx) {
          window.dispatchEvent(new CustomEvent('file-select', {
            detail: imageFiles[nextIdx]
          }));
        }
      } catch (err) {
        console.warn('文件导航失败:', err);
      }
    }
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

  function isMouseOnImage(mx: number, my: number): boolean {
    const state = get(viewerState);
    const imgWidth = isGif ? (gifImage?.naturalWidth || 0) : (imageBitmap?.width || 0);
    const imgHeight = isGif ? (gifImage?.naturalHeight || 0) : (imageBitmap?.height || 0);
    if (!imgWidth || !imgHeight || !container) return false;

    const drawWidth = imgWidth * state.zoom;
    const drawHeight = imgHeight * state.zoom;
    const centerX = container.clientWidth / 2 + offsetX;
    const centerY = container.clientHeight / 2 + offsetY;

    return (
      mx >= centerX - drawWidth / 2 &&
      mx <= centerX + drawWidth / 2 &&
      my >= centerY - drawHeight / 2 &&
      my <= centerY + drawHeight / 2
    );
  }

  let isWindowDragging = false;

  function handleMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      const onImage = isMouseOnImage(event.offsetX, event.offsetY);
      if (!onImage) {
        isWindowDragging = true;
        window.electronAPI?.startWindowDrag(event.screenX, event.screenY);
        window.addEventListener('mousemove', handleWindowDragMove);
        window.addEventListener('mouseup', handleWindowDragEnd);
        return;
      }

      isDragging = true;
      dragStartX = event.clientX - offsetX;
      dragStartY = event.clientY - offsetY;
      canvas.style.cursor = 'grabbing';

      panInertiaX?.stop();
      panInertiaY?.stop();
    }
  }

  function handleWindowDragMove(event: MouseEvent) {
    if (isWindowDragging) {
      window.electronAPI?.moveWindowDrag(event.screenX, event.screenY);
    }
  }

  function handleWindowDragEnd() {
    if (isWindowDragging) {
      isWindowDragging = false;
      window.electronAPI?.endWindowDrag();
      window.removeEventListener('mousemove', handleWindowDragMove);
      window.removeEventListener('mouseup', handleWindowDragEnd);
    }
  }

  function handleMouseMove(event: MouseEvent) {
    if (isDragging) {
      offsetX = event.clientX - dragStartX;
      offsetY = event.clientY - dragStartY;
      markForRender();
    } else if (!isWindowDragging) {
      const onImage = isMouseOnImage(event.offsetX, event.offsetY);
      canvas.style.cursor = onImage ? 'grab' : 'default';
    }
  }

  function handleMouseUp(event: MouseEvent) {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';

      const velocityX = event.movementX || 0;
      const velocityY = event.movementY || 0;

      if (Math.abs(velocityX) > 1 || Math.abs(velocityY) > 1) {
        startPanInertia(velocityX, velocityY);
      }
    }
    handleWindowDragEnd();
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
    
    if (state.fitMode === 'auto' || state.fitMode === 'fit') {
      // 当前是适应模式 → 切换到实际尺寸
      viewerActions.setZoomAndFitMode(1, 'actual');
    } else {
      // 当前是自定义或实际尺寸 → 切换到智能适应
      viewerActions.setFitMode('auto');
      autoFit();
    }
    
    // ✅ 平滑过渡动画
    if (zoomInertia) {
      zoomInertia.smoothTo(get(viewerState).zoom, 300);
    }
    
    markForRender();
  }

  // ✅ 监听 store 中任何渲染相关状态变化，标记重绘
  $: $viewerState, markForRender();

  // ✅ 监听适应模式变化，自动调整缩放（仅当 fitMode 真正改变时触发）
  //    注意：'custom' 模式不触发 autoFit，保持用户手动设置的 zoom
  let prevFitMode: string = $viewerState.fitMode;
  $: if ($viewerState.fitMode !== prevFitMode) {
    prevFitMode = $viewerState.fitMode;
    if ($viewerState.fitMode !== 'custom') {
      autoFit();
    }
  }
  
  // 注意：filePath 变化时由父组件的 {#key filePath} 强制重新挂载，确保完全重置状态
</script>

<div 
  bind:this={container} 
  class="image-viewer-container"
  on:wheel|nonpassive={handleWheel}
>
  <canvas
    bind:this={canvas}
    class="image-canvas"
    on:wheel|nonpassive={handleWheel}
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
    background: var(--canvas-bg, #1a1a1a);
    cursor: grab;
    transition: background-color 0.3s ease;
  }
  
  .image-canvas {
    width: 100%;
    height: 100%;
    display: block;
    -webkit-app-region: no-drag;
    transform: none !important;
  }
</style>