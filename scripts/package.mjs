import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

export const REQUIRED_FILES = [
  'LICENSE', 'THIRD_PARTY_LICENSES.txt', 'app.js', 'background.js', 'content.js',
  'icons/16.png', 'icons/32.png', 'icons/48.png', 'icons/128.png',
  'index.html', 'manifest.json', 'offscreen.html', 'offscreen.js',
  'popup.css', 'popup.html', 'popup.js', 'services.css', 'services.html',
  'services.js', 'styles.css', 'tabs.js',
];
const allowedFiles = new Set(REQUIRED_FILES);

// 只打包明确的扩展产物，不递归压缩任意目录，也不跟随符号链接。
export async function packageExtension({ directory, outputDirectory, version }) {
  const entries = {};
  async function collect(relative = '') {
    for (const entry of await readdir(resolve(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && name === 'icons') { await collect(name); continue; }
      if (!entry.isFile() || !allowedFiles.has(name)) throw new Error(`安装包含未知文件：${name}。请重新构建。`);
      entries[name] = await readFile(resolve(directory, name));
    }
  }
  await collect();
  for (const name of REQUIRED_FILES) if (!entries[name]) throw new Error(`安装包缺少 ${name}。`);
  const manifest = JSON.parse(entries['manifest.json'].toString());
  if (!/^\d+\.\d+\.\d+$/.test(version) || manifest.version !== version || manifest.manifest_version !== 3) throw new Error('安装包版本或 Manifest 无效。');
  // 固定顺序、时间和压缩参数；不把机器路径、当前时间或文件权限写入 ZIP。
  const sorted = Object.fromEntries(Object.keys(entries).sort().map(name => [name, entries[name]]));
  const bytes = zipSync(sorted, { level: 9, mtime: new Date(1980, 0, 1) });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = `translate-chrome-${version}.zip`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, filename), bytes);
  await writeFile(resolve(outputDirectory, `${filename}.sha256`), `${sha256}  ${filename}\n`);
  return { filename, sha256, bytes: bytes.length, files: Object.keys(sorted) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const result = await packageExtension({
    directory: fileURLToPath(new URL('../dist/', import.meta.url)),
    outputDirectory: fileURLToPath(new URL('../output/release/', import.meta.url)),
    version: pkg.version,
  });
  console.log(`${result.filename} · ${result.bytes} bytes\nSHA-256 ${result.sha256}`);
}
