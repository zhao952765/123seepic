<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewerState, viewerActions } from '$lib/stores/viewer';
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

  let filePath = '';
  let isLoading = false;
  let error: string | null = null;
  let cleanupKeyboard: (() => void) | null = null;
  
  // PDF Viewer 引用
  let pdfViewerComponent: any = null;
  
  // 右键菜单状态
  let contextMenuVisible = false;
  let contextMenuPosition = { x: 0, y: 0 };

  // 初始化
  onMount(() => {
    // 注册快捷键
    cleanupKeyboard = registerKeyboardShortcuts();
    
    // 注册 Ctrl+O 打开文件回调
    setOpenFileDialogHandler(handleOpenFileDialog);
    
    // 监听文件打开请求（来自命令行或单实例）
    const cleanupFileOpen = window.electronAPI.onFileOpenRequest((filePath: string) => {
      openFile(filePath);
    });
    
    // 监听文件选择事件（从侧边栏）
    const handleFileSelect = (e: Event) => {
      const customEvent = e as CustomEvent;
      openFile(customEvent.detail);
    };
    window.addEventListener('file-select', handleFileSelect);
    
    return () => {
      if (cleanupKeyboard) {
        cleanupKeyboard();
      }
      cleanupFileOpen();
      window.removeEventListener('file-select', handleFileSelect);
    };
  });

  // 打开文件
  async function openFile(path: string) {
    isLoading = true;
    error = null;
    
    try {
      // 加载文件信息
      const info = await loadFileInfo(path);
      
      if (isImageFile(path)) {
        viewerActions.setImageInfo(info);
        viewerActions.reset();
        filePath = path;
      } else if (isPdfFile(path)) {
        viewerActions.setPdfInfo({
          path: info.path,
          name: info.name,
          size: info.size,
          pageCount: 0,
          currentPage: 1,
        });
        viewerActions.reset();
        filePath = path;
      } else {
        error = '不支持的文件格式';
      }
    } catch (err) {
      error = `加载文件失败: ${err}`;
      console.error(err);
    } finally {
      isLoading = false;
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
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      try {
        // Electron 33+ 使用 webUtils.getPathForFile 获取真实路径
        const firstPath = window.electronAPI.getFilePath(files[0]);
        if (firstPath) {
          openFile(firstPath);
        } else {
          console.error('无法获取文件路径，files[0]:', files[0]);
        }
      } catch (err) {
        console.error('getFilePath 失败:', err);
        // 兜底：尝试旧版 File.path
        const fallbackPath = (files[0] as any).path;
        if (fallbackPath) {
          openFile(fallbackPath);
        }
      }
      if (files.length > 1) {
        console.log(`拖入 ${files.length} 个文件`);
      }
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
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  // 右键菜单处理
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    
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
  
  // 点击其他地方关闭菜单
  function handleClick() {
    contextMenuVisible = false;
  }
</script>

<svelte:window 
  on:keydown={(e) => {
    // ESC 退出全屏或关闭菜单
    if (e.key === 'Escape') {
      if (contextMenuVisible) {
        contextMenuVisible = false;
      } else if ($viewerState.isFullscreen) {
        viewerActions.toggleFullscreen();
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
  on:click={handleClick}
/>

<div 
  class="app"
  class:fullscreen={$viewerState.isFullscreen}
  on:drop={handleDrop}
  on:dragover={handleDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragOver}
  on:contextmenu={handleContextMenu}
>
  <!-- Win11 标题栏 -->
  <TitleBar />
  
  <!-- 工具栏 -->
  {#if $viewerState.showToolbar && !$viewerState.isFullscreen}
    <Toolbar on:openFile={handleOpenFileDialog} />
  {/if}
  
  <!-- 主内容区 -->
  <div class="main-content">
    <!-- 侧边栏 -->
    {#if filePath}
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
      {#if $viewerState.mode === 'image'}
        <ImageViewer {filePath} />
      {:else if $viewerState.mode === 'pdf'}
        <PDFViewer bind:this={pdfViewerComponent} {filePath} />
      {/if}
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
      visible={contextMenuVisible} 
      x={contextMenuPosition.x}
      y={contextMenuPosition.y}
      on:action={async (e) => {
        const action = e.detail;
        const currentPath = $viewerState.currentFile || filePath;

        if (action === 'copy' && currentPath) {
          try {
            await window.electronAPI.copyImageToClipboard(currentPath);
          } catch (err) {
            console.error('复制图片失败:', err);
          }
        } else if (action === 'setWallpaper' && currentPath) {
          try {
            await window.electronAPI.setAsWallpaper(currentPath, 'fill');
          } catch (err) {
            console.error('设置壁纸失败:', err);
          }
        }
        // 其他 action（zoomIn/zoomOut/rotateRight 等）由快捷键系统处理
      }}
    />
  </div>
  
  <!-- 状态栏 -->
  {#if $viewerState.showStatusBar && !$viewerState.isFullscreen}
    <StatusBar />
  {/if}
</div>

<style>
  .app {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    overflow: hidden;
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
