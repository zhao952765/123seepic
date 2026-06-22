<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  
  export let visible = false;
  export let x = 0;
  export let y = 0;
  
  const dispatch = createEventDispatcher();
  
  function handleAction(action: string) {
    dispatch('action', action);
    visible = false;
  }
  
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.context-menu')) {
      visible = false;
    }
  }
  
  // 仅在客户端绑定 document 事件，避免 SSR 中访问 document 报错
  onMount(() => {
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  $: if (typeof document !== 'undefined') {
    if (visible) {
      // 确保菜单不超出屏幕
      const menuWidth = 240;
      const menuHeight = 400;
      
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
      }
      
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }
</script>

{#if visible}
  <div 
    class="context-menu" 
    style="left: {x}px; top: {y}px;"
    on:click|stopPropagation
    role="menu"
  >
    <div class="menu-item" on:click={() => handleAction('zoomIn')} role="menuitem">
      <span class="menu-icon">🔍+</span>
      <span class="menu-label">放大</span>
      <span class="menu-shortcut">Ctrl +</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('zoomOut')} role="menuitem">
      <span class="menu-icon">🔍-</span>
      <span class="menu-label">缩小</span>
      <span class="menu-shortcut">Ctrl -</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('rotateRight')} role="menuitem">
      <span class="menu-icon">↻</span>
      <span class="menu-label">顺时针旋转</span>
      <span class="menu-shortcut">Ctrl + R</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('rotateLeft')} role="menuitem">
      <span class="menu-icon">↺</span>
      <span class="menu-label">逆时针旋转</span>
      <span class="menu-shortcut">Ctrl + L</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('flipH')} role="menuitem">
      <span class="menu-icon">↔</span>
      <span class="menu-label">水平翻转</span>
      <span class="menu-shortcut">Ctrl + H</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('flipV')} role="menuitem">
      <span class="menu-icon">↕</span>
      <span class="menu-label">垂直翻转</span>
      <span class="menu-shortcut">Ctrl + V</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('fitWindow')} role="menuitem">
      <span class="menu-icon">⊡</span>
      <span class="menu-label">适应窗口</span>
      <span class="menu-shortcut">Ctrl + 0</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('actualSize')} role="menuitem">
      <span class="menu-icon">1:1</span>
      <span class="menu-label">实际尺寸</span>
      <span class="menu-shortcut">Ctrl + 1</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('copy')} role="menuitem">
      <span class="menu-icon">📋</span>
      <span class="menu-label">复制</span>
      <span class="menu-shortcut">Ctrl + C</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('setWallpaper')} role="menuitem">
      <span class="menu-icon">🖼️</span>
      <span class="menu-label">设为壁纸</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('showInfo')} role="menuitem">
      <span class="menu-icon">ℹ️</span>
      <span class="menu-label">属性</span>
      <span class="menu-shortcut">Ctrl + I</span>
    </div>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    min-width: 240px;
    background: rgba(44, 44, 44, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    padding: 6px 0;
    z-index: 9999;
    animation: menuFadeIn 0.15s cubic-bezier(0.1, 0.9, 0.2, 1);
    color: #fff;
    font-family: "Segoe UI", sans-serif;
  }
  
  @keyframes menuFadeIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  
  .menu-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    margin: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.1s ease;
    font-size: 13px;
  }
  
  .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .menu-icon {
    width: 24px;
    margin-right: 12px;
    text-align: center;
    font-size: 14px;
    opacity: 0.9;
  }
  
  .menu-label {
    flex: 1;
    white-space: nowrap;
  }
  
  .menu-shortcut {
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    margin-left: 16px;
    white-space: nowrap;
  }
  
  .menu-separator {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 6px 12px;
  }
</style>
