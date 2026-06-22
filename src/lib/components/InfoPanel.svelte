<script lang="ts">
  import { viewerState } from '../stores/viewer';
  import { formatFileSize } from '../utils/imageProcessor';
</script>

{#if $viewerState.showInfoPanel && $viewerState.imageInfo}
  <div class="info-panel">
    <div class="info-header">
      <h3>文件信息</h3>
      <button class="close-btn" on:click={() => viewerState.update(s => ({...s, showInfoPanel: false}))}>×</button>
    </div>
    
    <div class="info-content">
      <div class="info-item">
        <span class="label">文件名:</span>
        <span class="value">{$viewerState.imageInfo.name}</span>
      </div>
      
      <div class="info-item">
        <span class="label">路径:</span>
        <span class="value path">{$viewerState.imageInfo.path}</span>
      </div>
      
      <div class="info-item">
        <span class="label">尺寸:</span>
        <span class="value">{$viewerState.imageInfo.width} × {$viewerState.imageInfo.height}</span>
      </div>
      
      <div class="info-item">
        <span class="label">大小:</span>
        <span class="value">{formatFileSize($viewerState.imageInfo.size)}</span>
      </div>
      
      <div class="info-item">
        <span class="label">格式:</span>
        <span class="value">{$viewerState.imageInfo.format}</span>
      </div>
      
      {#if $viewerState.imageInfo.colorSpace}
        <div class="info-item">
          <span class="label">色彩空间:</span>
          <span class="value">{$viewerState.imageInfo.colorSpace}</span>
        </div>
      {/if}
      
      {#if $viewerState.imageInfo.bitDepth}
        <div class="info-item">
          <span class="label">位深度:</span>
          <span class="value">{$viewerState.imageInfo.bitDepth} bit</span>
        </div>
      {/if}
      
      {#if $viewerState.imageInfo.modified}
        <div class="info-item">
          <span class="label">修改时间:</span>
          <span class="value">{$viewerState.imageInfo.modified}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .info-panel {
    position: absolute;
    right: 20px;
    top: 80px;
    width: 320px;
    background: #2d2d2d;
    border: 1px solid #3d3d3d;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #3d3d3d;
  }

  .info-header h3 {
    margin: 0;
    color: #fff;
    font-size: 16px;
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

  .info-content {
    padding: 16px;
  }

  .info-item {
    display: flex;
    margin-bottom: 12px;
    font-size: 13px;
  }

  .info-item:last-child {
    margin-bottom: 0;
  }

  .label {
    color: #999;
    min-width: 80px;
    flex-shrink: 0;
  }

  .value {
    color: #fff;
    word-break: break-all;
  }

  .value.path {
    font-size: 11px;
    color: #0078d4;
  }
</style>
