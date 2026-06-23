<script lang="ts">
  import { onDestroy } from 'svelte';
  import { viewerState } from '../stores/viewer';
  import type { DirectoryEntry, ThumbnailData } from '../types/image';

  export let currentPath: string = '';

  let files: DirectoryEntry[] = [];
  let thumbnails = new Map<string, string>(); // path -> base64
  let isLoading = false;
  let lastDir: string = '';

  $: if (currentPath && $viewerState.showThumbnails) {
    loadDirectory();
  }

  async function loadDirectory() {
    if (!currentPath) return;

    const parentDir = currentPath.substring(0, currentPath.lastIndexOf('\\'));
    if (!parentDir) return;

    // 目录切换时清空旧数据
    if (parentDir !== lastDir) {
      lastDir = parentDir;
      files = [];
      thumbnails = new Map<string, string>();
      // 清空所有进行中的防抖定时器
      for (const timer of thumbnailTimers.values()) {
        clearTimeout(timer);
      }
      thumbnailTimers.clear();
    }
    
    isLoading = true;
    try {
      files = await window.electronAPI.listDirectory(parentDir);
      
      // 生成缩略图（仅图片文件，排除 PDF/SVG 等无法生成缩略图的格式）
      for (const file of files) {
        if (!file.isDir && isImageFile(file.name)) {
          generateThumbnailDebounced(file.path);
        }
      }
    } catch (error) {
      console.error('加载目录失败:', error);
    } finally {
      isLoading = false;
    }
  }

  // 缩略图生成防抖：每文件独立计时器，批量加载时合并请求，减少 CPU 峰值
  let thumbnailTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async function generateThumbnailDebounced(filePath: string) {
    const existing = thumbnailTimers.get(filePath);
    if (existing) clearTimeout(existing);
    thumbnailTimers.set(filePath, setTimeout(() => {
      thumbnailTimers.delete(filePath);
      generateThumbnail(filePath);
    }, 100));
  }

  async function generateThumbnail(filePath: string) {
    try {
      const thumbnail = await window.electronAPI.generateThumbnail(filePath, 150);
      
      // 仅当有有效 base64 数据时才设置（SVG 等返回空 data）
      if (thumbnail.data) {
        thumbnails.set(filePath, `data:image/png;base64,${thumbnail.data}`);
      }
      // 无 data 时不设置，模板中会显示占位图标
    } catch (error) {
      console.error('生成缩略图失败:', error);
    }
  }

  function isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'ico', 'svg'];
    return ext ? imageExts.includes(ext) : false;
  }

  function selectFile(path: string) {
    // 触发文件选择事件
    window.dispatchEvent(new CustomEvent('file-select', { detail: path }));
  }

  onDestroy(() => {
    for (const timer of thumbnailTimers.values()) {
      clearTimeout(timer);
    }
    thumbnailTimers.clear();
  });
</script>

{#if $viewerState.showThumbnails}
  <aside class="sidebar">
    <div class="sidebar-header">
      <h3>缩略图</h3>
      <button 
        class="close-btn" 
        on:click={() => viewerState.update(s => ({ ...s, showThumbnails: false }))}
      >
        ×
      </button>
    </div>

    <div class="sidebar-content">
      {#if isLoading}
        <div class="loading">加载中...</div>
      {:else if files.length === 0}
        <div class="empty">暂无文件</div>
      {:else}
        <div class="thumbnail-grid">
          {#each files as file (file.path)}
            {#if !file.isDir}
              <div 
                class="thumbnail-item"
                class:active={file.path === currentPath}
                on:click={() => selectFile(file.path)}
              >
                {#if thumbnails.has(file.path)}
                  <img src={thumbnails.get(file.path)} alt={file.name} />
                {:else}
                  <div class="thumbnail-placeholder">
                    <span class="icon">🖼️</span>
                  </div>
                {/if}
                <div class="thumbnail-name" title={file.name}>
                  {file.name}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 200px;
    background: #252525;
    border-right: 1px solid #3d3d3d;
    display: flex;
    flex-direction: column;
    z-index: 50;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #3d3d3d;
  }

  .sidebar-header h3 {
    margin: 0;
    color: #fff;
    font-size: 14px;
  }

  .close-btn {
    background: none;
    border: none;
    color: #999;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: #fff;
  }

  .sidebar-content {
    flex: 1;
    overflow: hidden;
    padding: 8px;
  }

  .loading,
  .empty {
    text-align: center;
    color: #666;
    padding: 40px 20px;
  }

  .thumbnail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
  }

  .thumbnail-item {
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
    transition: all 0.2s;
    border: 2px solid transparent;
  }

  .thumbnail-item:hover {
    background: #3d3d3d;
  }

  .thumbnail-item.active {
    border-color: #0078d4;
  }

  .thumbnail-item img {
    width: 100%;
    height: 80px;
    object-fit: cover;
    display: block;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 80px;
    background: #3d3d3d;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumbnail-placeholder .icon {
    font-size: 32px;
  }

  .thumbnail-name {
    padding: 4px 6px;
    font-size: 11px;
    color: #ccc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
</style>