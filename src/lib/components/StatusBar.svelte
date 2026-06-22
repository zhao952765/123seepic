<script lang="ts">
  import { viewerState } from '../stores/viewer';
  import { formatFileSize } from '../utils/imageProcessor';
</script>

<div class="status-bar">
  <div class="status-left">
    {#if $viewerState.imageInfo}
      <span>{$viewerState.imageInfo.width} × {$viewerState.imageInfo.height}</span>
      <span class="separator">|</span>
      <span>{formatFileSize($viewerState.imageInfo.size)}</span>
      <span class="separator">|</span>
      <span>{$viewerState.imageInfo.format}</span>
    {/if}
    
    {#if $viewerState.pdfInfo}
      <span>第 {$viewerState.pdfPage} / {$viewerState.pdfTotalPages} 页</span>
    {/if}
  </div>
  
  <div class="status-right">
    <span>缩放: {Math.round($viewerState.zoom * 100)}%</span>
    {#if $viewerState.rotation !== 0}
      <span class="separator">|</span>
      <span>旋转: {$viewerState.rotation}°</span>
    {/if}
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    background: #2d2d2d;
    border-top: 1px solid #3d3d3d;
    color: #ccc;
    font-size: 12px;
    user-select: none;
  }

  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .separator {
    color: #555;
  }
</style>
