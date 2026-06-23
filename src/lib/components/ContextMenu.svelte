<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  
  export let visible = false;
  export let x = 0;
  export let y = 0;
  
  const dispatch = createEventDispatcher();
  const MENU_WIDTH = 260;
  
  let adjustedX = 0;
  let adjustedY = 0;
  let menuEl: HTMLElement | null = null;
  
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
  
  async function recalcPosition() {
    await tick();
    adjustedX = x;
    adjustedY = y;
    
    if (adjustedX + MENU_WIDTH > window.innerWidth) {
      adjustedX = window.innerWidth - MENU_WIDTH - 10;
    }
    
    if (menuEl) {
      const menuHeight = menuEl.offsetHeight;
      if (adjustedY + menuHeight > window.innerHeight) {
        adjustedY = window.innerHeight - menuHeight - 10;
      }
    }
    
    adjustedX = Math.max(0, adjustedX);
    adjustedY = Math.max(0, adjustedY);
  }
  
  onMount(() => {
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
  
  $: if (typeof document !== 'undefined') {
    if (visible) {
      recalcPosition();
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }
</script>

{#if visible}
  <div 
    class="context-menu" 
    bind:this={menuEl}
    style="left: {adjustedX}px; top: {adjustedY}px;"
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
      <span class="menu-shortcut">Ctrl+R</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('rotateLeft')} role="menuitem">
      <span class="menu-icon">↺</span>
      <span class="menu-label">逆时针旋转</span>
      <span class="menu-shortcut">Ctrl+L</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('flipH')} role="menuitem">
      <span class="menu-icon">↔</span>
      <span class="menu-label">水平翻转</span>
      <span class="menu-shortcut">Ctrl+H</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('flipV')} role="menuitem">
      <span class="menu-icon">↕</span>
      <span class="menu-label">垂直翻转</span>
      <span class="menu-shortcut">Ctrl+V</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('fitWindow')} role="menuitem">
      <span class="menu-icon">⊡</span>
      <span class="menu-label">适应窗口</span>
      <span class="menu-shortcut">Ctrl+0</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('actualSize')} role="menuitem">
      <span class="menu-icon">1:1</span>
      <span class="menu-label">实际尺寸</span>
      <span class="menu-shortcut">Ctrl+1</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('copy')} role="menuitem">
      <span class="menu-icon">📋</span>
      <span class="menu-label">复制</span>
      <span class="menu-shortcut">Ctrl+C</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('openInExplorer')} role="menuitem">
      <span class="menu-icon">📁</span>
      <span class="menu-label">在资源管理器中打开</span>
    </div>
    
    <div class="menu-item" on:click={() => handleAction('setWallpaper')} role="menuitem">
      <span class="menu-icon">🖼️</span>
      <span class="menu-label">设为壁纸</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <!-- 设置 -->
    <div class="menu-item" on:click={() => handleAction('settings')} role="menuitem">
      <span class="menu-icon">⚙️</span>
      <span class="menu-label">设置</span>
    </div>
    
    <div class="menu-separator"></div>
    
    <div class="menu-item" on:click={() => handleAction('showInfo')} role="menuitem">
      <span class="menu-icon">ℹ️</span>
      <span class="menu-label">属性</span>
      <span class="menu-shortcut">Ctrl+I</span>
    </div>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    min-width: 240px;
    max-height: calc(100vh - 20px);
    overflow-y: auto;
    background: rgba(30, 30, 30, 0.95);
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
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .menu-item {
    display: flex;
    align-items: center;
    padding: 7px 12px;
    margin: 1px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.1s ease;
    font-size: 13px;
    position: relative;
  }
  
  .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .menu-icon {
    width: 22px;
    margin-right: 10px;
    text-align: center;
    font-size: 13px;
    opacity: 0.9;
    flex-shrink: 0;
  }
  
  .menu-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .menu-shortcut {
    color: rgba(255, 255, 255, 0.45);
    font-size: 11px;
    margin-left: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  .menu-arrow {
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    margin-left: 8px;
    flex-shrink: 0;
  }
  
  .menu-separator {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 4px 12px;
  }
  
  .context-menu::-webkit-scrollbar {
    width: 4px;
  }
  
  .context-menu::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
</style>