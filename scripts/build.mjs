import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}public`, `${root}dist`, { recursive: true });
await build({
  entryPoints: ['app', 'background', 'popup'].map(name => `${root}src/${name}.js`), bundle: true, format: 'esm',
  platform: 'browser', target: 'chrome120', outdir: `${root}dist`,
  legalComments: 'eof', minify: true,
});
await build({
  entryPoints: [`${root}src/content.js`], bundle: true, format: 'iife',
  platform: 'browser', target: 'chrome120', outfile: `${root}dist/content.js`,
  loader: { '.css': 'text' }, legalComments: 'eof', minify: true,
});
for (const name of ['index.html', 'styles.css', 'popup.html', 'popup.css']) {
  await cp(`${root}src/${name}`, `${root}dist/${name}`);
}
const license = await readFile(`${root}node_modules/js-md5/LICENSE.txt`, 'utf8');
await writeFile(`${root}dist/THIRD_PARTY_LICENSES.txt`, `js-md5 0.9.2\n\n${license}`);
console.log('已构建 dist/，可在 Chrome 扩展程序页面加载。');
