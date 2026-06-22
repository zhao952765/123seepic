import { setWallpaper } from 'wallpaper';

const MODE_MAP = {
  fill: 'fill',
  fit: 'fit',
  stretch: 'stretch',
  tile: 'tile',
  center: 'center'
};

/**
 * 设置为桌面壁纸
 * @param {string} filePath 图片路径
 * @param {string} mode fill|fit|stretch|tile|center
 */
export async function setAsWallpaper(filePath, mode = 'fill') {
  const wallpaperMode = MODE_MAP[mode] || 'stretch';
  await setWallpaper(filePath, { scale: wallpaperMode });
}
