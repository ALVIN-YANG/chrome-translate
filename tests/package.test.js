import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { REQUIRED_FILES, packageExtension } from '../scripts/package.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'chrome-translate-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'dist');
  await mkdir(join(directory, 'icons'), { recursive: true });
  for (const name of REQUIRED_FILES) await writeFile(join(directory, name), name === 'manifest.json' ? JSON.stringify({ manifest_version: 3, version: '0.7.0' }) : `fixture ${name}`);
  return { directory, outputDirectory: join(root, 'release'), version: '0.7.0' };
}

test('相同产物生成相同 ZIP 和可校验摘要，文件从根目录安装', async t => {
  const options = await fixture(t);
  const first = await packageExtension(options);
  const bytes = await readFile(join(options.outputDirectory, first.filename));
  const second = await packageExtension(options);
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(bytes, await readFile(join(options.outputDirectory, second.filename)));
  assert.equal(await readFile(join(options.outputDirectory, `${first.filename}.sha256`), 'utf8'), `${first.sha256}  ${first.filename}\n`);
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), [...REQUIRED_FILES].sort());
  assert.equal(JSON.parse(Buffer.from(files['manifest.json']).toString()).version, '0.7.0');
});

test('版本不一致、缺少文件及额外调试文件均阻止打包', async t => {
  const options = await fixture(t);
  await assert.rejects(packageExtension({ ...options, version: '0.8.0' }), /版本/);
  await writeFile(join(options.directory, '.env'), 'fixture-secret');
  await assert.rejects(packageExtension(options), /未知文件/);
  await rm(join(options.directory, '.env'));
  await rm(join(options.directory, 'background.js'));
  await assert.rejects(packageExtension(options), /缺少 background.js/);
});

test('符号链接不能把源码目录外的内容带入安装包', async t => {
  const options = await fixture(t);
  await rm(join(options.directory, 'app.js'));
  await symlink(join(options.directory, 'background.js'), join(options.directory, 'app.js'));
  await assert.rejects(packageExtension(options), /未知文件/);
});
