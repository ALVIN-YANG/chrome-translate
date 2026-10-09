import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { collectPageSegments, pageRoots, splitPageText } from '../src/page-segments.js';
import { PageQueue } from '../src/page-queue.js';
import { normalizeSettings, defaultSettings } from '../src/settings.js';
import { safeSettings, validateTranslationMessage, isPageSender } from '../src/page-protocol.js';
import { translateMicrosoftBatch } from '../src/providers.js';
const doc = html => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('正文提取保留链接、列表和内联格式，排除代码、表单、私有及插件内容', () => {
  const page = doc('<nav><p>navigation text</p></nav><main><h1>Reading an article about translation</h1><p>Hello <a href="/go"><b>world</b></a>.</p><ul><li>First item</li></ul><pre>code snippet</pre><p translate="no">private no translate</p><div contenteditable>user writing</div><form><p>user input</p></form><p hidden>invisible</p><span data-ct-owned="controls">extension content</span></main><aside><p>sidebar text</p></aside>');
  const original = page.body.innerHTML;
  assert.deepEqual(collectPageSegments(page).map(row => row.text), ['Reading an article about translation', 'Hello world.', 'First item']);
  assert.equal(page.body.innerHTML, original);
  assert(collectPageSegments(page, 'all').some(row => row.text === 'navigation text'));
  assert(collectPageSegments(page, 'all').some(row => row.text === 'sidebar text'));
});

test('正文根节点去重，普通布局回退到 body，隐藏内容由可见性判定排除', () => {
  const page = doc('<main><article><p>This is a nested article with enough text.</p></article><p class="invisible">Hidden by CSS in browser</p></main>');
  assert.equal(pageRoots(page).length, 1);
  assert.deepEqual(collectPageSegments(page, 'smart', el => !el.closest('.invisible')).map(row => row.text), ['This is a nested article with enough text.']);
  assert.equal(pageRoots(doc('<div>Hello.</div>'))[0].tagName, 'BODY');
});

test('长段落按字符完整分块，不丢字或拆开表情，也满足百度字节上限', () => {
  const text = '这是中文与表情🙂。'.repeat(700);
  const parts = splitPageText(text);
  assert.equal(parts.join(''), text);
  assert(parts.every(part => Array.from(part).length <= 1600 && new TextEncoder().encode(part).length <= 6000));
  assert(parts.every(part => !/[\uD800-\uDBFF]$/.test(part)));
});

test('网页队列同批去重并缓存，服务或语言更换后不会复用其他方向的结果', async () => {
  const calls = [], results = [];
  const queue = new PageQueue(async (texts, context) => { calls.push({ texts, context }); return texts.map(text => ({ text: `translated ${text}` })); }, (item, result) => results.push({ item, result }), error => { throw error; });
  queue.start({ provider: 'microsoft', target: 'zh' });
  queue.add({ id: '1', text: 'Hello.' }); queue.add({ id: '1', text: 'Hello.' }); queue.add({ id: '2', text: 'World.' });
  await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].texts.length, 2); assert.equal(results.length, 2);
  queue.start({ provider: 'microsoft', target: 'zh' }); queue.add({ id: '3', text: 'Hello.' }); await tick();
  assert.equal(calls.length, 1); assert.equal(results.length, 3);
  queue.start({ provider: 'microsoft', target: 'ja' }); queue.add({ id: '4', text: 'Hello.' }); await tick();
  assert.equal(calls.length, 2);
});

test('关闭或重启网页翻译后，旧响应和错误不能插入或暂停新译文', async () => {
  const first = deferred(), results = [], errors = [], signals = [];
  let count = 0;
  const queue = new PageQueue((_texts, _context, signal) => { signals.push(signal); return ++count === 1 ? first.promise : Promise.resolve([{ text: '新译文' }]); }, item => results.push(item.id), error => errors.push(error));
  queue.start({ provider: 'microsoft', target: 'zh' }); queue.add({ id: 'old', text: 'Old.' }); await tick();
  queue.stop(); assert(signals[0].aborted);
  queue.start({ provider: 'microsoft', target: 'zh' }); queue.add({ id: 'new', text: 'New.' }); await tick();
  first.reject(new Error('late quota')); await tick();
  assert.deepEqual(results, ['new']); assert.deepEqual(errors, []); assert.equal(queue.failed, false);
});

test('服务失败后暂停网页队列，不重复请求；其他服务一次只取一段', async () => {
  let calls = 0, failures = 0;
  const queue = new PageQueue(async texts => { calls++; assert.equal(texts.length, 1); throw new Error('quota'); }, () => {}, () => failures++);
  queue.start({ provider: 'baidu', target: 'zh' }); queue.add({ id: '1', text: 'One.' }); queue.add({ id: '2', text: 'Two.' }); await tick();
  queue.add({ id: '3', text: 'Three.' }); await tick();
  assert.equal(calls, 1); assert.equal(failures, 1); assert.equal(queue.queue.length, 0);
});

test('网页仅取得服务可用性和偏好，不能取得 Key、模型或任意接口地址', () => {
  const settings = normalizeSettings({ provider: 'deepseek', providers: { deepseek: { key: 'secret-key', model: 'private-model' } }, page: { target: 'ja', selection: false, floating: true, endpoint: 'https://evil.test' } });
  const safe = safeSettings(settings);
  assert.equal(safe.provider, 'deepseek'); assert.equal(safe.page.target, 'ja'); assert.equal(safe.page.selection, false);
  assert(safe.services.find(service => service.id === 'deepseek').configured);
  assert(!JSON.stringify(safe).includes('secret-key')); assert(!JSON.stringify(safe).includes('private-model')); assert(!JSON.stringify(safe).includes('evil'));
  assert.deepEqual(normalizeSettings({ page: { target: 'unknown', selection: 'false' } }).page, defaultSettings().page);
});

test('后台校验网页来源和受限翻译消息，不接受子框架、伪造服务及注入配置', () => {
  assert(isPageSender({ id: 'own', tab: { id: 1 }, frameId: 0, url: 'https://example.test' }, 'own'));
  assert(!isPageSender({ id: 'other', tab: { id: 1 }, frameId: 0, url: 'https://example.test' }, 'own'));
  assert(!isPageSender({ id: 'own', tab: { id: 1 }, frameId: 1, url: 'https://example.test' }, 'own'));
  const message = { type: 'ct:selection-translate', provider: 'microsoft', text: 'bank', to: 'zh', mode: 'term', requestId: 'test-1', config: { key: 'evil' }, endpoint: 'https://evil.test', from: 'en' };
  assert.deepEqual(validateTranslationMessage(message), { provider: 'microsoft', to: 'zh', text: 'bank', mode: 'term', from: 'auto' });
  for (const patch of [{ provider: '__proto__' }, { to: 'xx' }, { requestId: '../../1' }, { text: 'x'.repeat(10001) }]) assert.throws(() => validateTranslationMessage({ ...message, ...patch }));
  assert.throws(() => validateTranslationMessage({ ...message, type: 'ct:page-translate', texts: ['x'.repeat(1601)] }));
});

test('微软多段合并使用免 Key 数组，按顺序对应结果；缺项、限流及取消不显示成功', async () => {
  let request;
  const results = await translateMicrosoftBatch({ texts: ['One.', 'Two.'], to: 'zh' }, async (url, options) => {
    request = { url, options }; return new Response(JSON.stringify([{ translations: [{ text: '一。' }] }, { translations: [{ text: '二。' }] }]));
  });
  assert.deepEqual(results.map(result => result.text), ['一。', '二。']);
  assert.deepEqual(JSON.parse(request.options.body), ['One.', 'Two.']); assert.equal(request.options.credentials, 'omit'); assert(!request.options.headers.Authorization);
  await assert.rejects(translateMicrosoftBatch({ texts: ['One.', 'Two.'], to: 'zh' }, async () => new Response('[]')), error => error.code === 'invalid_response');
  await assert.rejects(translateMicrosoftBatch({ texts: ['One.'], to: 'zh' }, async () => new Response('', { status: 429 })), error => error.code === 'rate_limit');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(translateMicrosoftBatch({ texts: ['One.'], to: 'zh', signal: abort.signal }, async (_url, options) => { options.signal.throwIfAborted(); }), error => error.name === 'AbortError');
});

test('技术段落保留内联代码标识符，不把代码块或独立代码作为译文', () => {
  const page = doc('<main><p>The <code>Array</code> object supports <code>Array.map()</code>.</p><p><code>const x = 1;</code></p><div><code>console.log(x);</code></div><pre><code>const code = 2;</code></pre></main>');
  assert.deepEqual(collectPageSegments(page).map(row => row.text), ['The Array object supports Array.map().']);
  assert.equal(page.querySelector('code').textContent, 'Array');
});
