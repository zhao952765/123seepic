import { clipboard, nativeImage } from 'electron';
import { readFile } from 'fs/promises';

/**
 * 复制图片到剪贴板
 * @param {string} filePath 图片路径
 */
export async function copyImageToClipboard(filePath) {
  const buffer = await readFile(filePath);
  const image = nativeImage.createFromBuffer(buffer);
  clipboard.writeImage(image);
}
