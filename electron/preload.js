import { contextBridge, ipcRenderer, webUtils } from 'electron';

/**
 * 通过 contextBridge 将 Electron API 安全暴露给前端渲染进程
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取拖拽文件的真实路径（Electron 33+ 中 File.path 已移除）
  getFilePath: (file) => webUtils.getPathForFile(file),

  // 文件信息
  readFileInfo: (filePath) => ipcRenderer.invoke('read-file-info', filePath),

  // 目录列表
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory-files', dirPath),

  // 缩略图
  generateThumbnail: (filePath, maxSize) => ipcRenderer.invoke('generate-thumbnail', filePath, maxSize),

  // 图片尺寸
  getImageDimensions: (filePath) => ipcRenderer.invoke('get-image-dimensions', filePath),

  // 文件原始 Buffer（替代 file:// fetch）
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),

  // 瓦片提取（返回 Uint8Array）
  extractTile: (filePath, tileX, tileY, tileSize, outputWidth, outputHeight) =>
    ipcRenderer.invoke('extract-tile', filePath, tileX, tileY, tileSize, outputWidth, outputHeight),

  // 设置为壁纸
  setAsWallpaper: (filePath, mode) => ipcRenderer.invoke('set-as-wallpaper', filePath, mode),

  // 复制图片到剪贴板
  copyImageToClipboard: (filePath) => ipcRenderer.invoke('copy-image-to-clipboard', filePath),

  // 在资源管理器中打开
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),

  // 打开文件选择对话框
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  // 窗口控制
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

  // 监听外部文件打开请求（命令行 / 单实例二次启动）
  onFileOpenRequest: (callback) => {
    const listener = (event, filePath) => callback(filePath);
    ipcRenderer.on('file-open-request', listener);
    return () => ipcRenderer.removeListener('file-open-request', listener);
  },

  // 设置持久化
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial)
});
