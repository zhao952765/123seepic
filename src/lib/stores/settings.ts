import { writable } from 'svelte/store';

export interface AppSettings {
  theme: 'auto' | 'dark' | 'light';
  zoomStep: number; // 缩放步进（默认 0.1 = 10%）
  defaultFitMode: 'fit' | 'fill' | 'actual' | 'width';
  openLastFile: boolean; // 启动时打开上次文件
  showThumbnailsByDefault: boolean;
  imageQuality: number; // 图片加载质量（1-100）
  cacheSize: number; // 缓存大小（MB）
}

const defaultSettings: AppSettings = {
  theme: 'auto',
  zoomStep: 0.1,
  defaultFitMode: 'fit',
  openLastFile: false,
  showThumbnailsByDefault: false,
  imageQuality: 90,
  cacheSize: 500,
};

// 从 localStorage 加载设置
const loadSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem('viewer-settings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
  return defaultSettings;
};

// 保存设置到 localStorage
const saveSettings = (settings: AppSettings) => {
  try {
    localStorage.setItem('viewer-settings', JSON.stringify(settings));
  } catch (e) {
    console.error('保存设置失败:', e);
  }
};

export const settings = writable<AppSettings>(loadSettings());

// 监听变化并自动保存
settings.subscribe(value => {
  saveSettings(value);
});

// 便捷方法
export const settingsActions = {
  setTheme: (theme: 'auto' | 'dark' | 'light') => {
    settings.update(s => ({ ...s, theme }));
  },
  
  setZoomStep: (step: number) => {
    settings.update(s => ({ ...s, zoomStep: Math.max(0.05, Math.min(0.5, step)) }));
  },
  
  setDefaultFitMode: (mode: 'fit' | 'fill' | 'actual' | 'width') => {
    settings.update(s => ({ ...s, defaultFitMode: mode }));
  },
  
  reset: () => {
    settings.set(defaultSettings);
  },
};
