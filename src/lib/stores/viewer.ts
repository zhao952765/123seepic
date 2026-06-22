import { writable } from 'svelte/store';
import type { ViewerState, ImageInfo, PdfInfo } from '../types/image';

// 初始状态
const initialState: ViewerState = {
  mode: 'image',
  currentFile: null,
  imageInfo: null,
  pdfInfo: null,
  
  // 图片查看器状态
  zoom: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  fitMode: 'fit',
  
  // PDF 查看器状态
  pdfPage: 1,
  pdfTotalPages: 0,
  pdfZoom: 1,
  showThumbnails: false,
  pdfScrollMode: 'continuous',
  
  // UI 状态
  showToolbar: true,
  showStatusBar: true,
  showInfoPanel: false,
  isFullscreen: false,
};

// 创建查看器状态 store
export const viewerState = writable<ViewerState>(initialState);

// 便捷方法
export const viewerActions = {
  // 重置状态
  reset: () => {
    viewerState.set(initialState);
  },
  
  // 设置当前文件
  setCurrentFile: (path: string) => {
    viewerState.update(state => ({
      ...state,
      currentFile: path,
    }));
  },
  
  // 设置图片信息
  setImageInfo: (info: ImageInfo | null) => {
    viewerState.update(state => ({
      ...state,
      imageInfo: info,
      mode: 'image',
    }));
  },
  
  // 设置 PDF 信息
  setPdfInfo: (info: PdfInfo | null) => {
    viewerState.update(state => ({
      ...state,
      pdfInfo: info,
      mode: 'pdf',
    }));
  },
  
  // 缩放
  setZoom: (zoom: number) => {
    viewerState.update(state => ({
      ...state,
      zoom: Math.max(0.1, Math.min(10, zoom)), // 限制在 10% - 1000%
    }));
  },
  
  // 旋转
  rotate: (degrees: number) => {
    viewerState.update(state => ({
      ...state,
      rotation: (state.rotation + degrees) % 360,
    }));
  },
  
  // 水平翻转
  toggleFlipH: () => {
    viewerState.update(state => ({
      ...state,
      flipH: !state.flipH,
    }));
  },
  
  // 垂直翻转
  toggleFlipV: () => {
    viewerState.update(state => ({
      ...state,
      flipV: !state.flipV,
    }));
  },
  
  // 适应模式
  setFitMode: (mode: 'fit' | 'fill' | 'actual' | 'width') => {
    viewerState.update(state => ({
      ...state,
      fitMode: mode,
    }));
  },
  
  // PDF 页面跳转
  goToPage: (page: number) => {
    viewerState.update(state => ({
      ...state,
      pdfPage: page,
    }));
  },
  
  // 切换缩略图
  toggleThumbnails: () => {
    viewerState.update(state => ({
      ...state,
      showThumbnails: !state.showThumbnails,
    }));
  },
  
  // 切换全屏
  toggleFullscreen: () => {
    viewerState.update(state => ({
      ...state,
      isFullscreen: !state.isFullscreen,
    }));
  },
  
  // 切换信息面板
  toggleInfoPanel: () => {
    viewerState.update(state => ({
      ...state,
      showInfoPanel: !state.showInfoPanel,
    }));
  },
};
