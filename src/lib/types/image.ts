// 图片文件信息类型
export interface ImageInfo {
  path: string;
  name: string;
  size: number;
  modified?: string;
  width?: number;
  height?: number;
  format: string;
  colorSpace?: string;
  bitDepth?: number;
}

// PDF 文档信息
export interface PdfInfo {
  path: string;
  name: string;
  size: number;
  pageCount: number;
  currentPage: number;
}

// 查看器状态
export type ViewerMode = 'image' | 'pdf';

export interface ViewerState {
  mode: ViewerMode;
  currentFile: string | null;
  imageInfo: ImageInfo | null;
  pdfInfo: PdfInfo | null;
  
  // 图片查看器状态
  zoom: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  fitMode: 'fit' | 'fill' | 'actual' | 'width' | 'custom';
  
  // PDF 查看器状态
  pdfPage: number;
  pdfTotalPages: number;
  pdfZoom: number;
  showThumbnails: boolean;
  pdfScrollMode: 'continuous' | 'single';
  
  // UI 状态
  showToolbar: boolean;
  showStatusBar: boolean;
  showInfoPanel: boolean;
  isFullscreen: boolean;
}

// 目录条目
export interface DirectoryEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

// 缩略图数据
export interface ThumbnailData {
  data: string; // base64
  width: number;
  height: number;
}
