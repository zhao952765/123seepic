<script lang="ts">
  import { onDestroy } from 'svelte';
  import { viewerState, viewerActions, exitImmersiveMode } from '$lib/stores/viewer';

  // 控制栏可见性
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  // 鼠标进入底部区域 → 显示控制栏
  export function show() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    visible = true;
  }

  // 鼠标离开底部区域 → 1.5 秒后淡出
  export function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible = false;
    }, 1500);
  }

  // 鼠标进入控制栏本身 → 保持显示
  function onBarEnter() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  // 鼠标离开控制栏 → 开始倒计时
  function onBarLeave() {
    scheduleHide();
  }

  onDestroy(() => {
    if (hideTimer) clearTimeout(hideTimer);
  });

  // 控制动作
  function handlePrev() {
    window.dispatchEvent(new CustomEvent('nav-prev'));
  }

  function handleNext() {
    window.dispatchEvent(new CustomEvent('nav-next'));
  }

  function handleZoomIn() {
    const state = $viewerState;
    viewerActions.setZoomAndFitMode(state.zoom * 1.1, 'custom');
  }

  function handleZoomOut() {
    const state = $viewerState;
    viewerActions.setZoomAndFitMode(state.zoom / 1.1, 'custom');
  }

  function handleExit() {
    exitImmersiveMode();
  }

  // 当前文件名
  $: fileName = $viewerState.imageInfo?.name || $viewerState.pdfInfo?.name || '';

  // 缩放比例显示（精确到1位小数，整数时不显示小数）
  $: zoomPercent = (() => {
    const pct = $viewerState.zoom * 100;
    return pct >= 100 ? Math.round(pct) + '%' : pct.toFixed(1) + '%';
  })();
</script>

<div
  class="immersive-controls"
  class:visible
  on:mouseenter={onBarEnter}
  on:mouseleave={onBarLeave}
>
  <div class="controls-left">
    <button class="ctrl-btn" on:click={handlePrev} title="上一张 (←)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
    <button class="ctrl-btn" on:click={handleNext} title="下一张 (→)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  </div>

  <div class="controls-center">
    <button class="ctrl-btn" on:click={handleZoomOut} title="缩小 (-)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
    <span class="zoom-label">{zoomPercent}</span>
    <button class="ctrl-btn" on:click={handleZoomIn} title="放大 (+)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  </div>

  <div class="controls-right">
    <span class="file-name">{fileName}</span>
    <button class="ctrl-btn exit-btn" on:click={handleExit} title="退出沉浸模式 (ESC)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</div>

<style>
  .immersive-controls {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    opacity: 0;
    transform: translateY(100%);
    transition: opacity 0.3s ease, transform 0.3s ease;
    z-index: 10000;
    pointer-events: auto;
  }

  .immersive-controls.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .controls-left,
  .controls-center,
  .controls-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .controls-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .ctrl-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .exit-btn:hover {
    background: rgba(255, 80, 80, 0.4);
  }

  .zoom-label {
    color: #ccc;
    font-size: 13px;
    min-width: 44px;
    text-align: center;
    user-select: none;
  }

  .file-name {
    color: #aaa;
    font-size: 12px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
  }

  .controls-right {
    gap: 12px;
  }
</style>