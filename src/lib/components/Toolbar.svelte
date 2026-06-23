<script lang="ts">
  import { viewerState, viewerActions } from '../stores/viewer';
  import { theme } from '../stores/theme';
  import { get } from 'svelte/store';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  $: zoomPercent = Math.round($viewerState.zoom * 100);
  $: isLight = $theme === 'light';

  function zoomIn() {
    const state = get(viewerState);
    viewerActions.setZoom(state.zoom + 0.2);
  }

  function zoomOut() {
    const state = get(viewerState);
    viewerActions.setZoom(state.zoom - 0.2);
  }

  function resetZoom() {
    viewerActions.setZoom(1);
  }

  function rotateLeft() {
    viewerActions.rotate(-90);
  }

  function rotateRight() {
    viewerActions.rotate(90);
  }

  function flipH() {
    viewerActions.toggleFlipH();
  }

  function flipV() {
    viewerActions.toggleFlipV();
  }

  function setFitMode(mode: 'fit' | 'fill' | 'actual' | 'width' | 'auto') {
    viewerActions.setFitMode(mode);
  }

  function toggleFullscreen() {
    viewerActions.toggleFullscreen();
  }

  function toggleInfoPanel() {
    viewerActions.toggleInfoPanel();
  }

  function openFile() {
    dispatch('openFile');
  }

  function openSettings() {
    dispatch('settings');
  }
</script>

<div class="toolbar" class:light={isLight}>
  <!-- 文件操作 -->
  <div class="toolbar-group">
    <button on:click={openFile} title="打开文件 (Ctrl+O)">📂</button>
  </div>

  <!-- 缩放控制 -->
  <div class="toolbar-group">
    <button on:click={zoomOut} title="缩小 (-)">−</button>
    <span class="zoom-level">{zoomPercent}%</span>
    <button on:click={zoomIn} title="放大 (+)">+</button>
    <button on:click={resetZoom} title="实际大小 (Ctrl+0)">1:1</button>
  </div>

  <!-- 适应模式 -->
  <div class="toolbar-group">
    <button 
      class:active={$viewerState.fitMode === 'auto'}
      on:click={() => setFitMode('auto')}
      title="智能适应"
    >
      智能
    </button>
    <button 
      class:active={$viewerState.fitMode === 'fit'}
      on:click={() => setFitMode('fit')}
      title="适应窗口 (Ctrl+F)"
    >
      适应
    </button>
    <button 
      class:active={$viewerState.fitMode === 'width'}
      on:click={() => setFitMode('width')}
      title="适应宽度"
    >
      宽适
    </button>
    <button 
      class:active={$viewerState.fitMode === 'fill'}
      on:click={() => setFitMode('fill')}
      title="填充窗口"
    >
      填充
    </button>
  </div>

  <!-- 旋转和翻转 -->
  <div class="toolbar-group">
    <button on:click={rotateLeft} title="向左旋转 (Ctrl+L)">↺</button>
    <button on:click={rotateRight} title="向右旋转 (Ctrl+R)">↻</button>
    <button on:click={flipH} title="水平翻转 (Ctrl+H)">⇄</button>
    <button on:click={flipV} title="垂直翻转 (Ctrl+V)">⇅</button>
  </div>

  <!-- 视图控制 -->
  <div class="toolbar-group">
    <button on:click={toggleInfoPanel} title="信息面板 (Ctrl+I)">ℹ</button>
    <button on:click={toggleFullscreen} title="全屏 (F11)">⛶</button>
    <button on:click={openSettings} title="设置">⚙</button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #3d3d3d;
    user-select: none;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .toolbar.light {
    background: #ffffff;
    border-bottom-color: #ddd;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 12px;
    border-right: 1px solid #3d3d3d;
  }

  .toolbar.light .toolbar-group {
    border-right-color: #ccc;
  }

  .toolbar-group:last-child {
    border-right: none;
  }

  button {
    padding: 8px 14px;
    min-width: 32px;
    min-height: 32px;
    background: #3d3d3d;
    color: #fff;
    border: 1px solid #4d4d4d;
    border-radius: 4px;
    cursor: pointer;
    font-size: 15px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar.light button {
    background: #fff;
    color: #333;
    border-color: #ccc;
  }

  button:hover {
    background: #4d4d4d;
    border-color: #5d5d5d;
  }

  .toolbar.light button:hover {
    background: #e8e8e8;
    border-color: #bbb;
  }

  button.active {
    background: #0078d4;
    border-color: #0078d4;
  }

  .toolbar.light button.active {
    background: #0078d4;
    border-color: #0078d4;
    color: #fff;
  }

  .zoom-level {
    min-width: 60px;
    text-align: center;
    color: #fff;
    font-size: 14px;
  }

  .toolbar.light .zoom-level {
    color: #333;
  }
</style>