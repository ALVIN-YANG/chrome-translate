import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTermEntries, parseModelTerm, termNotes } from '../src/terms.js';
import { loadWorkspace, saveWorkspace, matchesWorkspace } from '../src/workspace.js';
import { createTranslationTabOpener } from '../public/tabs.js';

test('语境列表保留算法用法及服务译法，不把未经解释的默认译法置顶', () => {
  const entries = buildTermEntries({ text: 'Looking back', candidates: termNotes('回溯', 'zh', 'en') });
  assert.equal(entries[0].text, 'backtracking');
  assert.match(entries[0].context, /算法/);
  assert.equal(entries.at(-1).text, 'Looking back');
  assert.match(entries.at(-1).context, /上下文/);
});

test('与主译文相同的候选保留语境和例句，只展示一次', () => {
  const entries = buildTermEntries({ text: 'bank', candidates: [{ text: 'Bank', context: '银行 · 名词', example: 'Go to the bank.' }, { text: 'river bank', context: '河岸' }] });
  assert.equal(entries.filter(entry => entry.text.toLowerCase() === 'bank').length, 1);
  assert.equal(entries[0].example, 'Go to the bank.');
});

test('模型默认词义也保留例句，并过滤不符合目标语言的例句', () => {
  const data = { translation: 'backtracking', context: '算法 · 名词', example: 'Use backtracking to explore each path.', exampleTranslation: '使用回溯探索每条路径。', alternatives: [] };
  const parsed = parseModelTerm(JSON.stringify(data), 'en');
  assert.equal(buildTermEntries(parsed)[0].exampleTranslation, data.exampleTranslation);
  data.example = '仅中文例句';
  assert.equal(parseModelTerm(JSON.stringify(data), 'en').primary.example, '');
});

const savedDisplay = { sourceText: '回溯', provider: 'microsoft', mode: 'term', targetPreference: 'auto', result: { text: 'Looking back', target: 'en', detected: 'zh', candidateStatus: 'ready', candidates: termNotes('回溯', 'zh', 'en') } };
const memoryStorage = () => {
  let raw;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
};

test('会话恢复保留当前文本和结果，不保存 Key 或其他配置', () => {
  const storage = memoryStorage();
  saveWorkspace({ text: '回溯', target: 'auto', config: { key: 'private-test-key' }, displayed: { ...savedDisplay, key: 'private-test-key', result: { ...savedDisplay.result, secret: 'private-test-key' } } }, storage);
  const restored = loadWorkspace(storage);
  assert.equal(restored.text, '回溯');
  assert.equal(restored.displayed.result.candidates[0].text, 'backtracking');
  assert(!storage.getItem().includes('private-test-key'));
  assert(matchesWorkspace(restored.displayed, '回溯', 'auto', 'microsoft'));
  assert(!matchesWorkspace(restored.displayed, '新输入', 'auto', 'microsoft'));
  assert(!matchesWorkspace(restored.displayed, '回溯', 'ja', 'microsoft'));
  assert(!matchesWorkspace(restored.displayed, '回溯', 'auto', 'zhipu'));
});

test('会话中的未完成词典请求降级为可用结果，损坏或禁用存储不阻止翻译', () => {
  const storage = memoryStorage();
  saveWorkspace({ text: '回溯', target: 'auto', displayed: { ...savedDisplay, result: { ...savedDisplay.result, candidateStatus: 'loading' } } }, storage);
  assert.equal(loadWorkspace(storage).displayed.result.candidateStatus, 'unavailable');
  storage.setItem('', '{invalid');
  assert.equal(loadWorkspace(storage), null);
  assert.equal(saveWorkspace({ text: 'Hello', target: 'auto' }, { setItem() { throw new Error('quota'); } }), false);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
    assert.equal(loadWorkspace(), null);
    assert.equal(saveWorkspace({ text: 'Hello', target: 'auto' }), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});

test('会话保留用户选择的服务，即使结果来自前一个服务也不擅自更换选择', () => {
  const storage = memoryStorage();
  saveWorkspace({ text: '新输入', target: 'auto', provider: 'deepseek', displayed: savedDisplay }, storage);
  const restored = loadWorkspace(storage);
  assert.equal(restored.provider, 'deepseek');
  assert.equal(restored.displayed.provider, 'microsoft');
  assert(!matchesWorkspace(restored.displayed, restored.text, restored.target, restored.provider));
});

function fakeBrowser(contexts = []) {
  const calls = [], tabs = new Map();
  return {
    calls, tabs,
    runtime: { getContexts: async () => contexts },
    tabsAPI: {
      create: async options => { const tab = { id: 10 + tabs.size, windowId: 1, pendingUrl: options.url }; tabs.set(tab.id, tab); calls.push(['create', options]); return tab; },
      get: async id => { if (!tabs.has(id)) throw new Error('closed'); return tabs.get(id); },
      update: async (id, options) => { calls.push(['activate', id, options]); return { id }; },
    },
    windows: { update: async (id, options) => { calls.push(['focus', id, options]); } },
  };
}
const pageUrl = 'chrome-extension://fixture/index.html';
const opener = browser => createTranslationTabOpener({ runtime: browser.runtime, tabs: browser.tabsAPI, windows: browser.windows }, pageUrl);

test('优先复用当前窗口的翻译页，识别设置页锚点，不复用其他扩展页面', async () => {
  const browser = fakeBrowser([{ documentUrl: pageUrl, tabId: 2, windowId: 2 }, { documentUrl: `${pageUrl}#settings`, tabId: 3, windowId: 1 }, { documentUrl: 'chrome-extension://fixture/other.html', tabId: 4, windowId: 1 }]);
  assert.equal(await opener(browser)({ windowId: 1 }), 3);
  assert.deepEqual(browser.calls.map(call => call[0]), ['activate', 'focus']);
});

test('快速连续打开时只新建一页，即使页面上下文尚未注册', async () => {
  const browser = fakeBrowser();
  const open = opener(browser);
  assert.deepEqual(await Promise.all([open(), open(), open()]), [10, 10, 10]);
  assert.equal(browser.calls.filter(call => call[0] === 'create').length, 1);
  browser.tabs.set(10, { id: 10, url: 'https://example.invalid', windowId: 1 });
  assert.equal(await open(), 11, '已导航离开的标签页不能当作翻译页');
});

test('查找后页面被关闭会新建；聚焦窗口失败不会重复开页', async () => {
  const browser = fakeBrowser([{ documentUrl: pageUrl, tabId: 3, windowId: 1 }]);
  browser.tabsAPI.update = async () => { throw new Error('closed'); };
  assert.equal(await opener(browser)(), 10);
  browser.tabsAPI.update = async () => ({ id: 3 });
  browser.windows.update = async () => { throw new Error('focus unavailable'); };
  browser.calls.length = 0;
  assert.equal(await opener(browser)(), 3);
  assert.equal(browser.calls.length, 0);
});
