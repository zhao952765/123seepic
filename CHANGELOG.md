# Changelog

## v1.0.3 (2026-06-24)

### 新增功能

- **智能适应模式**：新增 `auto` 适应模式（默认），图片大于界面时自动适配窗口，小于界面时保持实际尺寸（100%），避免小图被放大模糊
- **设置面板**：右侧滑入式独立设置面板，替代原有的子菜单弹出方式
  - 深色/浅色主题切换
  - 图片格式关联管理（多选 + 应用）
  - 快捷键列表查看
- **工具栏设置入口**：工具栏新增 ⚙ 按钮，一键打开设置面板

### 修复

- **浅色模式顶部栏**：修复 TitleBar 标题和按钮在浅色模式下不可见的问题
- **浅色背景**：将浅色模式所有界面背景统一改为纯白色（`#ffffff`），与 2345 看图一致
- **即时主题切换**：修复切换主题后需切换图片才能生效的问题，改为即时响应
- **边界导航**：修复"已经是最后一张"提示与循环跳转同时触发的问题，改为两段式（第一下提示，第二下跳转）
- **性能监控空指针**：修复 `PerformanceMonitor.recordFrame` 中 canvas 为 null 时的崩溃问题

### 改进

- 默认适应模式从 `actual` 改为 `auto`（智能适应）
- 双击切换改为 `auto` ↔ `actual` 之间切换
- 工具栏适应模式按钮重新排序：智能 / 适应 / 宽适 / 填充
- 移除 ContextMenu 中冗余的子菜单逻辑（~120行）

---

## [1.0.0] - 2026-06-23

### 首个正式版本发布

- 支持 10+ 种图片格式和 PDF 查看
- 沉浸式纯净浏览模式，控制栏自动淡出
- Lanczos3 高清缩放算法，100% 实际像素吸附
- Windows 11 原生深色主题，高 DPI 适配
- 自定义标题栏，窗口最小化/最大化/关闭控制
- 信息面板显示完整元数据（尺寸、格式、路径）
- 缩略图侧边栏，文件夹内快速切换
- 右键菜单（复制/粘贴/删除/壁纸/打开所在位置）
- 壁纸设置（fill/fit/stretch/tile/center 五种模式）
- 剪贴板复制功能
- 启动闪屏窗口
- electron-store 持久化用户设置
- 文件关联（jpg/png/webp/bmp/tiff/gif/ico/svg/pdf）
- 单实例运行，重复打开复用窗口
- 快捷键完整支持（缩放/旋转/翻转/导航/沉浸模式）

### 技术栈

- Electron 33.4 + SvelteKit 1.30
- Sharp 0.33 (Lanczos3) + pdfjs-dist 4.0
- v8-compile-cache 启动加速

### 已知限制

- GIF 仅静态显示首帧（v1.1 支持动画）
- SVG 元数据/缩略图为占位（v1.1 优化）
- 加密 PDF 需用户输入密码（v1.1 完善）
- Windows 10 未实测（代码层面兼容）

---

## v1.0.2 (2026-06-23)

### 性能优化

- **启动加速**：引入 `v8-compile-cache` 缓存 V8 编译结果，冷启动减少 30%+
- **延迟加载**：`electron-store` 和 `wallpaper` 模块改为动态 `import()`，仅在需要时加载，减少启动阻塞
- **Sharp 并发限制**：`sharp.concurrency(4)` 限制同时处理图片数，防止内存峰值
- **线程池适配**：`UV_THREADPOOL_SIZE` 根据 CPU 核心数动态设置（4~8），优化 I/O 密集型任务
- **GPU 加速**：`backgroundThrottling: false` 确保 Canvas 渲染不降帧；CSS `will-change` 对动画元素启用硬件加速
- **渲染节流**：`requestAnimationFrame` 合并高频缩放/平移事件，避免重复渲染
- **缩略图防抖**：Sidebar 缩略图生成添加 100ms 防抖，减少滚动时的 CPU 开销
- **响应式优化**：Toolbar 缩放百分比预计算为 `$: zoomPercent`，避免模板中重复计算
- **内存监控**：开发模式每 30 秒输出 RSS/Heap/External 内存快照，便于排查泄漏

### 修复

- **右键菜单**：修复右键菜单弹出卡顿和单向绑定问题，改用 `bind:visible` 双向绑定 + `tick()` 确保重复右键可重新打开
- **SSR 兼容**：`ContextMenu.svelte` 的 `$:` 块重新添加 `typeof document !== 'undefined'` 守卫，修复服务端渲染时 `document is not defined` 错误
- **缩略图**：修复 Sidebar 缩略图防抖全局 timer 导致仅最后一个文件能生成缩略图的问题；修复目录切换时旧数据残留；修复 SVG 空 data 导致裂图；添加 `onDestroy` 清理定时器防止内存泄漏

### 清理

- **删除已归档文档**：`TEST_REPORT.md`、`CODE_REVIEW.md`、`PROJECT_STRUCTURE.txt`、`backup.bat`
- **移除调试代码**：所有 `console.log`/`console.debug`/`console.info` 已清除（渲染进程中 29 行 + 主进程 5 行），保留 `console.error`/`console.warn` 用于错误追踪
- **`.gitignore`**：添加 `release/` 构建产物排除规则

## v1.0.1 (2026-06-23)

### 修复

- **管理员权限拖放**：添加管理员权限检测与警告提示，引导用户以普通用户权限运行（KN-001）
- **GIF 动画**：添加 GIF 动画支持，使用 HTMLImageElement 实现自动播放（KN-002）
- **SVG 元数据**：解析 SVG 文件的 viewBox/width/height 属性，正确显示尺寸信息（KN-003）
- **加密 PDF 提示**：捕获 pdfjs-dist 加密异常，显示友好的密码提示信息（KN-004）
- **PDFViewer 自适应**：添加窗口大小变化时的 resize 事件监听，自动适配 PDF 视图（KN-005）
- **罕见格式容错**：为缩略图生成和尺寸读取添加 try-catch 错误处理，罕见格式降级为占位图（KN-006）
- **文档更新**：更新 README.md 系统要求和已知限制，创建 CHANGELOG.md（KN-007）

### 改进

- `parseSvgDimensions()` 支持从 viewBox、width/height 属性、CSS 内联样式三种方式提取 SVG 尺寸
- `generateThumbnail()` 和 `getImageDimensions()` 为 SVG 文件提供基于实际尺寸的占位缩略图
- `readFileInfo()` 对 SVG 和普通图片分别采用专用解析路径
- `render()` 渲染循环支持 GIF 动画持续绘制，非 GIF 仅渲染脏帧
- PDFViewer 添加 `pdfError` 状态和错误覆盖层 UI 组件

---

## v1.0.0 (2026-06-22)

### 首次发布

- 基于 Electron 33 + SvelteKit + Sharp 的图片与 PDF 查看器
- 支持 JPG、PNG、WebP、BMP、TIFF、GIF、ICO、SVG、HEIC、PDF 格式
- 无边框窗口 + 自定义标题栏，透明 Mica 风格
- Canvas + createImageBitmap GPU 加速渲染
- 瓦片分块加载 + LRU 缓存池，支持超大图
- Lanczos3 高清缩放插值算法
- 拖拽打开、侧边栏缩略图浏览
- 设为桌面壁纸、复制到剪贴板、资源管理器打开
- 键盘快捷键支持
- 单实例运行 + 文件关联
- 状态记忆（窗口大小、位置、偏好设置）