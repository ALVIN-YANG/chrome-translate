import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(`${root}package.json`, 'utf8'));
const manifest = JSON.parse(await readFile(`${root}public/manifest.json`, 'utf8'));
if (pkg.version !== manifest.version) throw new Error('package.json 与 manifest.json 的版本不一致，停止构建。');
// dist 只保存生成文件，避免上次构建或手工调试的文件混入安装包。
await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}public`, `${root}dist`, { recursive: true });
const extensionBuild = await build({
  entryPoints: ['app', 'background', 'popup', 'services', 'offscreen'].map(name => `${root}src/${name}.js`), bundle: true, format: 'esm',
  platform: 'browser', target: 'chrome120', outdir: `${root}dist`,
  legalComments: 'eof', minify: true, metafile: true,
});
const contentBuild = await build({
  entryPoints: [`${root}src/content.js`], bundle: true, format: 'iife',
  platform: 'browser', target: 'chrome120', outfile: `${root}dist/content.js`,
  loader: { '.css': 'text' }, legalComments: 'eof', minify: true, metafile: true,
});
for (const name of ['index.html', 'styles.css', 'popup.html', 'popup.css', 'services.html', 'services.css', 'offscreen.html']) {
  await cp(`${root}src/${name}`, `${root}dist/${name}`);
}
const packages = new Map();
for (const result of [extensionBuild, contentBuild]) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const index = input.lastIndexOf('node_modules/');
    if (index < 0) continue;
    const relative = input.slice(index + 'node_modules/'.length).split('/');
    const name = relative[0].startsWith('@') ? relative.slice(0, 2).join('/') : relative[0];
    packages.set(name, `${root}node_modules/${name}`);
  }
}
const licenses = [];
for (const [name, directory] of [...packages].sort()) {
  const pkg = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  let license;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'COPYING']) {
    try { license = await readFile(`${directory}/${file}`, 'utf8'); break; } catch {}
  }
  if (!license && name.startsWith('@ai-sdk/')) {
    const core = JSON.parse(await readFile(`${root}node_modules/ai/package.json`, 'utf8'));
    if (pkg.license === core.license && pkg.repository?.url === core.repository?.url) license = await readFile(`${root}node_modules/ai/LICENSE`, 'utf8');
  }
  if (!license) throw new Error(`缺少 ${name} 的许可证文件，停止构建。`);
  licenses.push(`${name} ${pkg.version}\n${license}`);
}
await writeFile(`${root}dist/THIRD_PARTY_LICENSES.txt`, licenses.join('\n\n---\n\n'));
await cp(`${root}LICENSE`, `${root}dist/LICENSE`);
console.log('已构建 dist/，可在 Chrome 扩展程序页面加载。');
