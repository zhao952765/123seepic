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

    // 注册自定义编辑器提供程序
    const imageViewerProvider = vscode.window.registerCustomEditorProvider(
        '123-image-viewer.imageViewer',
        new ImageViewerProvider(context),
        {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false
        }
    );

    const pdfViewerProvider = vscode.window.registerCustomEditorProvider(
        '123-image-viewer.pdfViewer',
        new PdfViewerProvider(context),
        {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(openViewerCommand, imageViewerProvider, pdfViewerProvider);
}

async function openCustomEditor(uri: vscode.Uri) {
    // 根据文件扩展名决定使用哪个查看器
    const ext = uri.path.toLowerCase().split('.').pop();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'];
    if (imageExts.includes(ext || '')) {
        await vscode.commands.executeCommand('vscode.openWith', uri, '123-image-viewer.imageViewer');
    } else if (ext === 'pdf') {
        await vscode.commands.executeCommand('vscode.openWith', uri, '123-image-viewer.pdfViewer');
    } else {
        vscode.window.showErrorMessage('不支持的文件格式。');
    }
}

class ImageViewerProvider implements vscode.CustomEditorProvider {
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
        // 设置 Webview 内容为图片查看器
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = this.getImageHtml(document.uri, webviewPanel);
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

    private getImageHtml(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel): string {
        const src = webviewPanel.webview.asWebviewUri(uri);
        const fileName = uri.fsPath.split(/[\\/]/).pop();
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>123看图 - ${fileName}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background: #1e1e2e;
                        color: #ffffff;
                        font-family: sans-serif;
                        overflow: hidden;
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }
                    .toolbar {
                        padding: 8px;
                        background: #252535;
                        display: flex;
                        gap: 8px;
                        align-items: center;
                        flex-wrap: wrap;
                    }
                    .viewer {
                        flex: 1;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        overflow: auto;
                    }
                    img {
                        max-width: 100%;
                        max-height: 100%;
                        object-fit: contain;
                        transition: transform 0.2s ease;
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
                    #fileName {
                        margin-left: auto;
                        color: #aaa;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="toolbar">
                        <button id="zoomIn">放大</button>
                        <button id="zoomOut">缩小</button>
                        <button id="rotate">旋转</button>
                        <button id="reset">重置</button>
                        <span id="fileName">${fileName}</span>
                    </div>
                    <div class="viewer">
                        <img src="${src}" id="image" />
                    </div>
                </div>
                <script>
                    const image = document.getElementById('image');
                    let scale = 1;
                    let rotation = 0;

                    function updateTransform() {
                        image.style.transform = \`scale(\${scale}) rotate(\${rotation}deg)\`;
                    }

                    document.getElementById('zoomIn').addEventListener('click', () => {
                        scale *= 1.1;
                        updateTransform();
                    });
                    document.getElementById('zoomOut').addEventListener('click', () => {
                        scale /= 1.1;
                        updateTransform();
                    });
                    document.getElementById('rotate').addEventListener('click', () => {
                        rotation += 90;
                        updateTransform();
                    });
                    document.getElementById('reset').addEventListener('click', () => {
                        scale = 1;
                        rotation = 0;
                        updateTransform();
                    });
                </script>
            </body>
            </html>
        `;
    }
}

class PdfViewerProvider implements vscode.CustomEditorProvider {
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
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = this.getPdfHtml(document.uri, webviewPanel);
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

    private getPdfHtml(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel): string {
        const src = webviewPanel.webview.asWebviewUri(uri);
        const fileName = uri.fsPath.split(/[\\/]/).pop();
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>123看图 - ${fileName}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background: #1e1e2e;
                        color: #fff;
                        font-family: sans-serif;
                        overflow: hidden;
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }
                    .toolbar {
                        padding: 8px;
                        background: #252535;
                        display: flex;
                        gap: 8px;
                        align-items: center;
                    }
                    .viewer {
                        flex: 1;
                        overflow: auto;
                        display: flex;
                        justify-content: center;
                    }
                    iframe {
                        width: 100%;
                        height: 100%;
                        border: none;
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
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="toolbar">
                        <button id="prev">上一页</button>
                        <span id="pageInfo">PDF 查看器 - ${fileName}</span>
                        <button id="next">下一页</button>
                    </div>
                    <div class="viewer">
                        <iframe src="${src}"></iframe>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
}

export function deactivate() {}