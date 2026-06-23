<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { theme } from '$lib/stores/theme';
  import { shortcuts } from '$lib/utils/shortcuts';
  import { fade, fly } from 'svelte/transition';

  export let visible = false;
  const dispatch = createEventDispatcher();

  const IMAGE_FORMATS = [
    { ext: 'jpg', name: 'JPEG', checked: true },
    { ext: 'jpeg', name: 'JPEG', checked: true },
    { ext: 'png', name: 'PNG', checked: true },
    { ext: 'gif', name: 'GIF', checked: true },
    { ext: 'bmp', name: 'BMP', checked: true },
    { ext: 'webp', name: 'WebP', checked: true },
    { ext: 'tiff', name: 'TIFF', checked: true },
    { ext: 'tif', name: 'TIFF', checked: true },
    { ext: 'ico', name: 'ICO', checked: true },
    { ext: 'svg', name: 'SVG', checked: true },
    { ext: 'pdf', name: 'PDF', checked: true },
    { ext: 'avif', name: 'AVIF', checked: false },
    { ext: 'heic', name: 'HEIC', checked: false },
    { ext: 'heif', name: 'HEIF', checked: false },
    { ext: 'jxl', name: 'JPEG XL', checked: false },
    { ext: 'psd', name: 'PSD', checked: false },
    { ext: 'raw', name: 'RAW', checked: false },
  ];

  function formatShortcutKey(s: typeof shortcuts[0]): string {
    let parts: string[] = [];
    if (s.ctrl) parts.push('Ctrl');
    if (s.shift) parts.push('Shift');
    if (s.alt) parts.push('Alt');
    const keyMap: Record<string, string> = {
      'arrowleft': '←', 'arrowright': '→',
      'arrowup': '↑', 'arrowdown': '↓',
      'escape': 'Esc', ' ': 'Space',
      '=': '+', 'f11': 'F11',
      'home': 'Home', 'end': 'End',
    };
    const k = s.key.toLowerCase();
    parts.push(keyMap[k] || s.key.toUpperCase());
    return parts.join('+');
  }

  function toggleFormat(ext: string) {
    const fmt = IMAGE_FORMATS.find(f => f.ext === ext);
    if (fmt) fmt.checked = !fmt.checked;
  }

  function applyFileAssociations() {
    const checkedExts = IMAGE_FORMATS.filter(f => f.checked).map(f => f.ext);
    dispatch('updateFileAssociations', { formats: checkedExts });
  }

  function close() {
    visible = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible}
  <div class="settings-overlay" on:click={close} on:keydown={handleKeydown} role="dialog" aria-modal="true" transition:fade={{ duration: 200 }}>
    <div class="settings-panel" on:click|stopPropagation transition:fly={{ x: 320, duration: 300 }}>
      <div class="settings-header">
        <h2>设置</h2>
        <button class="settings-close" on:click={close}>✕</button>
      </div>

      <div class="settings-body">
        <section class="settings-section">
          <h3 class="section-title">外观</h3>
          <div class="setting-row">
            <span class="setting-label">主题模式</span>
            <div class="theme-toggle">
              <button
                class="theme-btn"
                class:active={$theme === 'dark'}
                on:click={() => theme.set('dark')}
              >🌙 深色</button>
              <button
                class="theme-btn"
                class:active={$theme === 'light'}
                on:click={() => theme.set('light')}
              >☀️ 浅色</button>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="section-title">关联图片格式</h3>
          <p class="section-desc">选择要用 123看图 打开的图片格式</p>
          <div class="format-grid">
            {#each IMAGE_FORMATS.filter(f => f.ext === f.name.toLowerCase() || ['jpg', 'jpeg', 'tiff', 'tif'].includes(f.ext)) as fmt}
              {#if fmt.ext === fmt.name.toLowerCase() || fmt.ext === 'jpg' || fmt.ext === 'tiff'}
                <label class="format-item">
                  <input
                    type="checkbox"
                    checked={fmt.checked}
                    on:change={() => toggleFormat(fmt.ext)}
                  />
                  <span class="format-ext">.{fmt.ext}</span>
                  <span class="format-name">{fmt.name}</span>
                </label>
              {/if}
            {/each}
          </div>
          <div class="format-grid">
            {#each IMAGE_FORMATS.filter(f => !['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'ico', 'svg', 'pdf'].includes(f.ext)) as fmt}
              <label class="format-item">
                <input
                  type="checkbox"
                  checked={fmt.checked}
                  on:change={() => toggleFormat(fmt.ext)}
                />
                <span class="format-ext">.{fmt.ext}</span>
                <span class="format-name">{fmt.name}</span>
              </label>
            {/each}
          </div>
          <button class="apply-btn" on:click={applyFileAssociations}>
            ✔ 应用关联
          </button>
        </section>

        <section class="settings-section">
          <h3 class="section-title">快捷键</h3>
          <div class="shortcuts-list">
            {#each shortcuts as s}
              <div class="shortcut-row">
                <span class="shortcut-desc">{s.description}</span>
                <span class="shortcut-key">{formatShortcutKey(s)}</span>
              </div>
            {/each}
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
    display: flex;
    justify-content: flex-end;
  }

  .settings-panel {
    width: 360px;
    height: 100%;
    background: #1e1e1e;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .settings-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #fff;
  }

  .settings-close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    font-size: 18px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .settings-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .settings-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .settings-section {
    margin-bottom: 28px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-desc {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin: 0 0 12px 0;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
  }

  .setting-label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
  }

  .theme-toggle {
    display: flex;
    gap: 6px;
  }

  .theme-btn {
    padding: 6px 14px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .theme-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .theme-btn.active {
    background: #0078d4;
    border-color: #0078d4;
    color: #fff;
  }

  .format-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 8px;
  }

  .format-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .format-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .format-item input[type="checkbox"] {
    accent-color: #0078d4;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .format-ext {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    font-weight: 500;
    min-width: 42px;
  }

  .format-name {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .apply-btn {
    width: 100%;
    padding: 10px;
    background: #0078d4;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.15s;
    margin-top: 4px;
  }

  .apply-btn:hover {
    background: #1a8ad4;
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .shortcut-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .shortcut-desc {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
  }

  .shortcut-key {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: monospace;
  }
</style>