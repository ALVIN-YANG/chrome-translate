import css from './page.css';
import { pageRpc } from './page-rpc.js';
import { PageTranslation } from './page-translation.js';
import { TranslationController } from './controller.js';
import { resolveDirection, detectLanguage } from './language.js';
import { resolveInputMode, buildTermEntries, mergeCandidates, termNotes } from './terms.js';
import { parseDictionary, dictionaryUrl } from './dictionary.js';
import { SystemSpeech } from './speech.js';

if (!globalThis.__ctPageLoaded) {
  globalThis.__ctPageLoaded = true;
  initialize().catch(() => {});
}
async function initialize() {
  let settings = await pageRpc('ct:settings-get');
  const host = document.createElement('span');
  host.dataset.ctOwned = 'controls';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}</style>
    <button class="float" type="button" aria-label="翻译当前网页" title="翻译当前网页 · Alt+A">译</button>
    <button class="select-action" type="button" aria-label="翻译选中文字" hidden>译</button>
    <section class="panel" role="dialog" aria-label="划词翻译" hidden>
      <div class="toolbar"><span class="brand"></span><button class="read-all" aria-label="朗读译文"></button><button class="copy-all" aria-label="复制译文"></button><button class="close" aria-label="关闭划词翻译"></button></div>
      <div class="source" dir="auto"></div><div class="status" role="status"></div><div class="result" dir="auto"></div>
      <div class="panel-footer"><button class="retry" hidden>重试</button><button class="open-page">打开独立翻译页</button></div><p class="note">中文自动译英文，其他语言译中文 · Esc 关闭</p>
    </section>
    <aside class="page-note" hidden><p class="page-message" role="status"></p><button class="page-retry">重试</button><button class="page-all">翻译整个页面</button><button class="page-stop">显示原文</button></aside>
    <div class="notify" role="status" hidden></div>`;
  document.documentElement.append(host);
  const $ = selector => root.querySelector(selector);
  const icon = name => ({
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="12" height="15" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>',
  }[name]);
  $('.close').innerHTML = icon('close');
  $('.copy-all').innerHTML = icon('copy');
  $('.read-all').innerHTML = icon('speaker');
  let selected = null;
  let displayed = null;
  let noticeTimer;
  const notify = message => { $('.notify').textContent = message; $('.notify').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('.notify').hidden = true; }, 4000); };
  const speech = new SystemSpeech(state => {
    for (const button of root.querySelectorAll('[data-speech]')) {
      const active = state.key === button.dataset.speech && ['loading', 'speaking'].includes(state.status);
      button.innerHTML = icon(active ? 'stop' : 'speaker');
      button.setAttribute('aria-label', active ? '停止朗读' : button.dataset.label);
    }
    if (state.status === 'error') notify(state.message);
  });
  $('.read-all').dataset.speech = 'all';
  $('.read-all').dataset.label = '朗读译文';
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); notify('已复制'); }
    catch { notify('复制未获允许，请选中译文并使用系统复制快捷键。'); }
  }
  function read(text, language, key) {
    if (speech.state.key === key && ['loading', 'speaking'].includes(speech.state.status)) speech.stop();
    else speech.speak(text, language, key);
  }
  function control(label, action, type = 'speaker', key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = icon(type);
    button.setAttribute('aria-label', label);
    if (key) { button.dataset.speech = key; button.dataset.label = label; }
    button.addEventListener('click', action);
    return button;
  }
  function renderResult(result, request) {
    displayed = { result, request };
    const container = $('.result');
    container.lang = result.target;
    container.replaceChildren();
    $('.read-all').disabled = false;
    $('.copy-all').disabled = false;
    if (request.mode !== 'term') { container.textContent = result.text; return; }
    const entries = buildTermEntries(result);
    entries.forEach((entry, index) => {
      const row = document.createElement('div'); row.className = 'entry';
      const line = document.createElement('div'); line.className = 'entry-line';
      const text = document.createElement('span'); text.className = 'entry-text'; text.dir = 'auto'; text.textContent = entry.text;
      const key = `term-${index}`;
      line.append(text, control(`朗读 ${entry.text}`, () => read(entry.text, result.target, key), 'speaker', key), control(`复制 ${entry.text}`, () => copy(entry.text), 'copy'));
      row.append(line);
      if (entry.context) { const context = document.createElement('div'); context.className = 'context'; context.textContent = entry.context; row.append(context); }
      if (entry.example) {
        const example = document.createElement('div'); example.className = 'example';
        const text = document.createElement('span'); text.className = 'example-text'; text.dir = 'auto'; text.textContent = entry.example;
        const key = `example-${index}`;
        example.append(text, control('朗读例句', () => read(entry.example, entry.exampleLanguage || detectLanguage(entry.example) || result.target, key), 'speaker', key));
        row.append(example);
        if (entry.exampleTranslation) { const translation = document.createElement('div'); translation.className = 'example-translation'; translation.textContent = entry.exampleTranslation; row.append(translation); }
      }
      container.append(row);
    });
  }
  const controller = new TranslationController(state => {
    $('.retry').hidden = state.status !== 'error';
    $('.status').classList.toggle('error', state.status === 'error');
    if (state.status === 'loading') { $('.status').textContent = '正在翻译…'; return; }
    if (state.status === 'error') { $('.status').textContent = state.error.message; return; }
    if (state.status === 'success') {
      // 词典补充到达时，用户选中的内容保持可复制。
      if (state.phase === 'alternatives' && root.getSelection?.()?.toString()) return;
      $('.status').textContent = '';
      renderResult(state.result, state.request);
    }
  }, request => pageRpc('ct:selection-translate', { provider: request.provider, text: request.text, to: request.to, mode: request.mode }, request.signal), async request => {
    try {
      const { html } = await pageRpc('ct:dictionary', { text: request.text }, request.signal);
      const candidates = parseDictionary(html, request.text, request.from, request.to);
      return { candidates: mergeCandidates(termNotes(request.text, request.from, request.to), candidates), status: candidates.length ? 'ready' : 'empty', sourceUrl: dictionaryUrl(request.text) };
    } catch {
      request.signal?.throwIfAborted();
      return { candidates: termNotes(request.text, request.from, request.to), status: 'unavailable' };
    }
  });
  function place(element, rect) {
    const width = element === $('.panel') ? Math.min(390, innerWidth - 24) : 34;
    const height = element === $('.panel') ? Math.min(420, innerHeight - 24) : 32;
    element.style.left = `${Math.max(12, Math.min(rect?.left ?? innerWidth - width - 24, innerWidth - width - 12))}px`;
    element.style.top = `${Math.max(12, Math.min((rect?.bottom ?? 60) + 8, innerHeight - height - 12))}px`;
  }
  function close() { controller.reset(); speech.stop(); $('.panel').hidden = true; $('.select-action').hidden = true; displayed = null; }
  function openSelection(text = selected?.text) {
    if (!text?.trim()) return;
    speech.stop();
    controller.reset();
    selected = { text: text.trim(), rect: selected?.rect };
    $('.select-action').hidden = true;
    $('.panel').hidden = false;
    place($('.panel'), selected.rect);
    $('.close').focus({ preventScroll: true });
    $('.brand').textContent = settings.services.find(service => service.id === settings.provider)?.name || '翻译';
    $('.source').textContent = selected.text;
    $('.result').replaceChildren();
    $('.read-all').disabled = true; $('.copy-all').disabled = true;
    displayed = null;
    const direction = resolveDirection(selected.text);
    controller.run({ provider: settings.provider, text: selected.text, from: 'auto', to: direction.to, automaticTarget: true, mode: resolveInputMode(selected.text), config: {} });
  }
  const pageTranslation = new PageTranslation(document, (texts, context, signal) => pageRpc('ct:page-translate', { texts, provider: context.provider, to: context.target }, signal), state => {
    $('.float').classList.toggle('active', state.active);
    $('.float').setAttribute('aria-label', state.active ? '显示原文' : '翻译当前网页');
    $('.float').title = state.active ? `显示原文 · 已翻译 ${state.translated} 段 · Alt+A` : '翻译当前网页 · Alt+A';
    $('.page-note').hidden = !state.error && !state.empty;
    $('.page-message').textContent = state.error || '未找到可翻译的正文，可以尝试翻译整个页面。';
    $('.page-retry').hidden = !state.error;
    $('.page-all').hidden = !state.empty;
  });
  function start(scope = 'smart') { return pageTranslation.start({ provider: settings.provider, target: settings.page.target }, scope); }
  function toggle(scope = 'smart') { return pageTranslation.active ? pageTranslation.stop() : start(scope); }
  function applySettings(next) {
    const changed = next.provider !== settings.provider || next.page.target !== settings.page.target;
    settings = next;
    $('.float').hidden = !settings.page.floating;
    if (!settings.page.selection) $('.select-action').hidden = true;
    // 更改服务只影响下一次主动翻译，不把已经显示的网页自动转发给新服务。
    if (changed && pageTranslation.active) { pageTranslation.stop(); notify('服务或目标语言已更改，请重新开启网页翻译。'); }
  }
  const trustedAction = action => event => { if (event.isTrusted) action(event); };
  applySettings(settings);
  $('.float').addEventListener('click', trustedAction(() => toggle()));
  $('.select-action').addEventListener('click', trustedAction(() => openSelection()));
  $('.close').addEventListener('click', close);
  $('.retry').addEventListener('click', trustedAction(() => openSelection()));
  $('.page-retry').addEventListener('click', trustedAction(() => start(pageTranslation.scope)));
  $('.page-all').addEventListener('click', trustedAction(() => start('all')));
  $('.page-stop').addEventListener('click', () => pageTranslation.stop());
  $('.copy-all').addEventListener('click', () => displayed && copy(displayed.request.mode === 'term' ? buildTermEntries(displayed.result).map(entry => entry.text).join('\n') : displayed.result.text));
  $('.read-all').addEventListener('click', () => displayed && read(displayed.request.mode === 'term' ? buildTermEntries(displayed.result).map(entry => entry.text).join('\n') : displayed.result.text, displayed.result.target, 'all'));
  $('.open-page').addEventListener('click', () => pageRpc('ct:open-page').catch(error => notify(error.message)));
  root.addEventListener('pointerdown', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (event.composedPath().includes(host)) return;
    if (!$('.panel').hidden) close();
    $('.select-action').hidden = true;
  }, true);
  function selectionAction(event) {
    if (!event?.isTrusted || !settings.page.selection || event.composedPath().includes(host) || !$('.panel').hidden) return;
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!selection?.rangeCount || selection.isCollapsed || element?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-ct-owned]')) return;
    const text = selection.toString().trim();
    if (!text || Array.from(text).length > 10000) return;
    selected = { text, rect: selection.getRangeAt(0).getBoundingClientRect() };
    place($('.select-action'), selected.rect);
    $('.select-action').hidden = false;
  }
  document.addEventListener('pointerup', selectionAction);
  document.addEventListener('keyup', event => { if (event.key === 'Escape') close(); else if (event.key === 'Shift' || event.shiftKey) selectionAction(event); });
  window.addEventListener('scroll', () => { $('.select-action').hidden = true; }, { passive: true });
  window.addEventListener('resize', () => { $('.select-action').hidden = true; if (!$('.panel').hidden) place($('.panel'), selected?.rect); });
  window.addEventListener('pagehide', () => { close(); pageTranslation.stop(); });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'ct:status') respond(pageTranslation.report());
    if (message.type === 'ct:toggle') respond(toggle(message.scope));
    if (message.type === 'ct:start') respond(start(message.scope));
    if (message.type === 'ct:selection-open') { openSelection(message.text); respond({}); }
    if (message.type === 'ct:settings') { pageTranslation.queue.cache.clear(); applySettings(message.settings); respond({}); }
  });
}
