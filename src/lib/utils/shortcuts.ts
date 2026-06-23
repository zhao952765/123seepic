import { viewerActions, viewerState, toggleImmersiveMode } from '../stores/viewer';
import { get } from 'svelte/store';

/**
 * 键盘快捷键映射
 */
export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

/** 外部可注入的打开文件回调 */
let openFileDialogCallback: (() => void) | null = null;

export function setOpenFileDialogHandler(cb: () => void) {
  openFileDialogCallback = cb;
}

/**
 * 常用快捷键配置
 */
export const shortcuts: ShortcutConfig[] = [
  // 文件操作
  { key: 'o', ctrl: true, action: () => openFileDialog(), description: '打开文件' },

  // 缩放
  { key: '=', ctrl: true, action: () => zoomIn(), description: '放大' },
  { key: '-', ctrl: true, action: () => zoomOut(), description: '缩小' },
  { key: '0', ctrl: true, action: () => resetZoomToFit(), description: '适应窗口' },
  
  // 旋转
  { key: 'r', ctrl: true, action: () => rotateRight(), description: '向右旋转' },
  { key: 'l', ctrl: true, action: () => rotateLeft(), description: '向左旋转' },
  
  // 翻转
  { key: 'h', ctrl: true, action: () => flipHorizontal(), description: '水平翻转' },
  { key: 'v', ctrl: true, action: () => flipVertical(), description: '垂直翻转' },
  
  // 适应模式
  { key: 'f', ctrl: true, action: () => setFitMode('fit'), description: '适应窗口' },
  { key: '1', ctrl: true, action: () => setFitMode('actual'), description: '1:1 实际尺寸' },
  
  // 全屏 / 沉浸模式
  { key: 'F11', action: () => toggleImmersiveMode(), description: '沉浸模式' },
  { key: 'f', ctrl: true, shift: true, action: () => toggleImmersiveMode(), description: '沉浸模式' },
  { key: 'Escape', action: () => exitFullscreen(), description: '退出全屏' },
  
  // PDF 导航
  { key: 'ArrowLeft', action: () => prevPage(), description: '上一页' },
  { key: 'ArrowRight', action: () => nextPage(), description: '下一页' },
  { key: 'Home', action: () => firstPage(), description: '首页' },
  { key: 'End', action: () => lastPage(), description: '尾页' },
  
  // UI 切换
  { key: 't', ctrl: true, action: () => toggleToolbar(), description: '显示/隐藏工具栏' },
  { key: 'i', ctrl: true, action: () => toggleInfoPanel(), description: '显示/隐藏信息面板' },
  { key: 's', ctrl: true, action: () => toggleSidebar(), description: '显示/隐藏侧边栏' },
];

// 文件操作
function openFileDialog() {
  if (openFileDialogCallback) {
    openFileDialogCallback();
  }
}

// 快捷操作函数
function zoomIn() {
  const state = get(viewerState);
  let newZoom = state.zoom * 1.05;
  if (Math.abs(newZoom - 1) < 0.03 && state.zoom !== 1) newZoom = 1;
  viewerActions.setZoomAndFitMode(newZoom, 'custom');
}

function zoomOut() {
  const state = get(viewerState);
  let newZoom = state.zoom / 1.05;
  if (Math.abs(newZoom - 1) < 0.03 && state.zoom !== 1) newZoom = 1;
  viewerActions.setZoomAndFitMode(newZoom, 'custom');
}

function resetZoomToFit() {
  viewerActions.setFitMode('fit');
}

function resetZoom() {
  viewerActions.setZoomAndFitMode(1, 'actual');
}

function rotateRight() {
  viewerActions.rotate(90);
}

function rotateLeft() {
  viewerActions.rotate(-90);
}

function flipHorizontal() {
  viewerActions.toggleFlipH();
}

function flipVertical() {
  viewerActions.toggleFlipV();
}

function setFitMode(mode: 'fit' | 'fill' | 'actual' | 'width' | 'custom') {
  viewerActions.setFitMode(mode);
}

function toggleFullscreen() {
  viewerActions.toggleFullscreen();
}

function exitFullscreen() {
  const state = get(viewerState);
  if (state.isFullscreen) {
    viewerActions.toggleFullscreen();
  }
}

function prevPage() {
  const state = get(viewerState);
  if (state.pdfPage > 1) {
    viewerActions.goToPage(state.pdfPage - 1);
  }
}

function nextPage() {
  const state = get(viewerState);
  if (state.pdfPage < state.pdfTotalPages) {
    viewerActions.goToPage(state.pdfPage + 1);
  }
}

function firstPage() {
  viewerActions.goToPage(1);
}

function lastPage() {
  const state = get(viewerState);
  viewerActions.goToPage(state.pdfTotalPages);
}

function toggleToolbar() {
  viewerState.update(s => ({ ...s, showToolbar: !s.showToolbar }));
}

function toggleInfoPanel() {
  viewerActions.toggleInfoPanel();
}

function toggleSidebar() {
  viewerActions.toggleThumbnails();
}

/**
 * 检查按键组合是否匹配快捷键（精确匹配：修饰符数量必须一致）
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutConfig): boolean {
  // 必须的修饰符检查
  if (shortcut.ctrl && !event.ctrlKey) return false;
  if (shortcut.shift && !event.shiftKey) return false;
  if (shortcut.alt && !event.altKey) return false;

  // 精确匹配：额外的修饰符存在时不匹配（避免 Ctrl+Shift+I 匹配到 ctrl+i）
  if (!shortcut.ctrl && event.ctrlKey) return false;
  if (!shortcut.shift && event.shiftKey) return false;
  if (!shortcut.alt && event.altKey) return false;

  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

/**
 * 注册全局键盘事件监听器
 */
export function registerKeyboardShortcuts() {
  const handler = (event: KeyboardEvent) => {
    // 如果焦点在输入框中，不处理快捷键
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    // 白名单：DevTools 快捷键始终放行，不拦截
    if ((event.ctrlKey && event.shiftKey && event.key === 'I') ||
        (event.ctrlKey && event.shiftKey && event.key === 'J') ||
        (event.ctrlKey && event.shiftKey && event.key === 'C') ||
        event.key === 'F12') {
      return; // 让 Electron 处理
    }

    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        shortcut.action();
        break;
      }
    }
  };
  
  window.addEventListener('keydown', handler);
  
  // 返回清理函数
  return () => {
    window.removeEventListener('keydown', handler);
  };
}