# 123看图

## 项目简介

本项目为 Windows 下的图片查看与打包工具（Electron/桌面应用），包含前端展示页面、打包产物与若干脚本。

## 目录结构（简要）

- `main.js` — 应用主入口（Electron 主进程）
- `viewer.html`, `viewer-optimized.html` — 图片查看页面
- `src/` — 源代码（如 `src/extension.ts`）
- `dist-out/`, `dist-release/` — 打包产物
- `package.json`, `tsconfig.json` — 构建与脚本配置

## 快速使用

1. 安装依赖：参见 `package.json` 中的脚本（如 `npm install`）。
2. 本地开发/编译：`npm run compile`（或使用工作区任务 `npm: compile`）。
3. 打包产物位于 `dist-out/` 或 `dist-release/`。

## 主要功能

详见 `功能说明.md`。

## 接口与入口

详见 `接口文档.md`，包含主进程入口、前端资源与主要脚本说明。

## 上传到 GitHub

本仓库已在本地初始化并提交（如 Git 可用），请在确认后将仓库推送到你的 GitHub 远程：

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 许可证

见仓库根部 `LICENSE` 文件。
# 123看图 (123 Image Viewer)

极简无广告的图片与 PDF 查看器，专注查看，体验极致纯净。

## 特性

- 🖼️ 支持常见图片格式 (PNG, JPG, JPEG, GIF, BMP, WebP, SVG, ICO, TIFF)
- 📄 支持 PDF 文件查看
- 🎨 简洁现代的深色主题 UI
- ⚡ 快速加载，轻量级
- 🔍 缩放、旋转、镜像等基本操作
- 📋 缩略图侧边栏（可开关）
- 🖱️ 右键菜单快速打开
- ⚙️ 可配置的查看器设置

## 安装

1. 从 VS Code 扩展市场搜索 "123看图" 安装
2. 或手动安装 `.vsix` 包

## 使用

- 在资源管理器中右键点击图片或 PDF 文件，选择「打开 123看图」
- 或使用命令面板 (`Ctrl+Shift+P`) 输入「打开 123看图」
- 支持拖放文件到查看器窗口

## 配置

在 VS Code 设置中搜索 "123看图"，可配置：

- 主题（自动/深色/浅色）
- 缩放步进百分比
- 是否启用缩略图侧边栏

## 开发

```bash
git clone https://github.com/your-username/123-image-viewer.git
cd 123-image-viewer
npm install
npm run compile
```

按 F5 启动调试扩展。

## 打包

### 打包 VS Code 扩展 (.vsix)

```bash
# 编译扩展
npm run compile

# 打包成 .vsix 文件
npm run package
```

生成的 `.vsix` 文件可以在 VS Code 中通过「扩展」视图的「...」菜单选择「从 VSIX 安装」来安装。

### 打包独立 Windows 应用程序 (.exe)

如需将「123看图」打包成独立的 Windows 可执行文件 (.exe)，有以下几种方案：

#### 方案一：使用 Electron（推荐）
1. 将当前扩展重构为 Electron 应用
2. 安装 Electron：`npm install electron --save-dev`
3. 创建主进程文件 `main.js` 和渲染进程
4. 使用 `electron-builder` 或 `electron-packager` 打包
5. 支持跨平台（Windows、macOS、Linux）

#### 方案二：使用 .NET WPF（原生Windows体验）
1. 参考已有的 PureViewer 项目（WPF .NET 8 图片/PDF查看器）
2. 使用 Visual Studio 创建 WPF 项目
3. 集成图片处理库（如 Magick.NET、PdfiumSharp）
4. 发布为独立 .exe：`dotnet publish -c Release -r win-x64`

#### 方案三：使用 Tauri（轻量级）
1. 将 Web 技术栈打包成轻量级桌面应用
2. 安装 Tauri CLI：`npm install @tauri-apps/cli`
3. 配置 `tauri.conf.json`
4. 构建：`npm run tauri build`

## 图标

扩展图标使用了简洁的 SVG 设计，包含山峰剪影和数字 "123"，体现「看图」的核心功能。

- 彩色版：`icon-color.svg`
- 单色版：`icon-mono.svg`（适用于深色主题）

## 许可证

MIT