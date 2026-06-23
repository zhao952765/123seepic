<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { viewerState, viewerActions, immersiveMode, enterImmersiveMode, exitImmersiveMode } from '$lib/stores/viewer';
  import { registerKeyboardShortcuts, setOpenFileDialogHandler } from '$lib/utils/shortcuts';
  import { loadFileInfo, isImageFile, isPdfFile } from '$lib/utils/imageProcessor';
  
  import Toolbar from '$lib/components/Toolbar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import ImageViewer from '$lib/components/ImageViewer.svelte';
  import PDFViewer from '$lib/components/PDFViewer.svelte';
  import InfoPanel from '$lib/components/InfoPanel.svelte';
  import ContextMenu from '$lib/components/ContextMenu.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TitleBar from '$lib/components/TitleBar.svelte';
  import ImmersiveControls from '$lib/components/ImmersiveControls.svelte';

  let filePath = '';
  let isLoading = false;
  let error: string | null = null;
  let cleanupKeyboard: (() => void) | null = null;
  
  // PDF Viewer 引用
  let pdfViewerComponent: any = null;
  
  // 右键菜单状态
  let contextMenuVisible = false;
  let contextMenuPosition = { x: 0, y: 0 };

  // 沉浸模式 — 底部控制栏引用
  let immersiveControls: any = null;

  // 沉浸模式 — 鼠标跟踪
  function onMouseMove(e: MouseEvent) {
    if (!$immersiveMode) return;
    const bottomZone = window.innerHeight - 40;
    if (e.clientY >= bottomZone) {
      immersiveControls?.show();
    } else {
      immersiveControls?.scheduleHide();
    }
  }

  // 沉浸模式 — 上/下一张导航
  async function navigateTo(direction: -1 | 1) {
    if (!filePath) return;
    try {
      const lastSep = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
      const parentDir = lastSep >= 0 ? filePath.substring(0, lastSep) : '.';
      const entries = await window.electronAPI.listDirectory(parentDir);
      if (!entries || entries.length === 0) return;

      const imageFiles = entries
        .filter((f: any) => !f.isDir && (isImageFile(f.name) || isPdfFile(f.name)))
        .map((f: any) => f.path);

      if (imageFiles.length <= 1) return;

      const idx = imageFiles.indexOf(filePath);
      if (idx === -1) return;

      const nextIdx = direction === 1
        ? Math.min(imageFiles.length - 1, idx + 1)
        : Math.max(0, idx - 1);

      if (nextIdx !== idx) {
        openFile(imageFiles[nextIdx]);
      }
    } catch (err) {
      console.warn('沉浸模式导航失败:', err);
    }
  }

  // 初始化
  onMount(() => {
    // 注册快捷键
    cleanupKeyboard = registerKeyboardShortcuts();
    
    // 注册 Ctrl+O 打开文件回调
    setOpenFileDialogHandler(handleOpenFileDialog);
    
    // 监听文件打开请求（来自命令行或单实例）
    const cleanupFileOpen = window.electronAPI.onFileOpenRequest((fPath: string) => {
      openFile(fPath);
    });
    
    // 监听文件选择事件（从侧边栏）
    const handleFileSelect = (e: Event) => {
      const customEvent = e as CustomEvent;
      openFile(customEvent.detail);
    };
    window.addEventListener('file-select', handleFileSelect);

    // 沉浸模式 — 上/下一张事件
    const handleNavPrev = () => navigateTo(-1);
    const handleNavNext = () => navigateTo(1);
    window.addEventListener('nav-prev', handleNavPrev);
    window.addEventListener('nav-next', handleNavNext);

    // 沉浸模式 — 鼠标移动跟踪
    document.addEventListener('mousemove', onMouseMove);

    // 全局拖拽事件监听（捕获阶段，与 preload 层双重保障）
    const handleDragoverWindow = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleDropWindow = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleDrop(e);
    };
    window.addEventListener('dragover', handleDragoverWindow, { capture: true });
    window.addEventListener('drop', handleDropWindow, { capture: true });
    document.addEventListener('dragover', handleDragoverWindow, { capture: true });
    document.addEventListener('drop', handleDropWindow, { capture: true });
    
    return () => {
      if (cleanupKeyboard) {
        cleanupKeyboard();
      }
      cleanupFileOpen();
      window.removeEventListener('file-select', handleFileSelect);
      window.removeEventListener('nav-prev', handleNavPrev);
      window.removeEventListener('nav-next', handleNavNext);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('dragover', handleDragoverWindow, { capture: true });
      window.removeEventListener('drop', handleDropWindow, { capture: true });
      document.removeEventListener('dragover', handleDragoverWindow, { capture: true });
      document.removeEventListener('drop', handleDropWindow, { capture: true });
    };
  });

  // 打开文件
  async function openFile(path: string) {
    isLoading = true;
    error = null;
    
    try {
      const info = await loadFileInfo(path);
      
      if (isImageFile(path)) {
        viewerActions.reset();
        viewerActions.setImageInfo(info);
        filePath = path;
      } else if (isPdfFile(path)) {
        viewerActions.reset();
        viewerActions.setPdfInfo({
          path: info.path,
          name: info.name,
          size: info.size,
          pageCount: 0,
          currentPage: 1,
        });
        filePath = path;
      } else {
        error = '不支持的文件格式';
      }
    } catch (err) {
      error = `加载文件失败: ${err}`;
    } finally {
      isLoading = false;
    }
    
    if (!error) {
      enterImmersiveMode();
    }
  }

  // PDF 翻页控制
  function pdfNextPage() {
    if (pdfViewerComponent) {
      pdfViewerComponent.nextPage();
    }
  }

  function pdfPrevPage() {
    if (pdfViewerComponent) {
      pdfViewerComponent.prevPage();
    }
  }

  // 拖拽处理（支持多文件）
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    let files = e.dataTransfer?.files;
    
    if ((!files || files.length === 0) && (window as any).__dragDropFiles) {
      files = (window as any).__dragDropFiles;
      (window as any).__dragDropFiles = null;
    }
    
    if (!files || files.length === 0) return;

    const file = files[0];
    let extractedPath: string | null = null;

    if ((file as any).path) {
      extractedPath = (file as any).path;
    }

    if (!extractedPath && window.electronAPI?.getFilePath) {
      try {
        extractedPath = window.electronAPI.getFilePath(file);
      } catch (err) {
        console.error('getFilePath 失败:', err);
      }
    }

    if (extractedPath) {
      await openFile(extractedPath);
    } else {
      console.error('无法获取拖放文件路径');
    }
  }

  // 打开文件对话框
  async function handleOpenFileDialog() {
    try {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        openFile(result.filePaths[0]);
      }
    } catch (err) {
      console.error('打开文件对话框失败:', err);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    // 高频触发，仅在需要时取消注释下面的日志
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  // 右键菜单处理
  async function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    
    // 如果菜单已打开，先关闭再重新打开（确保位置更新，强制触发 reactive 更新）
    if (contextMenuVisible) {
      contextMenuVisible = false;
      await tick();
    }
    
    // 计算菜单位置，确保不超出窗口边界
    const menuWidth = 220;
    const menuHeight = 300;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let x = e.clientX;
    let y = e.clientY;
    
    // 如果右侧空间不足，向左显示
    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 10;
    }
    
    // 如果底部空间不足，向上显示
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 10;
    }
    
    contextMenuPosition = { x, y };
    contextMenuVisible = true;
  }
  
  // 点击其他地方关闭菜单（由 ContextMenu 组件内部处理）

</script>

<svelte:window 
  on:dragover|capture|preventDefault|stopPropagation={(e) => {
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }}
  on:drop|capture|preventDefault|stopPropagation={(e) => {
    handleDrop(e);
  }}
  on:keydown={(e) => {
    // ESC — 优先级：退出沉浸模式 > 关闭菜单 > 退出全屏
    if (e.key === 'Escape') {
      if ($immersiveMode) {
        exitImmersiveMode();
        return;
      }
      if (contextMenuVisible) {
        contextMenuVisible = false;
        return;
      }
      if ($viewerState.isFullscreen) {
        viewerActions.toggleFullscreen();
      }
    }
    
    // 沉浸模式下：← → 键导航，+ - 键缩放（仅无修饰键时）
    if ($immersiveMode && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateTo(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateTo(1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        viewerActions.setZoomAndFitMode($viewerState.zoom * 1.1, 'custom');
      } else if (e.key === '-') {
        e.preventDefault();
        viewerActions.setZoomAndFitMode($viewerState.zoom / 1.1, 'custom');
      }
    }
    
    // PDF 翻页快捷键
    if ($viewerState.mode === 'pdf') {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        pdfNextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        pdfPrevPage();
      }
    }
  }}
/>

<svelte:body 
  class:immersive={$immersiveMode}
  on:dragover={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) { e.dataTransfer.dropEffect = 'copy'; } }}
  on:drop={(e) => {
    handleDrop(e);
  }}
/>

<div 
  class="app"
  class:fullscreen={$viewerState.isFullscreen}
  on:drop={(e) => {
    handleDrop(e);
  }}
  on:dragover={handleDragOver}
  on:dragenter={handleDragEnter}
  on:dragleave={handleDragOver}
  on:contextmenu={handleContextMenu}
>
  <!-- Win11 标题栏 -->
  <TitleBar />
  
  <!-- 工具栏 -->
  {#if $viewerState.showToolbar && !$viewerState.isFullscreen && !$immersiveMode}
    <Toolbar on:openFile={handleOpenFileDialog} />
  {/if}
  
  <!-- 主内容区 -->
  <div class="main-content">
    <!-- 侧边栏 -->
    {#if filePath && !$immersiveMode}
      <Sidebar currentPath={filePath} />
    {/if}
    
    {#if isLoading}
      <div class="loading">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>
    {:else if error}
      <div class="error">
        <p>{error}</p>
      </div>
    {:else if filePath}
      {#key filePath}
        {#if $viewerState.mode === 'image'}
          <ImageViewer {filePath} />
        {:else if $viewerState.mode === 'pdf'}
          <PDFViewer bind:this={pdfViewerComponent} {filePath} />
        {/if}
      {/key}
    {:else}
      <div class="welcome">
        <h1>123看图</h1>
        <p>拖拽图片或 PDF 文件到此处</p>
        <p class="hint">或使用右键菜单 "用 123看图 打开"</p>
      </div>
    {/if}
    
    <!-- 信息面板 -->
    <InfoPanel />
    
    <!-- 右键菜单 -->
    <ContextMenu 
      bind:visible={contextMenuVisible} 
      x={contextMenuPosition.x}
      y={contextMenuPosition.y}
      on:action={async (e) => {
        const action = e.detail;
        const currentPath = $viewerState.imageInfo?.path || filePath;

        if (action === 'zoomIn') {
          viewerActions.setZoomAndFitMode($viewerState.zoom * 1.1, 'custom');
        } else if (action === 'zoomOut') {
          viewerActions.setZoomAndFitMode($viewerState.zoom / 1.1, 'custom');
        } else if (action === 'rotateRight') {
          viewerActions.rotate(90);
        } else if (action === 'rotateLeft') {
          viewerActions.rotate(-90);
        } else if (action === 'flipH') {
          viewerActions.toggleFlipH();
        } else if (action === 'flipV') {
          viewerActions.toggleFlipV();
        } else if (action === 'fitWindow') {
          viewerActions.setFitMode('fit');
        } else if (action === 'actualSize') {
          viewerActions.setFitMode('actual');
        } else if (action === 'showInfo') {
          viewerActions.toggleInfoPanel();
        } else if (action === 'copy' && currentPath) {
          try {
            await window.electronAPI.copyImageToClipboard(currentPath);
          } catch (err) {
            console.error('复制图片失败:', err);
          }
        } else if (action === 'openInExplorer' && currentPath) {
          try {
            await window.electronAPI.openInExplorer(currentPath);
          } catch (err) {
            console.error('在资源管理器中打开失败:', err);
          }
        } else if (action === 'setWallpaper' && currentPath) {
          try {
            await window.electronAPI.setAsWallpaper(currentPath, 'fill');
          } catch (err) {
            console.error('设置壁纸失败:', err);
          }
        }
      }}
    />
  </div>
  
  <!-- 状态栏 -->
  {#if $viewerState.showStatusBar && !$viewerState.isFullscreen}
    <StatusBar />
  {/if}
  
  <!-- 沉浸模式控制栏 -->
  {#if $immersiveMode}
    <ImmersiveControls bind:this={immersiveControls} />
  {/if}
</div>

<style>
  .app {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    overflow: hidden !important;
    -webkit-app-region: no-drag;
  }
  
  .app.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 9999;
  }
  
  .main-content {
    flex: 1;
    position: relative;
    overflow: hidden;
    -webkit-app-region: no-drag;
  }
  
  .loading,
  .error,
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #fff;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #3d3d3d;
    border-top-color: #0078d4;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .welcome h1 {
    font-size: 48px;
    margin-bottom: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .welcome p {
    font-size: 18px;
    color: #999;
    margin: 8px 0;
  }
  
  .welcome .hint {
    font-size: 14px;
    color: #666;
  }
  
  .error {
    color: #ff6b6b;
  }
</style>