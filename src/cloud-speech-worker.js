import { loadAssistantSettings, selectedService, normalizeAssistantSettings } from './assistant-config.js';
import { loadSettings } from './settings.js';
let active = null, pending = null, sequence = 0, creating, closing;
const SESSION_KEY = 'selection-audio-session';
const ready = chrome.storage.session.get(SESSION_KEY).then(data => { active = data[SESSION_KEY] || null; });
const storeActive = async value => { active = value; await chrome.storage.session.set({ [SESSION_KEY]: value }); };
const playerURL = () => chrome.runtime.getURL('offscreen.html');
const ownerKey = sender => `${sender.tab?.id ?? 'extension'}:${sender.documentId || sender.url}`;
const hasPlayer = async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [playerURL()] })).length > 0;
async function ensurePlayer() {
  if (closing) await closing;
  if (await hasPlayer()) return;
  if (!creating) creating = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: '为用户主动朗读生成的语音创建 Blob URL，管理音频播放与停止，空闲后释放。' }).finally(() => { creating = null; });
  await creating;
}
async function notifyOwner(state) {
  if (!active || state.playId !== active.playId) return;
  const message = { type: 'ct:speech-state', state };
  if (active.sender.tab?.id) await chrome.tabs.sendMessage(active.sender.tab.id, message, active.sender.documentId ? { documentId: active.sender.documentId } : { frameId: 0 }).catch(() => {});
  else await chrome.runtime.sendMessage(message).catch(() => {});
}
async function stopActive(run = sequence) {
  if (active) await notifyOwner({ status: 'idle', playId: active.playId, key: active.key });
  if (run !== sequence) return;
  await storeActive(null);
  if (await hasPlayer() && run === sequence) await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ct:audio-stop' }).catch(() => {});
}
export async function speechMessage(message, sender, { trusted, pageSender }) {
  await ready;
  const fromPlayer = sender.url === playerURL() && sender.id === chrome.runtime.id;
  if (message.type === 'ct:audio-event' && fromPlayer) { await notifyOwner(message.state); return {}; }
  if (message.type === 'ct:audio-close-idle' && fromPlayer) {
    if (await hasPlayer()) {
      const state = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ct:audio-status' }).catch(() => null);
      if (state && ['idle', 'error'].includes(state.status) && state.playId === message.playId) {
        closing = chrome.offscreen.closeDocument().finally(() => { closing = null; }); await closing;
      }
    }
    return {};
  }
  if (!trusted && !pageSender) throw new Error('当前页面不能使用朗读。');
  if (message.type === 'ct:speech-stop' || message.type === 'ct:speech-pause') {
    if (message.type === 'ct:speech-stop' && pending?.playId === message.playId && ownerKey(sender) === ownerKey(pending.sender)) { sequence++; pending = null; await stopActive(); return {}; }
    if (pending && pending.playId !== message.playId) return {};
    if (!active || ownerKey(sender) !== ownerKey(active.sender) || message.playId !== active.playId) return {};
    if (message.type === 'ct:speech-stop') { sequence++; await stopActive(); return {}; }
    return chrome.runtime.sendMessage({ target: 'offscreen', type: 'ct:audio-pause' });
  }
  if (message.type !== 'ct:speech-start' && message.type !== 'ct:speech-preview') throw new Error('朗读操作无效。');
  if (message.type === 'ct:speech-preview' && !trusted) throw new Error('试听只能从插件设置发起。');
  if (typeof message.text !== 'string' || !message.text.trim() || Array.from(message.text).length > 10000 || typeof message.playId !== 'string' || !/^[\w-]{1,80}$/.test(message.playId) || typeof message.key !== 'string' || message.key.length > 100) throw new Error('朗读内容无效，单次最多 10,000 个字符。');
  const run = ++sequence;
  pending = { sender, playId: message.playId };
  await stopActive(run);
  if (run !== sequence) return { cancelled: true };
  const settings = message.type === 'ct:speech-preview' ? normalizeAssistantSettings(message.settings) : await loadAssistantSettings();
  const config = selectedService(settings, 'tts', await loadSettings());
  if (config.protocol === 'system') throw new Error('系统声音应在当前页面中播放。');
  await ensurePlayer();
  if (run !== sequence) return { cancelled: true };
  pending = null;
  await storeActive({ sender: { tab: sender.tab?.id ? { id: sender.tab.id } : undefined, documentId: sender.documentId, url: sender.documentId ? undefined : sender.url }, playId: message.playId, key: message.key });
  if (run !== sequence) return { cancelled: true };
  await notifyOwner({ status: 'loading', playId: message.playId, key: message.key });
  const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ct:audio-play', job: { playId: message.playId, key: message.key, text: message.text.trim(), language: message.language, config, speed: settings.tts.speed } });
  if (result.error) throw new Error(result.error);
  return result;
}
export function stopSpeechForTab(tabId) {
  if (pending?.sender.tab?.id === tabId) { sequence++; pending = null; }
  if (active?.sender.tab?.id === tabId && !pending) { sequence++; stopActive().catch(() => {}); }
}
