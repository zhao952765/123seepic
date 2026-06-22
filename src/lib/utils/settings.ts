/**
 * 应用设置持久化（基于 electron-store）
 * 替代 localStorage，支持主题、窗口状态、最近目录等设置的持久化
 */

interface AppSettings {
  theme: 'dark' | 'light';
  zoomStep: number;
  fitMode: 'fit' | 'fill' | 'actual' | 'width';
  showToolbar: boolean;
  showStatusBar: boolean;
  recentDirectories: string[];
  maxRecentDirectories: number;
  // 窗口状态
  windowBounds: { width: number; height: number; x?: number; y?: number } | null;
  windowMaximized: boolean;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  zoomStep: 0.2,
  fitMode: 'fit',
  showToolbar: true,
  showStatusBar: true,
  recentDirectories: [],
  maxRecentDirectories: 10,
  windowBounds: null,
  windowMaximized: false,
};

/**
 * 获取设置值
 */
export async function getSettings(): Promise<AppSettings> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // 通过 IPC 从 electron-store 读取
      const settings = await window.electronAPI.getSettings();
      return { ...defaultSettings, ...settings };
    }
    // 降级到 localStorage
    return loadFromLocalStorage();
  } catch {
    return loadFromLocalStorage();
  }
}

/**
 * 保存设置
 */
export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.saveSettings(partial);
    } else {
      saveToLocalStorage(partial);
    }
  } catch {
    saveToLocalStorage(partial);
  }
}

/**
 * 添加最近目录
 */
export async function addRecentDirectory(dir: string): Promise<void> {
  const settings = await getSettings();
  const dirs = settings.recentDirectories.filter(d => d !== dir);
  dirs.unshift(dir);
  if (dirs.length > settings.maxRecentDirectories) {
    dirs.pop();
  }
  await saveSettings({ recentDirectories: dirs });
}

// ---- localStorage 降级方案 ----

const STORAGE_KEY = '123-viewer-settings';

function loadFromLocalStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return { ...defaultSettings };
}

function saveToLocalStorage(partial: Partial<AppSettings>): void {
  try {
    const current = loadFromLocalStorage();
    const merged = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch { /* ignore */ }
}