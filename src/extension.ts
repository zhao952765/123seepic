import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('扩展「123看图」已激活');

    // 注册命令：打开查看器
    const openViewerCommand = vscode.commands.registerCommand('123-image-viewer.openViewer', async (uri?: vscode.Uri) => {
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (targetUri) {
            await openCustomEditor(targetUri);
        } else {
            vscode.window.showInformationMessage('请先打开一个图片或 PDF 文件。');
        }
    });

    // 注册自定义编辑器提供程序 - 统一使用同一个Provider
    const unifiedViewerProvider = vscode.window.registerCustomEditorProvider(
        '123-image-viewer.imageViewer',
        new UnifiedViewerProvider(context),
        {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(openViewerCommand, unifiedViewerProvider);
}

async function openCustomEditor(uri: vscode.Uri) {
    // 根据文件扩展名决定使用哪个查看器
    const ext = uri.path.toLowerCase().split('.').pop();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'];
    const pdfExts = ['pdf'];
    
    if (imageExts.includes(ext || '') || pdfExts.includes(ext || '')) {
        await vscode.commands.executeCommand('vscode.openWith', uri, '123-image-viewer.imageViewer');
    } else {
        vscode.window.showErrorMessage('不支持的文件格式。');
    }
}

class UnifiedViewerProvider implements vscode.CustomEditorProvider {
    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<vscode.CustomDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    constructor(private context: vscode.ExtensionContext) {}

    async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {
        // 设置 Webview 内容为统一的查看器（支持图片和PDF）
        webviewPanel.webview.options = { 
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getUnifiedHtml(document.uri, webviewPanel);
    }

    // 保存文档（只读查看器，不支持保存）
    async saveCustomDocument(document: vscode.CustomDocument, cancellation: vscode.CancellationToken): Promise<void> {
        return Promise.resolve();
    }

    // 另存为文档（只读查看器，不支持另存为）
    async saveCustomDocumentAs(document: vscode.CustomDocument, targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
        return Promise.resolve();
    }

    // 恢复文档（只读查看器，无需恢复）
    async revertCustomDocument(document: vscode.CustomDocument, cancellation: vscode.CancellationToken): Promise<void> {
        return Promise.resolve();
    }

    // 备份文档（只读查看器，返回空备份）
    async backupCustomDocument(document: vscode.CustomDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
        return {
            id: context.destination.toString(),
            delete: () => Promise.resolve()
        };
    }

    private getUnifiedHtml(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel): string {
        const src = webviewPanel.webview.asWebviewUri(uri);
        const fileName = uri.fsPath.split(/[\\/]/).pop();
        const ext = (uri.path.toLowerCase().split('.').pop() || '').toLowerCase();
        const isPdf = ext === 'pdf';
        
        return this.getBuiltInViewerHtml(src, fileName || 'Untitled', isPdf);
    }
    
    private getBuiltInViewerHtml(src: vscode.Uri, fileName: string, isPdf: boolean): string {
        const safeSrc = src.toString().replace(/'/g, "\\'");
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>123看图 - ${fileName}</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background: #1e1e2e;
                        color: #fff;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        overflow: hidden;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .toolbar {
                        padding: 8px;
                        background: #252535;
                        display: flex;
                        gap: 8px;
                        align-items: center;
                        flex-wrap: wrap;
                    }
                    
                    .viewer-container {
                        flex: 1;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        overflow: auto;
                        position: relative;
                        width: 100%;
                        height: 100%;
                    }
                    
                    button {
                        background: #00b0ff;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                    }
                    
                    button:hover {
                        background: #00f5ff;
                    }
                    
                    button:disabled {
                        background: #555;
                        color: #aaa;
                        cursor: not-allowed;
                    }
                    
                    #imageContainer {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    
                    #image {
                        max-width: 100%;
                        max-height: 100%;
                        object-fit: contain;
                        transition: transform 0.2s ease;
                    }
                    
                    #pdfCanvasContainer {
                        width: 100%;
                        height: 100%;
                        overflow: auto;
                        display: flex;
                        justify-content: center;
                        align-items: flex-start;
                        background: #2a2a3a;
                    }
                    
                    #pdfCanvas {
                        margin: 20px;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                    }
                    
                    .hidden {
                        display: none !important;
                    }
                    
                    .file-info {
                        margin-left: auto;
                        color: #aaa;
                        font-size: 14px;
                        max-width: 300px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    
                    #pdfNavigation {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    #pdfPageInfo {
                        color: #aaa;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <button id="zoomInBtn">放大</button>
                    <button id="zoomOutBtn">缩小</button>
                    <button id="rotateBtn">旋转</button>
                    <button id="resetBtn">重置</button>
                    <span class="file-info" id="fileInfo">${fileName}</span>
                    <div id="pdfNavigation" class="${isPdf ? '' : 'hidden'}">
                        <button id="prevPageBtn">上一页</button>
                        <span id="pdfPageInfo">页码: -/-</span>
                        <button id="nextPageBtn">下一页</button>
                    </div>
                </div>
                
                <div class="viewer-container" id="viewerContainer">
                    <div id="imageContainer" class="${isPdf ? 'hidden' : ''}">
                        <img id="image" src="${safeSrc}" />
                    </div>
                    <div id="pdfCanvasContainer" class="${isPdf ? '' : 'hidden'}">
                        <canvas id="pdfCanvas"></canvas>
                    </div>
                </div>

                <script>
                    // 初始化PDF.js
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    
                    // DOM元素
                    const zoomInBtn = document.getElementById('zoomInBtn');
                    const zoomOutBtn = document.getElementById('zoomOutBtn');
                    const rotateBtn = document.getElementById('rotateBtn');
                    const resetBtn = document.getElementById('resetBtn');
                    const imageContainer = document.getElementById('imageContainer');
                    const image = document.getElementById('image');
                    const pdfCanvasContainer = document.getElementById('pdfCanvasContainer');
                    const pdfCanvas = document.getElementById('pdfCanvas');
                    const prevPageBtn = document.getElementById('prevPageBtn');
                    const nextPageBtn = document.getElementById('nextPageBtn');
                    const pdfPageInfo = document.getElementById('pdfPageInfo');
                    
                    // 状态变量
                    let scale = 1.0;
                    let rotation = 0;
                    let pdfDoc = null;
                    let pdfPageNum = 1;
                    let pdfPageCount = 0;
                    let pdfScale = 1.0;
                    const isPdfMode = ${isPdf};
                    
                    // 初始化
                    function init() {
                        if (isPdfMode) {
                            loadPdf('${safeSrc}');
                        } else {
                            // 图片模式
                            image.onload = () => {
                                updateImageTransform();
                            };
                        }
                        
                        // 绑定事件
                        zoomInBtn.addEventListener('click', () => zoom(1.1));
                        zoomOutBtn.addEventListener('click', () => zoom(0.9));
                        rotateBtn.addEventListener('click', rotate);
                        resetBtn.addEventListener('click', reset);
                        
                        if (prevPageBtn) prevPageBtn.addEventListener('click', prevPage);
                        if (nextPageBtn) nextPageBtn.addEventListener('click', nextPage);
                        
                        // 滚轮缩放
                        document.getElementById('viewerContainer').addEventListener('wheel', (e) => {
                            if (e.ctrlKey) {
                                e.preventDefault();
                                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                                zoom(delta);
                            }
                        });
                    }
                    
                    // 图片操作
                    function zoom(factor) {
                        if (!isPdfMode) {
                            scale *= factor;
                            scale = Math.max(0.05, Math.min(20.0, scale));
                            updateImageTransform();
                        } else {
                            pdfScale *= factor;
                            pdfScale = Math.max(0.2, Math.min(10.0, pdfScale));
                            renderPdfPage();
                        }
                    }
                    
                    function rotate() {
                        if (isPdfMode) return;
                        rotation += 90;
                        if (rotation >= 360) rotation = 0;
                        updateImageTransform();
                    }
                    
                    function reset() {
                        if (!isPdfMode) {
                            scale = 1.0;
                            rotation = 0;
                            updateImageTransform();
                        } else {
                            pdfScale = 1.0;
                            renderPdfPage();
                        }
                    }
                    
                    function updateImageTransform() {
                        image.style.transform = \`scale(\${scale}) rotate(\${rotation}deg)\`;
                    }
                    
                    // PDF操作
                    function loadPdf(pdfUrl) {
                        const loadingTask = pdfjsLib.getDocument(pdfUrl);
                        loadingTask.promise.then(doc => {
                            pdfDoc = doc;
                            pdfPageCount = doc.numPages;
                            pdfPageNum = 1;
                            pdfScale = 1.0;
                            renderPdfPage();
                        }).catch(err => {
                            console.error('PDF加载失败:', err);
                            alert('PDF加载失败: ' + err.message);
                        });
                    }
                    
                    function renderPdfPage() {
                        if (!pdfDoc) return;
                        
                        pdfDoc.getPage(pdfPageNum).then(page => {
                            const viewport = page.getViewport({ scale: pdfScale });
                            pdfCanvas.width = viewport.width;
                            pdfCanvas.height = viewport.height;
                            
                            const context = pdfCanvas.getContext('2d');
                            const renderContext = {
                                canvasContext: context,
                                viewport: viewport
                            };
                            
                            page.render(renderContext).promise.then(() => {
                                pdfPageInfo.textContent = \`页码: \${pdfPageNum}/\${pdfPageCount}\`;
                                if(prevPageBtn) prevPageBtn.disabled = pdfPageNum <= 1;
                                if(nextPageBtn) nextPageBtn.disabled = pdfPageNum >= pdfPageCount;
                            });
                        });
                    }
                    
                    function prevPage() {
                        if (pdfPageNum > 1) {
                            pdfPageNum--;
                            renderPdfPage();
                        }
                    }
                    
                    function nextPage() {
                        if (pdfPageNum < pdfPageCount) {
                            pdfPageNum++;
                            renderPdfPage();
                        }
                    }
                    
                    // 启动
                    init();
                </script>
            </body>
            </html>
        `;
    }
}

export function deactivate() {}