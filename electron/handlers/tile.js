import sharp from 'sharp';

const MAX_OUTPUT = 4096;  // 输出尺寸上限，防止异常大尺寸请求导致内存溢出

// 限制 sharp 并发处理数，防止瞬间大量瓦片请求导致内存峰值
sharp.concurrency(4);

/**
 * 提取图片瓦片（高质量 Lanczos 缩放）
 * @param {string} filePath      - 原图路径
 * @param {number} tileX         - 瓦片列索引（用于计算裁剪区域）
 * @param {number} tileY         - 瓦片行索引（用于计算裁剪区域）
 * @param {number} tileSize      - 瓦片在原图中的尺寸
 * @param {number} outputWidth   - 输出瓦片宽度（默认 256）
 * @param {number} outputHeight  - 输出瓦片高度（默认 256）
 * @returns {Promise<Buffer>}    - JPEG 格式的瓦片数据
 */
export async function extractTile(
  filePath,
  tileX,
  tileY,
  tileSize,
  outputWidth = 256,
  outputHeight = 256
) {
  try {
    // 输出尺寸上限校验
    if (outputWidth > MAX_OUTPUT || outputHeight > MAX_OUTPUT) {
      throw new Error(`输出尺寸超出限制: ${outputWidth}x${outputHeight}（上限 ${MAX_OUTPUT}）`);
    }

    const metadata = await sharp(filePath).metadata();
    const imgWidth = metadata.width;
    const imgHeight = metadata.height;

    const left = tileX * tileSize;
    const top = tileY * tileSize;
    const width = Math.min(tileSize, imgWidth - left);
    const height = Math.min(tileSize, imgHeight - top);

    if (width <= 0 || height <= 0) {
      throw new Error(`瓦片坐标超出图片范围: (${left},${top}) ${width}x${height}`);
    }

    const buffer = await sharp(filePath)
      .extract({ left, top, width, height })
      .resize(outputWidth, outputHeight, {
        kernel: 'lanczos3',            // Lanczos 3 插值，放大清晰度最高
        fit: 'fill',                   // 填满输出尺寸
        withoutEnlargement: false,     // 允许放大（放大时才会用到 kernel）
        fastShrinkOnLoad: false        // 禁用快速收缩，保证质量
      })
      .jpeg({ quality: 92 })           // 质量 92 平衡清晰度与体积
      .toBuffer();

    return buffer;
  } catch (error) {
    console.error('[extractTile] error:', error);
    throw error;
  }
}