# 123看图

> 极致轻量、高性能的图片与 PDF 查看器，基于 **Electron 33 + SvelteKit + Sharp** 构建。

<p align="center">
  <img src="123.ico" width="96" alt="123看图图标" />
</p>

---

## 技术栈

| 层级 | 技术 | 版本 |
| :--- | :--- | :--- |
| 前端框架 | SvelteKit + TypeScript | 1.30 / 4.2 |
| 桌面壳 | Electron | 33.4 |
| 图片处理 | Sharp（libvips） | 0.33 |
| PDF 渲染 | pdfjs-dist（Web Worker） | 4.10 |
| 瓦片缩放 | Lanczos3 插值 | — |
| 打包工具 | electron-builder | 25.1 |
| 系统壁纸 | wallpaper | 7.x |
| 持久化存储 | electron-store | 8.2 |

---

## 功能特性

- **极速渲染**：基于 Canvas + `createImageBitmap` 的 GPU 加速图片渲染
- **超大图支持**：瓦片分块加载 + LRU 缓存池，轻松应对亿级像素图片
- **高清缩放**：Lanczos3 插值算法，放大 300% 边缘依然锐利
- **多格式支持**：JPG、PNG、WebP、BMP、TIFF、GIF、ICO、SVG、HEIC、PDF
- **无边框窗口**：自定义标题栏，支持最小化 / 最大化 / 关闭，透明 Mica 风格
- **拖拽打开**：拖入图片或文件夹即可浏览
- **侧边栏浏览**：显示目录内所有图片缩略图，一键切换
- **实用工具**：设为桌面壁纸（填充/适应/拉伸/平铺/居中）、复制到剪贴板、在资源管理器中打开
- **键盘快捷键**：缩放、翻页、全屏等常用操作
- **单实例运行**：多次打开文件时聚焦到同一窗口，避免重复启动
- **文件关联**：安装后可直接双击图片 / PDF 文件打开
- **状态记忆**：自动保存窗口大小、位置、主题等偏好设置

---

## 项目结构

```
123看图/
├── electron/                    # Electron 主进程
│   ├── main.js                  # 入口：窗口管理、托盘、IPC 注册、单实例锁
│   ├── preload.js               # 安全桥接：contextBridge 暴露 window.electronAPI
│   ├── splash.html              # 启动闪屏
│   └── handlers/                # 后端处理器
│       ├── file.js              # 文件信息、目录列表、缩略图生成、尺寸读取
│       ├── tile.js              # 瓦片裁剪与 Lanczos3 高质量缩放
│       ├── wallpaper.js         # 设置桌面壁纸
│       └── clipboard.js         # 复制图片到系统剪贴板
├── src/                         # SvelteKit 前端
│   ├── app.html                 # HTML 模板
│   ├── app.css                  # 全局样式
│   ├── lib/
│   │   ├── components/          # UI 组件
│   │   │   ├── ImageViewer.svelte   # 图片查看器（Canvas 渲染）
│   │   │   ├── PDFViewer.svelte     # PDF 查看器（pdfjs-dist）
│   │   │   ├── Sidebar.svelte       # 侧边栏（缩略图列表）
│   │   │   ├── TitleBar.svelte      # 自定义标题栏
│   │   │   ├── Toolbar.svelte       # 工具栏
│   │   │   ├── StatusBar.svelte     # 状态栏
│   │   │   ├── InfoPanel.svelte     # 图片信息面板
│   │   │   └── ContextMenu.svelte   # 右键菜单
│   │   ├── stores/              # Svelte 状态管理
│   │   │   ├── viewer.ts            # 视图状态（缩放、位置、当前文件）
│   │   │   └── settings.ts          # 用户设置
│   │   ├── utils/               # 工具函数
│   │   │   ├── imageProcessor.ts    # 图片加载与瓦片请求
│   │   │   ├── tileEngine.ts        # 瓦片引擎（视口计算、缓存管理）
│   │   │   ├── shortcuts.ts         # 键盘快捷键绑定
│   │   │   └── settings.ts          # 设置读写
│   │   └── types/               # TypeScript 类型定义
│   │       ├── electron.d.ts        # Electron API 类型声明
│   │       └── image.ts             # 图片相关类型
│   └── routes/
│       └── +page.svelte         # 主页面入口
├── electron-builder.yml         # Electron 打包与文件关联配置
├── svelte.config.js             # SvelteKit 配置（adapter-static → dist/）
├── vite.config.ts               # Vite 构建配置
├── tsconfig.json                # TypeScript 配置
└── package.json
```

---

## 快速开始

### 前置要求

- **Node.js** ≥ 18（推荐 20.x）
- **Windows 10/11**（当前主要针对 Windows 打包）
- **npm** ≥ 9

### 安装依赖

```bash
npm install
```

> 如果 Electron 下载过慢，可设置国内镜像：
> ```bash
> $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
> npm install
> ```

### 开发模式

```bash
# 启动 Vite 开发服务器 + Electron（热重载）
npm run dev:electron
```

### 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Vite 开发服务器（仅前端） |
| `npm run build` | 构建前端到 `dist/` 目录 |
| `npm run preview` | 本地预览前端生产构建 |
| `npm run check` | TypeScript 类型检查 |
| `npm run dev:electron` | 并行启动 Vite + Electron 开发模式 |
| `npm run build:electron` | 构建前端 + 打包 Electron 安装程序 |

---

## 打包发布

```bash
npm run build:electron
```

打包产物位于 `release/` 目录：

| 文件 | 说明 |
| :--- | :--- |
| `123看图-x.x.x-Setup.exe` | NSIS 安装程序（支持自定义安装路径） |
| `123看图-x.x.x.msi` | MSI 安装包 |

打包前请确认：

1. 项目根目录存在 `123.ico` 图标文件
2. `electron-builder.yml` 中 `asarUnpack` 已配置 `sharp` 和 `wallpaper` 原生模块
3. 文件关联扩展名已在 `electron-builder.yml` 中配置

---

## 核心 IPC 接口

前端通过 `window.electronAPI` 安全调用主进程能力：

```typescript
// 拖拽文件路径获取（Electron 33+）
window.electronAPI.getFilePath(file: File): string

// 文件与目录
window.electronAPI.readFileInfo(path: string): Promise<ImageInfo>
window.electronAPI.listDirectory(dirPath: string): Promise<FileEntry[]>
window.electronAPI.openFileDialog(options?: object): Promise<DialogResult>
window.electronAPI.openInExplorer(path: string): Promise<void>

// 图片处理
window.electronAPI.readFileBuffer(path: string): Promise<ArrayBuffer>
window.electronAPI.getImageDimensions(path: string): Promise<{width: number, height: number}>
window.electronAPI.generateThumbnail(path: string, maxSize?: number): Promise<ThumbnailResult>
window.electronAPI.extractTile(
  path: string, tileX: number, tileY: number, tileSize: number,
  outputWidth?: number, outputHeight?: number
): Promise<ArrayBuffer>

// 系统功能
window.electronAPI.setAsWallpaper(path: string, mode: string): Promise<void>
window.electronAPI.copyImageToClipboard(path: string): Promise<void>

// 窗口控制
window.electronAPI.minimize(): Promise<void>
window.electronAPI.maximize(): Promise<void>
window.electronAPI.unmaximize(): Promise<void>
window.electronAPI.close(): Promise<void>
window.electronAPI.isMaximized(): Promise<boolean>
window.electronAPI.onMaximizedChange(callback: (maximized: boolean) => void): () => void

// 文件打开事件
window.electronAPI.onFileOpenRequest(callback: (filePath: string) => void): () => void
```

---

## 架构要点

### 瓦片引擎（Tile Engine）

- 超大图片按 256×256 瓦片分块加载，视口外的瓦片自动卸载
- 后端使用 Sharp **Lanczos3** 插值缩放，JPEG 质量 92，保证放大时边缘锐利
- 输出尺寸上限 `MAX_OUTPUT = 4096`，防止异常请求导致内存溢出
- 前端 LRU 缓存池，避免重复请求同一瓦片

### 缩略图生成

- 同样使用 Lanczos3 插值，JPEG 质量 85
- SVG 文件跳过 Sharp 处理，返回占位缩略图
- 缩略图 base64 编码直接返回，侧边栏即时渲染

### 安全策略

- 渲染进程启用 `contextIsolation: true`，禁用 `nodeIntegration`
- 所有主进程能力通过 `contextBridge` 白名单暴露
- 沙箱模式 `sandbox: false`（Sharp 等原生模块需要）

### 单实例锁

- 使用 `app.requestSingleInstanceLock()` 确保仅运行一个实例
- 二次启动时聚焦已有窗口，并传递文件路径参数

---

## 支持格式

| 格式 | 扩展名 | 说明 |
| :--- | :--- | :--- |
| JPEG | `.jpg` `.jpeg` | 全功能支持 |
| PNG | `.png` | 全功能支持 |
| WebP | `.webp` | 全功能支持 |
| BMP | `.bmp` | 全功能支持 |
| TIFF | `.tiff` `.tif` | 全功能支持 |
| GIF | `.gif` | 全功能支持 |
| ICO | `.ico` | 全功能支持 |
| SVG | `.svg` | 查看支持（Sharp 不处理元数据） |
| HEIC | `.heic` `.heif` | 全功能支持 |
| PDF | `.pdf` | pdfjs-dist 渲染 |

---

## 许可证

MIT License

---

<p align="center">
  <sub>Built with Electron + SvelteKit + Sharp</sub>
</p>