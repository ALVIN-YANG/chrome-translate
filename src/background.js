import { createTranslationTabOpener } from '../public/tabs.js';
import { loadSettings, updateSettings, SETTINGS_KEY } from './settings.js';
import { translate, translateMicrosoftBatch } from './providers.js';
import { safeSettings, validateTranslationMessage, isPageSender } from './page-protocol.js';
import { dictionaryUrl } from './dictionary.js';
import { SPEECH_SETTINGS_KEY, loadSpeechSettings, saveSpeechSettings, publicSpeechSettings } from './speech-config.js';
import { speechMessage, stopSpeechForTab } from './cloud-speech-worker.js';
import { FLOATING_POSITION_KEY, normalizeFloatingPosition } from './floating-button.js';

const openTranslationPage = createTranslationTabOpener(chrome, chrome.runtime.getURL('index.html'));
const requests = new Map();
const owner = sender => `${sender.tab.id}:${sender.documentId || sender.frameId}`;
const trusted = sender => sender?.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
async function sendPage(tabId, message) {
  try { return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 }); }
  catch { throw new Error('当前页面无法翻译。请刷新普通网页后重试；浏览器内置页、插件市场和 PDF 页面不支持。'); }
}
async function handle(message, sender) {
  const pageSender = isPageSender(sender, chrome.runtime.id);
  const extensionSender = trusted(sender);
  if (!pageSender && !extensionSender) throw new Error('不支持当前页面。');
  if (/^ct:(speech-|audio-)/.test(message.type)) return speechMessage(message, sender, { trusted: extensionSender, pageSender });
  if (message.type === 'ct:voice-public') return publicSpeechSettings(await loadSpeechSettings(), await loadSettings());
  if (message.type === 'ct:voice-load' && extensionSender) return loadSpeechSettings();
  if (message.type === 'ct:voice-save' && extensionSender) { await saveSpeechSettings(message.settings); return publicSpeechSettings(await loadSpeechSettings(), await loadSettings()); }
  if (message.type === 'ct:voice-open') { await chrome.tabs.create({ url: chrome.runtime.getURL('services.html') }); return {}; }
  if (message.type === 'ct:settings-get') return { ...safeSettings(await loadSettings()), speech: publicSpeechSettings(await loadSpeechSettings(), await loadSettings()) };
  if (message.type === 'ct:floating-position-get') return normalizeFloatingPosition((await chrome.storage.local.get(FLOATING_POSITION_KEY))[FLOATING_POSITION_KEY]);
  if (message.type === 'ct:floating-position-save' && pageSender) {
    const position = normalizeFloatingPosition(message.position);
    if (!position) throw new Error('悬浮按钮位置无效。');
    await chrome.storage.local.set({ [FLOATING_POSITION_KEY]: position });
    return {};
  }
  if (message.type === 'ct:open-page') {
    await openTranslationPage(sender.tab);
    return {};
  }
  if (message.type === 'ct:settings-update' && extensionSender) {
    return safeSettings(await updateSettings({ provider: message.provider, page: message.page }));
  }
  if (message.type === 'ct:page-command' && extensionSender && Number.isInteger(message.tabId)) {
    return sendPage(message.tabId, { type: 'ct:toggle', scope: message.scope === 'all' ? 'all' : 'smart' });
  }
  if (!pageSender) throw new Error('翻译操作需要普通网页。');
  const prefix = owner(sender);
  if (message.type === 'ct:cancel') {
    requests.get(`${prefix}:${message.requestId}`)?.abort();
    return {};
  }
  if (message.type === 'ct:dictionary') {
    if (typeof message.text !== 'string' || !message.text.trim() || Array.from(message.text).length > 100) throw new Error('词典参数无效。');
  } else validateTranslationMessage(message);
  if (typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId)) throw new Error('请求无效。');
  const key = `${prefix}:${message.requestId}`;
  if (requests.has(key) || [...requests.keys()].filter(id => id.startsWith(`${prefix}:`)).length >= 3) throw new Error('当前页面的请求正在进行，请稍后重试。');
  const abort = new AbortController();
  requests.set(key, abort);
  try {
    if (message.type === 'ct:dictionary') {
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(6000)]);
      const response = await fetch(dictionaryUrl(message.text), { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('词典暂时不可用。');
      const html = await response.text();
      if (html.length > 1500000) throw new Error('词典响应过长。');
      return { html };
    }
    const settings = await loadSettings();
    // 网页只传服务 ID 和文本。密钥、模型及固定服务地址由后台读取。
    const config = settings.providers[message.provider];
    if (message.type === 'ct:page-translate') {
      if (message.provider === 'microsoft') return await translateMicrosoftBatch({ texts: message.texts, to: message.to, signal: abort.signal });
      const results = [];
      for (const text of message.texts) results.push(await translate({ provider: message.provider, config, text, to: message.to, mode: 'text', signal: abort.signal, timeoutMs: 25000 }));
      return results;
    }
    return await translate({ ...validateTranslationMessage(message), config, signal: abort.signal, timeoutMs: 25000 });
  } finally { requests.delete(key); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target === 'offscreen' || ['ct:speech-state', 'ct:voice-settings'].includes(message.type)) return;
  if (typeof message?.type !== 'string' || !message.type.startsWith('ct:')) return;
  handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: { code: error.code || 'unavailable', message: error.name === 'AbortError' ? '请求已取消。' : error.message || '操作未完成，请重试。' } }));
  return true; // 兼容 Chrome 120 的异步消息回应。
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'ct-page', title: '翻译网页 / 显示原文', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  chrome.contextMenus.create({ id: 'ct-selection', title: '翻译选中文字', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || info.frameId > 0) return;
  const message = info.menuItemId === 'ct-selection'
    ? { type: 'ct:selection-open', text: info.selectionText }
    : { type: 'ct:toggle', scope: 'smart' };
  sendPage(tab.id, message).catch(() => {});
});
chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) sendPage(tab.id, command === 'translate-all' ? { type: 'ct:start', scope: 'all' } : { type: 'ct:toggle', scope: 'smart' }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  stopSpeechForTab(tabId);
  for (const [key, abort] of requests) if (key.startsWith(`${tabId}:`)) abort.abort();
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[SETTINGS_KEY] && !changes[SPEECH_SETTINGS_KEY]) return;
  const settings = safeSettings(await loadSettings());
  settings.speech = publicSpeechSettings(await loadSpeechSettings(), await loadSettings());
  chrome.runtime.sendMessage({ type: 'ct:voice-settings', settings: settings.speech }).catch(() => {});
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'ct:settings', settings }, { frameId: 0 })));
});
