import type { ImageInfo, ThumbnailData } from './image';

declare global {
  interface window {
    electronAPI: {
      getFilePath: (file: File) => string;
      readFileInfo: (path: string) => Promise<ImageInfo>;
      listDirectory: (dirPath: string) => Promise<Array<{ path: string; name: string; isDir: boolean; size: number }>>;
      generateThumbnail: (path: string, maxSize: number) => Promise<ThumbnailData>;
      getImageDimensions: (path: string) => Promise<{ width: number; height: number }>;
      readFileBuffer: (path: string) => Promise<ArrayBuffer>;
      extractTile: (path: string, tileX: number, tileY: number, tileSize: number, outputWidth?: number, outputHeight?: number) => Promise<ArrayBuffer>;
      setAsWallpaper: (path: string, mode: string) => Promise<void>;
      copyImageToClipboard: (path: string) => Promise<void>;
      openInExplorer: (path: string) => Promise<void>;
      openFileDialog: (options?: Electron.OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;

      // 窗口控制
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      unmaximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;

      // 文件打开事件
      onFileOpenRequest: (callback: (filePath: string) => void) => () => void;

      // 设置持久化
      getSettings: () => Promise<Record<string, unknown>>;
      saveSettings: (partial: Record<string, unknown>) => Promise<void>;
    };
  }
}

export {};