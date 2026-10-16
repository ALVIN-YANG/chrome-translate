import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';
import { packageExtension } from '../../scripts/package.mjs';
import { startFixtureServer } from './fixture-server.js';
import workspace from '../../scripts/browser-workspace-smoke.mjs';
import webpage from '../../scripts/browser-page-smoke.mjs';
import assistant from '../../scripts/browser-assistant-smoke.mjs';
import pageCSP from '../../scripts/browser-page-csp-smoke.mjs';
import audioCSP from '../../scripts/browser-assistant-csp-smoke.mjs';
import { boundaries, rerender } from '../../scripts/browser-page-compatibility-smoke.mjs';
import realSite from '../../scripts/browser-page-real-sites.mjs';
import { focusReturn, sceneState } from '../../scripts/browser-keyboard-smoke.mjs';

const artifactPath = resolve('output/playwright');
await mkdir(artifactPath, { recursive: true });
const releaseRoot = await mkdtemp(join(tmpdir(), 'chrome-translate-release-test-'));
after(() => rm(releaseRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const packaged = await packageExtension({ directory: resolve('dist'), outputDirectory: releaseRoot, version });
const extensionPath = join(releaseRoot, 'extension');
// 浏览器加载实际 ZIP 的解压结果，覆盖缺文件、错误层级及打包差异。
for (const [name, bytes] of Object.entries(unzipSync(await readFile(join(releaseRoot, packaged.filename))))) {
  const target = join(extensionPath, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
await writeFile(join(artifactPath, 'package-result.json'), JSON.stringify(packaged, null, 2) + '\n');

for (const [name, scenario, entry] of [
  ['workspace', workspace, 'index.html'],
  ['webpage', webpage, 'article.html'],
  ['assistant', assistant, 'article.html'],
  ['page-csp', pageCSP, 'article.html'],
  ['audio-csp', audioCSP, 'article.html'],
  ['page-boundaries', boundaries, 'compatibility.html'],
  ['page-rerender', rerender, 'compatibility.html'],
  ['keyboard-focus', focusReturn, 'article.html'],
  ['scene-state', sceneState, 'article.html'],
  ...(process.env.TRANSLATE_LIVE_MICROSOFT === '1' ? [
    ['real-mdn', realSite, 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array'],
    ['real-python', realSite, 'https://docs.python.org/3/library/asyncio-task.html'],
  ] : []),
]) {
  test(`Chromium MV3: ${name}`, { timeout: 90000 }, async t => {
    const live = entry.startsWith('https://');
    const profile = await mkdtemp(join(tmpdir(), 'chrome-translate-test-'));
    const fixture = await startFixtureServer();
    let context;
    try {
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium', headless: !process.env.HEADED,
        viewport: { width: 1440, height: 980 },
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      });
      t.signal.addEventListener('abort', () => { context.close().catch(() => {}); }, { once: true });
      context.setDefaultTimeout(10000);
      if (!live) await context.tracing.start({ screenshots: true, snapshots: true });
      const unexpected = [];
      // 每个场景再安装自己的供应商响应；其他网络请求必须显式处理。
      if (!live) await context.route('**/*', route => {
        if (route.request().url().startsWith(`${fixture.origin}/`) || route.request().url().startsWith('chrome-extension://')) return route.continue();
        unexpected.push(route.request().url()); return route.abort();
      });
      let [worker] = context.serviceWorkers();
      worker ||= await context.waitForEvent('serviceworker');
      assert.ok(worker.url().startsWith('chrome-extension://'), '测试必须使用真正的扩展后台');
      const page = context.pages()[0] || await context.newPage();
      await page.goto(entry.startsWith('https://') ? entry : entry === 'index.html' ? await worker.evaluate(() => chrome.runtime.getURL('index.html')) : `${fixture.origin}/${entry}`, { waitUntil: 'domcontentloaded', timeout: entry.startsWith('https://') ? 45000 : 10000 });
      const result = await scenario(page);
      assert.equal(result.status, 'passed');
      assert.deepEqual(unexpected, [], '场景包含未经处理的外部请求');
      const evidence = {
        ...result, browserVersion: context.browser().version(), platform: process.platform,
        extensionVersion: await worker.evaluate(() => chrome.runtime.getManifest().version),
      };
      await writeFile(join(artifactPath, `${name}-result.json`), JSON.stringify(evidence, null, 2) + '\n');
      if (!live) await context.tracing.stop();
      t.diagnostic(`${result.checks.length} checks; ${result.mode || result.responseMode}; isolated profile`);
    } catch (error) {
      if (context) {
        for (const [index, page] of context.pages().entries()) await page.screenshot({ path: join(artifactPath, `${name}-failure-${index}.png`), timeout: 5000 }).catch(() => {});
        if (!live) await context.tracing.stop({ path: join(artifactPath, `${name}-trace.zip`) }).catch(() => {});
      }
      throw error;
    } finally {
      // 取消模拟响应后再关页，避免延迟中的 route 访问已经关闭的页面。
      if (context) {
        await Promise.all(context.pages().map(page => page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})));
        await context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
      }
      await context?.close();
      await fixture.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
}
