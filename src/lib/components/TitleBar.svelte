<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let isMaximized = false;
  let cleanupMaximized: (() => void) | null = null;

  onMount(async () => {
    // 初始化最大化状态
    isMaximized = await window.electronAPI.isMaximized();

    // 监听窗口最大化状态变化
    cleanupMaximized = window.electronAPI.onMaximizedChange((maximized: boolean) => {
      isMaximized = maximized;
    });
  });

  onDestroy(() => {
    if (cleanupMaximized) {
      cleanupMaximized();
    }
  });

  async function minimize() {
    await window.electronAPI.minimize();
  }

  async function toggleMaximize() {
    if (isMaximized) {
      await window.electronAPI.unmaximize();
    } else {
      await window.electronAPI.maximize();
    }
    // 不手动翻转 isMaximized，由 onMaximizedChange 回调统一更新，避免竞态
  }

  async function close() {
    try {
      if (window.electronAPI?.close) {
        await window.electronAPI.close();
      } else {
        console.warn('[TitleBar] electronAPI.close 不可用，回退到 window.close()');
        window.close();
      }
    } catch (err) {
      console.error('[TitleBar] 关闭失败:', err);
    }
  }
</script>

<div class="titlebar">
  <div class="titlebar-left">
    <span class="app-title">123看图</span>
  </div>
  
  <div class="titlebar-right">
    <button class="titlebar-button minimize" on:click={minimize} title="最小化">
      <svg width="10" height="1" viewBox="0 0 10 1">
        <rect width="10" height="1" fill="currentColor"/>
      </svg>
    </button>
    
    <button class="titlebar-button maximize" on:click={toggleMaximize} title={isMaximized ? "还原" : "最大化"}>
      {#if isMaximized}
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0,2 L8,2 L8,10 L0,10 Z M2,0 L10,0 L10,8 L8,8 L8,2 L2,2 Z" fill="currentColor"/>
        </svg>
      {:else}
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      {/if}
    </button>
    
    <button class="titlebar-button close" on:click={close} title="关闭">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M1,1 L9,9 M9,1 L1,9" stroke="currentColor" stroke-width="1.2"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: transparent;
    -webkit-app-region: drag;
    z-index: 1000;
    user-select: none;
  }
  
  .titlebar-left {
    display: flex;
    align-items: center;
    padding-left: 12px;
  }
  
  .app-title {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }
  
  .titlebar-right {
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }
  
  .titlebar-button {
    width: 46px;
    height: 32px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s ease;
  }
  
  .titlebar-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .titlebar-button.close:hover {
    background: #e81123;
    color: white;
  }
  
  .titlebar-button svg {
    pointer-events: none;
  }
</style>