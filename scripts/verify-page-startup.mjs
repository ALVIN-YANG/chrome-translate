import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { unzipSync } from 'fflate';
import { fileURLToPath } from 'node:url';
import { packageExtension } from './package.mjs';

// 显式运行的公共网页启动检查，不使用用户配置，也不触发翻译动作。
const artifactRoot = fileURLToPath(new URL('../output/', import.meta.url));
await mkdir(artifactRoot, { recursive: true });
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const root = await mkdtemp(join(tmpdir(), 'translate-startup-probe-'));
const path = join(root, 'extension');
const results = [];
try {
  const packaged = await packageExtension({ directory: fileURLToPath(new URL('../dist/', import.meta.url)), outputDirectory: root, version });
  const archive = await readFile(join(root, packaged.filename));
  for (const [name, bytes] of Object.entries(unzipSync(archive))) {
    const target = join(path, name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  for (const [name, url] of [
    ['mdn-1', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array'],
    ['mdn-2', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array'],
    ['mdn-3', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array'],
    ['python', 'https://docs.python.org/3/library/asyncio-task.html'],
  ]) {
    const profile = join(root, name);
    let context;
    let stage = 'browser';
    const calls = [];
    try {
      context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
        viewport: { width: 1440, height: 980 }, args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`] });
      await context.route(/^https:\/\/(edge\.microsoft\.com\/translate\/|cn\.bing\.com\/dict\/)/, route => { calls.push(new URL(route.request().url()).hostname); return route.abort(); });
      let [worker] = context.serviceWorkers(); worker ||= await context.waitForEvent('serviceworker');
      const page = context.pages()[0] || await context.newPage();
      await page.addInitScript(() => {
        window.__ctStartup = []; let previous, previousConnected;
        const record = event => {
          const host = document.querySelector('[data-ct-owned="controls"]');
          const connected = Boolean(host?.isConnected);
          if (event || host !== previous || connected !== previousConnected) {
            window.__ctStartup.push({ time: Math.round(performance.now()), event: event || (connected ? 'host-present' : 'host-absent'),
              readyState: document.readyState, shadow: Boolean(host?.shadowRoot), previousDetached: Boolean(previous && !previous.isConnected) });
            previous = host; previousConnected = connected;
          }
        };
        new MutationObserver(() => { if (!previous?.isConnected) record(); }).observe(document, { childList: true, subtree: true });
        document.addEventListener('DOMContentLoaded', () => record('dom-ready'));
        window.addEventListener('load', () => record('load'));
      });
      const navigation = Date.now();
      stage = 'navigation';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const root = page.locator('main,[role="main"]').first();
      stage = 'document';
      await root.waitFor({ timeout: 10000 });
      await root.locator('pre').evaluateAll(nodes => nodes.map(node => (node.querySelector('code') || node).textContent));
      await root.evaluate(element => element.querySelectorAll('p').length);
      let readinessError;
      stage = 'controls';
      const ready = await page.locator('[data-ct-owned="controls"]').getByRole('button', { name: '翻译当前网页', exact: true })
        .click({ trial: true, timeout: 10000 }).then(() => true, error => { readinessError = error.message.slice(0, 800); return false; });
      await page.waitForTimeout(2500);
      const state = await page.evaluate(() => {
        const host = document.querySelector('[data-ct-owned="controls"]'), button = host?.shadowRoot?.querySelector('.float');
        return { timeline: window.__ctStartup, host: Boolean(host), shadow: Boolean(host?.shadowRoot),
          button: Boolean(button), hidden: button?.hidden, label: button?.getAttribute('aria-label'),
          disabled: button?.disabled, rect: button?.getBoundingClientRect().toJSON(), modal: Boolean(document.querySelector('dialog[open]')),
          hiddenAncestor: Boolean(host?.closest('[aria-hidden="true"],[inert]')), readyState: document.readyState };
      });
      const status = await Promise.race([
        worker.evaluate(async url => { const [tab] = await chrome.tabs.query({ url }); return chrome.tabs.sendMessage(tab.id, { type: 'ct:status' }); }, page.url()).catch(error => ({ unavailable: error.message.slice(0, 160) })),
        new Promise(resolve => setTimeout(() => resolve({ unavailable: 'status-timeout' }), 2000)),
      ]);
      const row = { name, url: page.url(), elapsed: Date.now() - navigation, readyWithin10s: ready, readinessError: readinessError?.split('\n')[0], ...state, status, upstreamCalls: calls.length };
      assert.equal(calls.length, 0, '启动探针不能发送翻译请求');
      results.push(row); console.log(JSON.stringify(row));
    } catch (error) { const row = { name, url, stage, errorType: error.name, upstreamCalls: calls.length }; results.push(row); console.log(JSON.stringify(row)); }
    finally { await context?.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  }
  await writeFile(join(artifactRoot, 'startup-probe.json'), JSON.stringify({ version, packageSHA256: packaged.sha256, results }, null, 2) + '\n');
} finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
assert.ok(results.length === 4 && results.every(row => row.readyWithin10s && row.host && row.button && !row.hidden), '启动入口未在期限内出现或随后丢失');
