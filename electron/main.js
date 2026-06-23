import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell, protocol } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
const { existsSync, readFileSync } = require('fs');
import {
  readFileInfo,
  listDirectoryFiles,
  generateThumbnail,
  getImageDimensions
} from './handlers/file.js';
import { copyImageToClipboard } from './handlers/clipboard.js';
import { extractTile } from './handlers/tile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = !app.isPackaged;

// KN-001: 检测管理员权限，记录警告（Windows UIPI 会阻止拖放）
function isRunningAsAdmin() {
  try {
    const result = execSync('net session', { timeout: 3000, stdio: 'pipe' });
    return result !== null;
  } catch {
    return false;
  }
}
const isAdmin = isRunningAsAdmin();
if (isAdmin) {
  console.warn('[警告] 应用以管理员权限运行。Windows UIPI 将阻止从资源管理器拖放文件。');
  console.warn('[提示] 请以普通用户权限运行，或安装后自动以 asInvoker 权限启动。');
}
const iconPath = join(__dirname, '../123.ico');

// 缓存 Tray 图标，避免每次创建窗口时重复读取文件
const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

// 锐化线程池：根据 CPU 核心数动态设置，不超过 8
const os = await import('os');
const cpuCount = os.cpus().length;
process.env.UV_THREADPOOL_SIZE = Math.min(Math.max(4, Math.floor(cpuCount / 2)), 8);

// electron-store 持久化（延迟加载）
const Store = (await import('electron-store')).default;
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

  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);

  app.whenReady().then(() => {
    protocol.handle('app', async (request) => {
      // 移除 app:// 协议前缀，处理可能的双斜杠或三斜杠
      let pathname = request.url.replace(/^app:\/\/\/?/, '');
      // 移除查询参数和哈希
      pathname = pathname.split('?')[0].split('#')[0];
      // 如果 pathname 为空或只是 "/"，使用 index.html
      if (!pathname || pathname === '/') {
        pathname = 'index.html';
      }
      const filePath = join(__dirname, '../dist', pathname);
      console.log('[app://] 请求:', request.url, '→', pathname, '→', filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.map': 'application/json',
      };
      const ext = (filePath.match(/\.[^.]+$/)?.[0] || '.html').toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      let buffer;
      try {
        buffer = readFileSync(filePath);
      } catch (err) {
        // SPA 回退：文件不存在时返回 index.html，让 SvelteKit 路由处理
        console.log('[app://] 文件不存在，回退到 index.html:', pathname);
        try {
          buffer = readFileSync(join(__dirname, '../dist', 'index.html'));
        } catch (err2) {
          console.error('[app://] index.html 读取失败:', err2.message);
          return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        }
        return new Response(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        },
      });
    });
    createSplashWindow();
    createWindow();

    // 兜底超时：如果 8 秒后闪屏仍在，强制关闭并显示主窗口
    setTimeout(() => {
      if (splashWindow) {
        console.warn('[mainWindow] 超时关闭闪屏（8秒后仍未 ready-to-show）');
        splashWindow.close();
        splashWindow = null;
        if (mainWindow && !mainWindow.isVisible()) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    }, 8000);
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
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,    // 显式开启 CSP，禁止加载远程脚本（大图加载改用 IPC Buffer）
      devTools: true,       // 允许打开 DevTools（F12 / Ctrl+Shift+I）
      sandbox: false,
      backgroundThrottling: false,  // 禁用后台节流，确保 Canvas 渲染不降帧
    }
  });

  // 在调用 maximize() 前注册最大化/还原事件监听，避免事件丢失
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-change', false);
  });

  if (savedMaximized) {
    mainWindow.maximize();
  }

  // 加载失败时的兜底处理
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[mainWindow] 页面加载失败:', errorDescription, validatedURL);
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // 加载前端页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    console.log('[mainWindow] 通过 app:// 协议加载页面');
    mainWindow.loadURL('app:///index.html');
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[mainWindow] ready-to-show 触发');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
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
  setupApplicationMenu();
}

/**
 * 注册应用菜单（含 DevTools 切换）
 */
function setupApplicationMenu() {
  const template = [
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        {
          label: '切换开发者工具',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '文件',
      submenu: [
        { role: 'close', label: '关闭窗口' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
      console.error('read-file-info error:', error);
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

  // 设置壁纸（延迟加载 wallpaper 模块，仅在用户使用时加载）
  ipcMain.handle('set-as-wallpaper', async (_, filePath, mode) => {
    try {
      const { setAsWallpaper } = await import('./handlers/wallpaper.js');
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

  // 在资源管理器中打开（高亮文件）
  ipcMain.handle('open-in-explorer', async (_, filePath) => {
    if (!filePath) {
      console.warn('[IPC] open-in-explorer: 路径为空');
      return { success: false, error: '路径为空' };
    }
    if (!existsSync(filePath)) {
      console.warn(`[IPC] open-in-explorer: 文件不存在 ${filePath}`);
      return { success: false, error: '文件不存在' };
    }
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] open-in-explorer 失败:', error);
      return { success: false, error: String(error) };
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
      return await readFile(filePath);
    } catch (error) {
      console.error('read-file-buffer error:', error);
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
    try {
      if (mainWindow) {
        mainWindow.close();
      } else {
        console.warn('[IPC] window-close: mainWindow 为 null');
      }
    } catch (error) {
      console.error('[IPC] window-close error:', error);
    }
  });
  ipcMain.handle('window-is-maximized', () => {
    try { return mainWindow ? mainWindow.isMaximized() : false; } catch (error) { console.error('[IPC] window-is-maximized error:', error); return false; }
  });

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

// 开发模式内存监控（每 30 秒输出一次）
if (isDev) {
  setInterval(() => {
    const usage = process.memoryUsage();
    console.warn(`[内存] RSS: ${(usage.rss / 1024 / 1024).toFixed(1)}MB, Heap: ${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(usage.heapTotal / 1024 / 1024).toFixed(1)}MB, External: ${(usage.external / 1024 / 1024).toFixed(1)}MB`);
  }, 30000);
}