import { stat, readdir } from 'fs/promises';
import { dirname, basename, extname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execAsync = promisify(exec);

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'gif', 'ico', 'svg', 'heic', 'heif'
]);
const SUPPORTED_EXTENSIONS = new Set([...SUPPORTED_IMAGE_EXTENSIONS, 'pdf']);

function getExtension(filename) {
  return extname(filename).toLowerCase().replace(/^\./, '');
}

function isSupportedImage(filename) {
  return SUPPORTED_IMAGE_EXTENSIONS.has(getExtension(filename));
}

function isSupportedFile(filename) {
  return SUPPORTED_EXTENSIONS.has(getExtension(filename));
}

function formatFileSize(size) {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (size >= GB) return `${(size / GB).toFixed(2)} GB`;
  if (size >= MB) return `${(size / MB).toFixed(2)} MB`;
  if (size >= KB) return `${(size / KB).toFixed(2)} KB`;
  return `${size} B`;
}

function formatFormat(ext) {
  const map = {
    jpg: 'JPEG',
    jpeg: 'JPEG',
    png: 'PNG',
    webp: 'WebP',
    bmp: 'BMP',
    tiff: 'TIFF',
    tif: 'TIFF',
    gif: 'GIF',
    ico: 'ICO',
    svg: 'SVG',
    heic: 'HEIC',
    heif: 'HEIC',
    pdf: 'PDF'
  };
  return map[ext] || ext.toUpperCase();
}

/**
 * 读取文件基本信息（包括图片元数据）
 */
export async function readFileInfo(filePath) {
  const stats = await stat(filePath);
  const ext = getExtension(filePath);
  const name = basename(filePath);

  const info = {
    path: filePath,
    name,
    size: stats.size,
    modified: stats.mtime.toISOString().replace('T', ' ').slice(0, 19),
    width: null,
    height: null,
    format: formatFormat(ext),
    colorSpace: null,
    bitDepth: null
  };

  if (isSupportedImage(name) && ext !== 'svg') {
    try {
      const metadata = await sharp(filePath).metadata();
      info.width = metadata.width || null;
      info.height = metadata.height || null;
      info.colorSpace = metadata.space || null;
      info.bitDepth = metadata.depth || null;
    } catch (error) {
      console.warn(`读取图片元数据失败: ${filePath}`, error.message);
    }
  }

  return info;
}

/**
 * 列出目录中的所有图片/PDF文件
 */
export async function listDirectoryFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    const name = entry.name;
    const path = join(dirPath, name);
    const isDir = entry.isDirectory();

    if (!isDir && !isSupportedFile(name)) {
      continue;
    }

    let size = 0;
    if (!isDir) {
      try {
        const stats = await stat(path);
        size = stats.size;
      } catch {
        // ignore
      }
    }

    result.push({ path, name, isDir, size });
  }

  result.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return result;
}

/**
 * 生成缩略图（base64）
 */
export async function generateThumbnail(filePath, maxSize = 200) {
  // SVG 文件跳过 sharp 处理，返回占位缩略图
  const ext = getExtension(filePath);
  if (ext === 'svg') {
    return {
      data: '',
      width: maxSize,
      height: maxSize
    };
  }

  const metadata = await sharp(filePath).metadata();
  const width = metadata.width;
  const height = metadata.height;

  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const buffer = await sharp(filePath)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return {
    data: buffer.toString('base64'),
    width: targetWidth,
    height: targetHeight
  };
}

/**
 * 获取图片完整尺寸
 */
export async function getImageDimensions(filePath) {
  // SVG 文件跳过 sharp，返回空尺寸
  const ext = getExtension(filePath);
  if (ext === 'svg') {
    return { width: 0, height: 0 };
  }

  const metadata = await sharp(filePath).metadata();
  return {
    width: metadata.width,
    height: metadata.height
  };
}

/**
 * 在资源管理器中打开文件所在文件夹
 */
export async function openInExplorer(filePath) {
  const dir = dirname(filePath);
  await execAsync(`explorer "${dir}"`);
}

export { formatFileSize, isSupportedImage, isSupportedFile };
