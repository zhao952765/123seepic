import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import Store from 'electron-store';
import {
  readFileInfo,
  listDirectoryFiles,
  generateThumbnail,
  getImageDimensions,
  openInExplorer
} from './handlers/file.js';
import { setAsWallpaper } from './handlers/wallpaper.js';
import { copyImageToClipboard } from './handlers/clipboard.js';
import { extractTile } from './handlers/tile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = !app.isPackaged;
const iconPath = join(__dirname, '../123.ico');

// 缓存 Tray 图标，避免每次创建窗口时重复读取文件
const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

// electron-store 持久化
const store = new Store({
  defaults: {
    theme: 'dark',
    zoomStep: 0.2,
    fitMode: 'fit',
    showToolbar: true,
    showStatusBar: true,
    recentDirectories: [],
    windowBounds: null,
    windowMaximized: false,
  }
});

let mainWindow = null;
let tray = null;
let splashWindow = null;

// 单实例锁定
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();

      // 尝试从命令行参数中提取文件路径
      const filePath = commandLine.find(arg => {
        try {
          return isAbsolute(arg) && existsSync(arg);
        } catch {
          return false;
        }
      });
      if (filePath) {
        mainWindow.webContents.send('file-open-request', filePath);
      }
    }
  });

  app.whenReady().then(() => {
    createSplashWindow();
    createWindow();
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  splashWindow.loadFile(join(__dirname, 'splash.html'));
  splashWindow.center();
}

function createWindow() {
  // 恢复上次窗口大小和位置
  const savedBounds = store.get('windowBounds');
  const savedMaximized = store.get('windowMaximized');

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 1200,
    height: savedBounds?.height || 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 400,
    minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (savedMaximized) {
    mainWindow.maximize();
  }

  // 加载前端页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // 销毁闪屏
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();

    // 处理启动时传入的文件路径
    const startupFile = getStartupFilePath();
    if (startupFile) {
      mainWindow.webContents.send('file-open-request', startupFile);
    }
  });

  mainWindow.on('close', () => {
    // 在窗口关闭前保存状态（closed 事件中 mainWindow 已被销毁，不能访问）
    if (mainWindow && !mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }
    store.set('windowMaximized', mainWindow?.isMaximized() || false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupTray();
  registerIpcHandlers();
}

function setupTray() {
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('123看图');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function registerIpcHandlers() {
  // 文件信息
  ipcMain.handle('read-file-info', async (_, filePath) => {
    try {
      return await readFileInfo(filePath);
    } catch (error) {
      console.error('[IPC] read-file-info error:', error);
      throw error;
    }
  });

  // 目录列表
  ipcMain.handle('list-directory-files', async (_, dirPath) => {
    try {
      return await listDirectoryFiles(dirPath);
    } catch (error) {
      console.error('[IPC] list-directory-files error:', error);
      throw error;
    }
  });

  // 缩略图
  ipcMain.handle('generate-thumbnail', async (_, filePath, maxSize) => {
    try {
      return await generateThumbnail(filePath, maxSize);
    } catch (error) {
      console.error('[IPC] generate-thumbnail error:', error);
      throw error;
    }
  });

  // 图片尺寸
  ipcMain.handle('get-image-dimensions', async (_, filePath) => {
    try {
      return await getImageDimensions(filePath);
    } catch (error) {
      console.error('[IPC] get-image-dimensions error:', error);
      throw error;
    }
  });

  // 瓦片提取
  ipcMain.handle('extract-tile', async (_, filePath, tileX, tileY, tileSize, outputWidth = 256, outputHeight = 256) => {
    try {
      const buffer = await extractTile(filePath, tileX, tileY, tileSize, outputWidth, outputHeight);
      return buffer;
    } catch (error) {
      console.error('[IPC] extract-tile error:', error);
      throw error;
    }
  });

  // 设置壁纸
  ipcMain.handle('set-as-wallpaper', async (_, filePath, mode) => {
    try {
      return await setAsWallpaper(filePath, mode);
    } catch (error) {
      console.error('[IPC] set-as-wallpaper error:', error);
      throw error;
    }
  });

  // 复制到剪贴板
  ipcMain.handle('copy-image-to-clipboard', async (_, filePath) => {
    try {
      return await copyImageToClipboard(filePath);
    } catch (error) {
      console.error('[IPC] copy-image-to-clipboard error:', error);
      throw error;
    }
  });

  // 在资源管理器中打开
  ipcMain.handle('open-in-explorer', async (_, filePath) => {
    try {
      return await openInExplorer(filePath);
    } catch (error) {
      console.error('[IPC] open-in-explorer error:', error);
      throw error;
    }
  });

  // 打开文件选择对话框
  ipcMain.handle('open-file-dialog', async (_, options = {}) => {
    try {
      if (!mainWindow) return { canceled: true, filePaths: [] };
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '图片/PDF 文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'gif', 'ico', 'svg', 'pdf'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        ...options
      });
      return result;
    } catch (error) {
      console.error('[IPC] open-file-dialog error:', error);
      throw error;
    }
  });

  // 读取文件原始 Buffer
  ipcMain.handle('read-file-buffer', async (_, filePath) => {
    try {
      const buffer = await readFile(filePath);
      return buffer;
    } catch (error) {
      console.error('[IPC] read-file-buffer error:', error);
      throw error;
    }
  });

  // 窗口控制
  ipcMain.handle('window-minimize', () => {
    try { mainWindow?.minimize(); } catch (error) { console.error('[IPC] window-minimize error:', error); }
  });
  ipcMain.handle('window-maximize', () => {
    try { mainWindow?.maximize(); } catch (error) { console.error('[IPC] window-maximize error:', error); }
  });
  ipcMain.handle('window-unmaximize', () => {
    try { mainWindow?.unmaximize(); } catch (error) { console.error('[IPC] window-unmaximize error:', error); }
  });
  ipcMain.handle('window-close', () => {
    try { mainWindow?.close(); } catch (error) { console.error('[IPC] window-close error:', error); }
  });
  ipcMain.handle('window-is-maximized', () => {
    try { return mainWindow ? mainWindow.isMaximized() : false; } catch (error) { console.error('[IPC] window-is-maximized error:', error); return false; }
  });

  // 窗口最大化状态变化时通知前端
  if (mainWindow) {
    mainWindow.on('maximize', () => {
      mainWindow?.webContents.send('window-maximized-change', true);
    });
    mainWindow.on('unmaximize', () => {
      mainWindow?.webContents.send('window-maximized-change', false);
    });
  }

  // 设置持久化
  ipcMain.handle('get-settings', () => {
    try {
      return store.store;
    } catch (error) {
      console.error('[IPC] get-settings error:', error);
      return {};
    }
  });
  ipcMain.handle('save-settings', (_, partial) => {
    try {
      for (const [key, value] of Object.entries(partial)) {
        store.set(key, value);
      }
    } catch (error) {
      console.error('[IPC] save-settings error:', error);
    }
  });
}

function getStartupFilePath() {
  const args = process.argv.slice(1);
  return args.find(arg => {
    try {
      return isAbsolute(arg) && existsSync(arg);
    } catch {
      return false;
    }
  });
}

// 窗口关闭
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 激活
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

// 退出前销毁 Tray 和闪屏
app.on('before-quit', () => {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
});