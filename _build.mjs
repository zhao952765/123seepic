import { build } from 'electron-builder';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

build({
  config: resolve(__dirname, 'electron-builder.yml'),
  publish: 'never',
}).then(() => {
  console.log('打包完成!');
}).catch((err) => {
  console.error('打包失败:', err);
  process.exit(1);
});