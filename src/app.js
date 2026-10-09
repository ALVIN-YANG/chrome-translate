import { TranslationController } from './controller.js';
import { PROVIDERS, isConfigured, translate } from './providers.js';
import { LANGUAGES, normalizeLanguage, resolveDirection } from './language.js';
import { defaultSettings, isExtension, loadSettings, normalizeSettings, saveSettings } from './settings.js';
import { resolveInputMode } from './terms.js';
import { SystemSpeech } from './speech.js';

const $ = id => document.getElementById(id);
const input = $('source-text');
const result = $('result-text');
const dialog = $('settings-dialog');
// 主界面和设置使用同一服务列表，新增服务时不会遗漏其中一个入口。
for (const [id, provider] of Object.entries(PROVIDERS)) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.provider = id;
  button.textContent = provider.name;
  button.setAttribute('aria-pressed', String(id === 'microsoft'));
  document.querySelector('.provider-tabs').append(button);
  const option = document.createElement('option');
  option.value = id; option.textContent = provider.name;
  $('settings-provider').append(option);
}
let settings = defaultSettings();
let ready = false;
let composing = false;
let currentDirection;
let drafts;
let editingProvider;
let testAbort;
let testVersion = 0;
let toastTimer;
let copyVersion = 0;
let currentMode = 'text';
let persistQueue = Promise.resolve();
const verified = new Map();
const speech = new SystemSpeech(renderSpeech);

function signature(config) { return JSON.stringify(config); }
function isVerified(provider, config) { return verified.get(provider) === signature(config); }
function notice(message) { $('page-notice').textContent = message; $('page-notice').hidden = !message; }
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').querySelector('span').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2400);
}
function persist(next) {
  const snapshot = structuredClone(next);
  persistQueue = persistQueue.catch(() => {}).then(() => saveSettings(snapshot));
  return persistQueue;
}

function renderProvider() {
  const provider = PROVIDERS[settings.provider];
  for (const button of document.querySelectorAll('[data-provider]')) {
    button.setAttribute('aria-pressed', String(button.dataset.provider === settings.provider));
  }
  $('provider-badge').textContent = provider.badge;
  const configured = isConfigured(settings.provider, settings.providers[settings.provider]);
  $('config-shortcut').dataset.ready = String(configured);
  $('config-label').textContent = isVerified(settings.provider, settings.providers[settings.provider]) ? '已连接' : !provider.fields.length ? '无需配置' : configured ? '已配置' : '未配置';
  $('config-shortcut').setAttribute('aria-label', provider.fields.length ? `配置${provider.name}` : `${provider.name}服务信息`);
}

function updateDirection() {
  const target = $('target-language').value;
  currentDirection = resolveDirection(input.value, 'auto', target);
  $('source-language').textContent = '自动识别';
  const automaticTarget = resolveDirection(input.value).to;
  $('target-language').options[0].textContent = `${LANGUAGES[automaticTarget].label}（自动）`;
  $('direction-title').textContent = target === 'auto' ? '自动翻译' : `译为${LANGUAGES[target].name}`;
  $('direction-description').textContent = target === 'auto' ? '中文默认译为英文，其他语言默认译为中文' : '原文自动识别，词语与句段自动判断';
  const count = Array.from(input.value).length;
  $('character-count').textContent = `${count.toLocaleString('en-US')} / 10,000`;
  $('character-count').classList.toggle('is-over-limit', count > 10000);
  $('clear-text').disabled = !input.value;
}

function renderTranslation(state) {
  if (state.phase === 'alternatives') { renderAlternatives(state.result); return; }
  speech.stop();
  copyVersion++;
  for (const id of ['empty-state', 'loading-state', 'error-state', 'result-text']) $(id).hidden = true;
  result.textContent = '';
  $('alternatives-panel').hidden = true;
  $('alternatives-list').replaceChildren();
  $('copy-result').disabled = true;
  $('read-result').disabled = true;
  $('result-detail').textContent = '';
  $('translation-status').dataset.status = state.status;
  document.querySelector('.result-body').setAttribute('aria-busy', String(state.status === 'loading'));
  if (state.status === 'idle') {
    $('empty-state').hidden = false;
    $('translation-status').textContent = composing ? '正在输入' : '等待输入';
  } else if (state.status === 'loading') {
    $('loading-state').hidden = false;
    $('translation-status').textContent = '正在翻译';
  } else if (state.status === 'success') {
    currentDirection.to = state.result.target || currentDirection.to;
    const detected = normalizeLanguage(state.result.detected);
    if (detected) currentDirection.detected = detected;
    $('source-language').textContent = detected ? `自动识别 · ${LANGUAGES[detected].name}` : '自动识别';
    if ($('target-language').value === 'auto') $('target-language').options[0].textContent = `${LANGUAGES[currentDirection.to].label}（自动）`;
    result.hidden = false;
    // 译文始终按纯文本显示，包括来自模型的 HTML 或脚本。
    result.textContent = state.result.text;
    result.lang = currentDirection.to;
    result.dir = currentDirection.to === 'ar' ? 'rtl' : 'auto';
    $('copy-result').disabled = false;
    $('read-result').disabled = !speech.supported;
    $('translation-status').textContent = '翻译完成';
    $('result-detail').textContent = PROVIDERS[settings.provider].name;
    renderAlternatives(state.result);
    if (currentDirection.from !== currentDirection.to) {
      verified.set(settings.provider, signature(settings.providers[settings.provider]));
      renderProvider();
    }
  } else {
    $('error-state').hidden = false;
    $('translation-status').textContent = '未完成';
    const isConfigError = state.error.code === 'configuration';
    $('error-title').textContent = isConfigError ? '配置后即可翻译' : '翻译未完成';
    $('error-message').textContent = state.error.message;
    $('error-settings').hidden = !PROVIDERS[settings.provider].fields.length || !['configuration', 'auth', 'quota', 'invalid'].includes(state.error.code);
    $('error-settings').textContent = isConfigError ? `配置${PROVIDERS[settings.provider].name}` : '服务设置';
    $('retry').hidden = ['configuration', 'too_long', 'empty', 'truncated'].includes(state.error.code);
  }
}

function renderAlternatives(translation) {
  if (currentMode !== 'term' || currentDirection.detected === currentDirection.to) return;
  const candidates = (translation.candidates || []).filter(candidate => candidate.text.trim().toLocaleLowerCase('en-US') !== translation.text.trim().toLocaleLowerCase('en-US'));
  $('alternatives-panel').hidden = false;
  const list = $('alternatives-list');
  const existing = new Map([...list.children].map(row => [row.dataset.candidate, row]));
  const retained = new Set();
  $('dictionary-link').hidden = !translation.dictionaryUrl;
  if (translation.dictionaryUrl) $('dictionary-link').href = translation.dictionaryUrl;
  for (const candidate of candidates) {
    const candidateKey = JSON.stringify([candidate.text, candidate.context || '', candidate.example || '', candidate.exampleLanguage || currentDirection.to, candidate.exampleTranslation || '', candidate.source || '', candidate.sourceUrl || '']);
    if (existing.has(candidateKey)) { retained.add(existing.get(candidateKey)); continue; }
    const row = document.createElement('article');
    row.className = 'alternative-entry';
    row.dataset.candidate = candidateKey;
    const heading = document.createElement('div'); heading.className = 'alternative-heading';
    const title = document.createElement('span'); title.className = 'alternative-text'; title.textContent = candidate.text;
    title.lang = currentDirection.to; title.dir = currentDirection.to === 'ar' ? 'rtl' : 'auto';
    const actions = document.createElement('div'); actions.className = 'alternative-actions';
    const read = document.createElement('button');
    read.type = 'button'; read.className = 'icon-button speech-button'; read.disabled = !speech.supported;
    read.dataset.speechKey = `candidate:${candidate.text}`; read.dataset.speechLabel = candidate.text;
    read.title = '用系统声音朗读'; read.append(createIcon('speaker'));
    read.addEventListener('click', () => toggleSpeech(candidate.text, read.dataset.speechKey));
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'icon-button'; copy.title = '复制此译法';
    copy.setAttribute('aria-label', `复制 ${candidate.text}`); copy.append(createIcon('copy'));
    copy.addEventListener('click', () => copyText(candidate.text));
    actions.append(read, copy); heading.append(title, actions);
    const context = document.createElement('span'); context.className = 'alternative-context'; context.textContent = candidate.context || '可选译法';
    row.append(heading, context);
    if (candidate.example) {
      const exampleLanguage = candidate.exampleLanguage || currentDirection.to;
      const exampleRow = document.createElement('div'); exampleRow.className = 'alternative-example-row';
      const example = document.createElement('span'); example.className = 'alternative-example'; example.textContent = `例：${candidate.example}`;
      example.lang = exampleLanguage; example.dir = exampleLanguage === 'ar' ? 'rtl' : 'auto';
      const readExample = document.createElement('button');
      readExample.type = 'button'; readExample.className = 'icon-button speech-button example-speech'; readExample.disabled = !speech.supported;
      readExample.dataset.speechKey = `example:${candidate.text}:${candidate.example}`;
      readExample.dataset.speechLabel = candidate.text; readExample.dataset.speechKind = 'example';
      readExample.title = '朗读例句'; readExample.append(createIcon('speaker'));
      readExample.addEventListener('click', () => toggleSpeech(candidate.example, readExample.dataset.speechKey, exampleLanguage));
      exampleRow.append(example, readExample); row.append(exampleRow);
      if (candidate.exampleTranslation) {
        const explanation = document.createElement('span'); explanation.className = 'alternative-example-translation'; explanation.textContent = candidate.exampleTranslation; row.append(explanation);
      }
    }
    if (candidate.source) {
      const source = document.createElement('span'); source.className = 'alternative-source'; source.textContent = candidate.source; row.append(source);
    }
    list.append(row); retained.add(row);
  }
  // 词典晚到只追加新词义，保留原有文本节点，避免打断选中复制。
  for (const row of [...list.children]) if (!retained.has(row)) row.remove();
  renderSpeech(speech.state);
  const messages = {
    loading: '正在查找词典候选…',
    unavailable: '词典暂时不可用，已保留当前译文和可用的术语补充。',
    empty: settings.provider === 'baidu' ? '当前服务只返回一项译文；可补充上下文，或切换其他服务查询词义。' : '当前只返回一项译文，可补充上下文进一步确定词义。',
    ready: '',
  };
  $('alternatives-status').textContent = messages[translation.candidateStatus] || '';
  if (!candidates.length && translation.candidateStatus === 'ready') $('alternatives-status').textContent = '当前只查到一个可靠译法，可以补充上下文进一步确定词义。';
}

const controller = new TranslationController(renderTranslation);

function translateInput(force = false) {
  updateDirection();
  currentMode = resolveInputMode(input.value);
  if (!ready || composing) return;
  if (!input.value.trim() || !currentDirection.detected) {
    controller.reset();
    $('empty-description').textContent = input.value.trim() ? '请输入包含文字的文本' : '自动识别原文，即贴即译';
    return;
  }
  controller.run({
    provider: settings.provider, config: settings.providers[settings.provider], text: input.value,
    from: currentDirection.from, to: currentDirection.to,
    mode: currentMode, automaticTarget: $('target-language').value === 'auto',
    ...(!isExtension && ['127.0.0.1', 'localhost'].includes(location.hostname) ? { dictionaryEndpoint: `${location.origin}/api/dictionary?text=${encodeURIComponent(input.value.trim())}` } : {}),
  }, { force });
}

input.addEventListener('input', event => {
  if (composing || event.isComposing) { updateDirection(); return; }
  translateInput();
});
input.addEventListener('compositionstart', () => { composing = true; controller.reset(); });
input.addEventListener('compositionend', () => { composing = false; translateInput(); });
$('target-language').addEventListener('change', () => translateInput());
$('retry').addEventListener('click', () => translateInput(true));
$('clear-text').addEventListener('click', () => {
  input.value = ''; composing = false; controller.reset(); updateDirection(); input.focus();
});
for (const button of document.querySelectorAll('[data-provider]')) {
  button.addEventListener('click', async () => {
    if (!ready || settings.provider === button.dataset.provider) return;
    settings.provider = button.dataset.provider;
    renderProvider(); translateInput();
    try { await persist(settings); notice(''); }
    catch { notice('服务选择未能保存。当前仍可使用，重新打开页面后需再次选择。'); }
  });
}
$('copy-result').addEventListener('click', () => copyText(result.textContent));
$('read-result').addEventListener('click', () => toggleSpeech(result.textContent, 'result'));

async function copyText(text) {
  const version = copyVersion;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (version === copyVersion) toast('译文已复制');
  } catch { notice('未能写入剪贴板，请选中译文后手动复制。'); }
}

function toggleSpeech(text, key, language = currentDirection.to) {
  if (speech.state.key === key) speech.stop();
  else speech.speak(text, language, key);
}

function renderSpeech(state) {
  for (const button of document.querySelectorAll('[data-speech-key]')) {
    const active = state.key === button.dataset.speechKey;
    const suffix = button.dataset.speechKind === 'example' ? `例句 ${button.dataset.speechLabel}` : ` ${button.dataset.speechLabel}`;
    button.setAttribute('aria-label', active ? `停止朗读${button.dataset.speechKey === 'result' ? '' : suffix}` : `朗读${button.dataset.speechKey === 'result' ? '译文' : suffix}`);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('use').setAttribute('href', active ? '#i-stop' : '#i-speaker');
    const label = button.querySelector('span');
    if (label) label.textContent = active ? '停止' : '朗读';
  }
  $('speech-status').textContent = state.message || '';
  $('speech-status').dataset.status = state.status;
  $('speech-status').hidden = !$('speech-status').textContent;
}

function readDraft() {
  if (!drafts || !editingProvider) return;
  for (const field of PROVIDERS[editingProvider].fields) drafts[editingProvider][field.name] = $(`field-${field.name}`).value.trim();
}

function stopConnectionTest() {
  testVersion++;
  testAbort?.abort();
  $('test-connection').disabled = false;
  $('test-connection').textContent = '测试连接';
}

function connectionStatus(state, badge, message) {
  $('connection-status').dataset.state = state;
  $('connection-badge').textContent = badge;
  $('connection-message').textContent = message;
}

function showCurrentConnection() {
  if (isVerified(editingProvider, drafts[editingProvider])) connectionStatus('success', '已验证', '此配置已成功返回译文');
  else if (!PROVIDERS[editingProvider].fields.length) connectionStatus('idle', '免配置', '可以直接翻译，也可以先测试连接');
  else connectionStatus('idle', '待验证', '尚未验证此服务的翻译调用');
}

function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
}

function renderFields() {
  const provider = PROVIDERS[editingProvider];
  const keyless = !provider.fields.length;
  $('service-description').textContent = provider.description;
  $('service-link').hidden = !provider.url;
  if (provider.url) {
    $('service-link').href = provider.url;
    $('service-link').querySelector('span').textContent = provider.link;
  } else $('service-link').removeAttribute('href');
  document.querySelector('.privacy-note').hidden = keyless;
  $('save-settings').textContent = keyless ? '完成' : '保存配置';
  $('connection-hint').textContent = keyless ? '测试连接会发送一次“Hello”翻译请求，无需账号或 Key。' : '测试连接会发送一次“Hello”翻译请求，并使用对应服务额度。';
  $('service-fields').replaceChildren();
  for (const field of provider.fields) {
    const group = document.createElement('div');
    const label = document.createElement('label');
    label.className = 'field-label'; label.htmlFor = `field-${field.name}`; label.textContent = field.label;
    const wrap = document.createElement('div');
    const fieldInput = document.createElement('input');
    fieldInput.id = `field-${field.name}`; fieldInput.name = field.name;
    fieldInput.className = 'field-input'; fieldInput.type = field.secret ? 'password' : 'text';
    fieldInput.autocomplete = 'off'; fieldInput.spellcheck = false;
    fieldInput.setAttribute('autocapitalize', 'off');
    fieldInput.placeholder = field.placeholder; fieldInput.value = drafts[editingProvider][field.name];
    fieldInput.maxLength = field.name === 'model' || field.name === 'region' ? 128 : 2048;
    wrap.append(fieldInput);
    if (field.secret) {
      wrap.className = 'input-wrap';
      const show = document.createElement('button');
      show.type = 'button'; show.className = 'icon-button'; show.setAttribute('aria-label', `显示${field.label}`); show.setAttribute('aria-pressed', 'false');
      show.append(createIcon('eye'));
      show.addEventListener('click', () => {
        const visible = fieldInput.type === 'password';
        fieldInput.type = visible ? 'text' : 'password';
        show.setAttribute('aria-label', `${visible ? '隐藏' : '显示'}${field.label}`); show.setAttribute('aria-pressed', String(visible));
      });
      wrap.append(show);
    }
    group.append(label, wrap);
    if (field.help) {
      const help = document.createElement('p'); help.className = 'field-help'; help.id = `help-${field.name}`; help.textContent = field.help;
      fieldInput.setAttribute('aria-describedby', help.id); group.append(help);
    }
    $('service-fields').append(group);
  }
  showCurrentConnection();
}

function openSettings() {
  if (!ready || dialog.open) return;
  drafts = structuredClone(settings.providers);
  editingProvider = settings.provider;
  $('settings-provider').value = editingProvider;
  renderFields(); dialog.showModal();
}
for (const id of ['open-settings', 'config-shortcut', 'error-settings']) $(id).addEventListener('click', openSettings);
$('close-settings').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog && event.offsetX < 0) dialog.close(); });
dialog.addEventListener('close', () => {
  stopConnectionTest(); drafts = null; $('service-fields').replaceChildren();
  if (location.hash === '#settings') history.replaceState(null, '', location.pathname);
});
$('settings-provider').addEventListener('change', () => {
  stopConnectionTest(); readDraft(); editingProvider = $('settings-provider').value; renderFields();
});
$('service-fields').addEventListener('input', () => { stopConnectionTest(); readDraft(); showCurrentConnection(); });
$('test-connection').addEventListener('click', async () => {
  readDraft(); stopConnectionTest();
  const version = testVersion;
  const provider = editingProvider;
  const config = structuredClone(drafts[provider]);
  testAbort = new AbortController();
  const signal = testAbort.signal;
  $('test-connection').disabled = true; $('test-connection').textContent = '测试中…';
  connectionStatus('loading', '测试中', '正在发送测试文本并等待译文');
  try {
    await translate({ provider, config, text: 'Hello', from: 'en', to: 'zh', signal, timeoutMs: 30000 });
    if (version !== testVersion) return;
    verified.set(provider, signature(config));
    connectionStatus('success', '已验证', PROVIDERS[provider].fields.length ? '测试翻译成功；保存后可使用这份配置' : '测试翻译成功，可直接使用');
  } catch (error) {
    if (version !== testVersion || signal.aborted) return;
    connectionStatus('error', '未通过', error.message || '连接未完成，请检查配置后重试。');
  } finally {
    if (version === testVersion) { $('test-connection').disabled = false; $('test-connection').textContent = '测试连接'; }
  }
});
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); readDraft(); stopConnectionTest();
  const next = normalizeSettings({ provider: settings.provider, providers: drafts });
  $('save-settings').disabled = true;
  try {
    await persist(next);
    settings = next;
    renderProvider(); dialog.close(); notice(''); toast('配置已保存'); translateInput();
  } catch { connectionStatus('error', '未保存', '无法保存配置，请检查浏览器存储后重试。'); }
  finally { $('save-settings').disabled = false; }
});

window.addEventListener('pagehide', () => { controller.reset(); stopConnectionTest(); });
window.addEventListener('hashchange', () => { if (location.hash === '#settings') openSettings(); });

async function init() {
  for (const [code, language] of Object.entries(LANGUAGES)) {
    const option = document.createElement('option'); option.value = code; option.textContent = language.label;
    $('target-language').append(option);
  }
  $('preview-note').hidden = isExtension;
  if (!isExtension) document.querySelector('.privacy-note span').textContent = '预览模式：Key 仅保留在当前页面，刷新即清除。';
  try { settings = await loadSettings(); }
  catch { notice('暂时无法读取已保存的配置，请重新打开扩展页面后重试。'); }
  ready = true; input.disabled = false;
  renderProvider(); updateDirection();
  renderSpeech(speech.state);
  $('read-result').title = speech.supported ? '用系统声音朗读' : '当前浏览器不支持系统朗读';
  if (location.hash === '#settings') openSettings();
  else input.focus();
}
init();
