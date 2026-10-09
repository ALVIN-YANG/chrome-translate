import { LANGUAGES } from './language.js';
import { pageRpc } from './page-rpc.js';
const $ = id => document.getElementById(id);
let tab;
let settings;
let state = { active: false };
let available = false;
let busy = false;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function render() {
  $('translate').textContent = state.active ? '显示原文' : '翻译当前网页';
  $('translate').disabled = !available || busy;
  $('all').hidden = !available || state.scope === 'all' && state.active;
  if (available) status(state.error || (state.active ? `已翻译 ${state.translated} 段 · 滚动时继续翻译` : '自动识别原文，优先翻译正文'), Boolean(state.error));
}
async function refresh() {
  if (!tab?.id) return;
  try { state = await chrome.tabs.sendMessage(tab.id, { type: 'ct:status' }, { frameId: 0 }); available = Boolean(state); }
  catch { available = false; status('此页暂不能翻译。请刷新普通网页后重试；内置页、插件市场和 PDF 不支持。'); }
  render();
}
async function update(patch) {
  try {
    settings = await pageRpc('ct:settings-update', patch);
    // 等当前页收到变更，不自动再次发送旧网页。
    await refresh();
  } catch (error) { status(error.message, true); }
}
async function command(scope) {
  if (busy) return;
  busy = true; render();
  try { state = await pageRpc('ct:page-command', { tabId: tab.id, scope }); render(); }
  catch (error) { status(error.message, true); }
  finally { busy = false; $('translate').disabled = !available; }
}
async function initialize() {
  settings = await pageRpc('ct:settings-get');
  for (const service of settings.services) {
    const option = new Option(`${service.name}${service.configured ? '' : '（未配置）'}`, service.id);
    $('provider').add(option);
  }
  for (const [id, language] of Object.entries(LANGUAGES)) $('target').add(new Option(language.label, id));
  $('provider').value = settings.provider;
  $('target').value = settings.page.target;
  $('selection').checked = settings.page.selection;
  $('floating').checked = settings.page.floating;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refresh();
  $('provider').addEventListener('change', () => update({ provider: $('provider').value }));
  $('target').addEventListener('change', () => update({ page: { target: $('target').value } }));
  for (const key of ['selection', 'floating']) $(key).addEventListener('change', () => update({ page: { [key]: $(key).checked } }));
  $('translate').addEventListener('click', () => command('smart'));
  $('all').addEventListener('click', async () => {
    // 全页面模式始终开启；已经翻译正文时先恢复，再切换范围。
    if (state.active) await command('smart');
    await command('all');
  });
  $('open').addEventListener('click', () => pageRpc('ct:open-page').then(() => window.close()).catch(error => status(error.message, true)));
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage().then(() => window.close()));
  const timer = setInterval(() => { if (!busy && state.active) refresh(); }, 1200);
  window.addEventListener('pagehide', () => clearInterval(timer));
}
initialize().catch(error => status(error.message, true));
