const { contextBridge, ipcRenderer, webUtils } = require('electron');

// ===== 拖拽修复：在 preload 阶段绑定 dragover/drop 事件 =====
// 根因：Windows UIPI 阻止从普通权限进程向管理员权限窗口发送拖放消息。
// 此处绑定确保在渲染进程最早时机拦截拖拽事件，配合 asInvoker 清单避免提权。
(function setupDragEvents() {
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files) {
      window.__dragDropFiles = e.dataTransfer.files;
    }
  };

  window.addEventListener('dragover', handleDragOver, { capture: true });
  window.addEventListener('drop', handleDrop, { capture: true });
  document.addEventListener('dragover', handleDragOver, { capture: true });
  document.addEventListener('drop', handleDrop, { capture: true });
})();

const safeGetFilePath = (file) => {
  try {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      return webUtils.getPathForFile(file);
    }
  } catch (err) {
    // fallback below
  }
  return file?.path || null;
};

contextBridge.exposeInMainWorld('electronAPI', {
  getFilePath: safeGetFilePath,

  readFileInfo: (filePath) => ipcRenderer.invoke('read-file-info', filePath),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory-files', dirPath),
  generateThumbnail: (filePath, maxSize) => ipcRenderer.invoke('generate-thumbnail', filePath, maxSize),
  getImageDimensions: (filePath) => ipcRenderer.invoke('get-image-dimensions', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
  extractTile: (filePath, tileX, tileY, tileSize, outputWidth, outputHeight) =>
    ipcRenderer.invoke('extract-tile', filePath, tileX, tileY, tileSize, outputWidth, outputHeight),
  setAsWallpaper: (filePath, mode) => ipcRenderer.invoke('set-as-wallpaper', filePath, mode),
  copyImageToClipboard: (filePath) => ipcRenderer.invoke('copy-image-to-clipboard', filePath),
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  unmaximize: () => ipcRenderer.invoke('window-unmaximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    const listener = (event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-change', listener);
    return () => ipcRenderer.removeListener('window-maximized-change', listener);
  },

  startWindowDrag: (screenX, screenY) => ipcRenderer.send('window-drag-start', screenX, screenY),
  moveWindowDrag: (screenX, screenY) => ipcRenderer.send('window-drag-move', screenX, screenY),
  endWindowDrag: () => ipcRenderer.send('window-drag-end'),

  registerFileAssociations: (extensions) => ipcRenderer.invoke('register-file-associations', extensions),
  unregisterFileAssociations: (extensions) => ipcRenderer.invoke('unregister-file-associations', extensions),

  onFileOpenRequest: (callback) => {
    const listener = (event, filePath) => callback(filePath);
    ipcRenderer.on('file-open-request', listener);
    return () => ipcRenderer.removeListener('file-open-request', listener);
  },

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial)
});