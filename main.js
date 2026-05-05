const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { exec, execSync } = require('child_process');

// 全局窗口引用
let mainWindow = null;

function createWindow(filePath = null) {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false  // 允许加载本地文件
        },
        icon: path.join(__dirname, '123.ico'),
        title: '123看图',
        backgroundColor: '#1e1e2e',
        autoHideMenuBar: true
    });
    win.setMenu(null);

    // 加载查看器页面，传递文件路径作为查询参数
    let viewerUrl = url.format({
        pathname: path.join(__dirname, 'viewer.html'),
        protocol: 'file:',
        slashes: true,
        query: filePath ? { file: filePath } : {}
    });
    win.loadURL(viewerUrl);

    // 打开开发者工具（可选）
    // win.webContents.openDevTools();

    win.on('closed', () => {
        mainWindow = null;
    });

    return win;
}

// 当 Electron 完成初始化并准备创建浏览器窗口时
app.whenReady().then(() => {
    // 检查是否有文件通过命令行参数传递
    let filePath = process.argv.length > 1 ? process.argv[1] : null;
    
    // 处理 Windows 中可能存在的 '@' 前缀（某些命令行工具添加）
    if (filePath && filePath.startsWith('@')) {
        filePath = filePath.slice(1);
    }
    
    // 清理路径：移除可能的引号
    if (filePath) {
        filePath = filePath.trim().replace(/^"+|"+$/g, '');
    }
    
    // 验证路径是否存在
    if (filePath && fs.existsSync(filePath)) {
        console.log('通过命令行打开文件:', filePath);
        mainWindow = createWindow(filePath);
        // 更新窗口标题
        mainWindow.setTitle(`123看图 - ${path.basename(filePath)}`);
    } else {
        if (filePath) {
            console.warn('文件不存在:', filePath);
        }
        mainWindow = createWindow();
    }

    // 当没有窗口时重新创建一个窗口（macOS）
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 监听来自渲染进程的消息
ipcMain.on('open-file-dialog', (event) => {
    dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'] },
            { name: 'PDF 文件', extensions: ['pdf'] },
            { name: '所有支持的文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'pdf'] }
        ]
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            event.sender.send('file-selected', result.filePaths[0]);
        }
    }).catch(err => {
        console.error(err);
    });
});

// 打开文件夹对话框
ipcMain.on('open-folder-dialog', (event) => {
    dialog.showOpenDialog({
        properties: ['openDirectory']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            // 读取文件夹中的图片和PDF文件
            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    console.error('读取文件夹失败:', err);
                    event.sender.send('folder-selected', { error: err.message });
                    return;
                }
                const supportedExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.pdf'];
                const imageFiles = files
                    .filter(file => {
                        const ext = path.extname(file).toLowerCase();
                        return supportedExts.includes(ext);
                    })
                    .map(file => path.join(folderPath, file))
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                
                event.sender.send('folder-selected', {
                    folderPath,
                    files: imageFiles
                });
            });
        }
    }).catch(err => {
        console.error(err);
    });
});

ipcMain.on('open-devtools', (event) => {
    if (mainWindow) {
        mainWindow.webContents.openDevTools();
    }
});

// 处理文件关联（Windows 双击文件打开）
if (process.platform === 'win32' && process.argv.length >= 2) {
    const potentialFile = process.argv[1];
    if (fs.existsSync(potentialFile)) {
        // 文件已通过命令行参数传递，已在 createWindow 中处理
    }
}

// 关联所有图片格式
function associateImageFiles() {
    if (process.platform !== 'win32') {
        console.log('文件关联仅支持 Windows 系统');
        return;
    }
    const extList = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'pdf'];
    const appPath = process.execPath;
    const appName = '123看图';
    
    let success = 0, fail = 0, msgs = [];
    
    extList.forEach(ext => {
        try {
            // 每个扩展名单独注册，避免命令行过长
            execSync(
                `reg add "HKCU\\Software\\Classes\\.${ext}" /ve /d "${appName}.${ext}" /f`,
                { timeout: 3000, shell: 'cmd.exe' }
            );
            execSync(
                `reg add "HKCU\\Software\\Classes\\${appName}.${ext}\\shell\\open\\command" /ve /d "\\"${appPath}\\" \\"%1\\"" /f`,
                { timeout: 3000, shell: 'cmd.exe' }
            );
            execSync(
                `reg add "HKCU\\Software\\Classes\\${appName}.${ext}" /ve /d "${appName}" /f`,
                { timeout: 3000, shell: 'cmd.exe' }
            );
            success++;
            msgs.push(`✅ .${ext}`);
        } catch (e) {
            fail++;
            msgs.push(`❌ .${ext} (${e.message.slice(0, 30)})`);
        }
    });
    
    // 注册"打开方式"菜单
    try {
        execSync(
            `reg add "HKCU\\Software\\Classes\\Applications\\${appName}.exe\\shell\\open\\command" /ve /d "\\"${appPath}\\" \\"%1\\"" /f`,
            { timeout: 3000, shell: 'cmd.exe' }
        );
        // 注册支持的扩展名到应用程序
        extList.forEach(ext => {
            execSync(
                `reg add "HKCU\\Software\\Classes\\Applications\\${appName}.exe\\SupportedTypes" /v ".${ext}" /d "" /f`,
                { timeout: 2000, shell: 'cmd.exe' }
            );
        });
    } catch (e) {
        console.error('注册打开方式菜单失败:', e.message);
    }
    
    console.log(`关联结果: 成功${success}/${success+fail}`);
    msgs.forEach(m => console.log(m));
    
    // 刷新资源管理器
    try {
        execSync('taskkill /f /im explorer.exe & start explorer.exe', { timeout: 5000, shell: 'cmd.exe' });
    } catch (e) {
        console.error('刷新资源管理器失败:', e.message);
    }
    
    if (mainWindow) {
        const msg = success > 0 
            ? `已关联 ${success} 种格式${fail > 0 ? `，${fail} 种失败` : ''}，可能需要管理员权限`
            : '关联失败，请以管理员身份运行';
        mainWindow.webContents.send('association-result', { success: success > 0, message: msg });
    }
}

// 监听"关联文件"按钮点击
ipcMain.on('associate-image-files', () => {
    associateImageFiles();
});