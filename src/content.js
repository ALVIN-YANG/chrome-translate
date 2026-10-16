import css from './page.css';
import { pageRpc } from './page-rpc.js';
import { PageTranslation } from './page-translation.js';
import { TranslationController } from './controller.js';
import { resolveDirection, detectLanguage } from './language.js';
import { resolveInputMode, buildTermEntries, mergeCandidates, termNotes } from './terms.js';
import { parseDictionary, dictionaryUrl } from './dictionary.js';
import { UnifiedSpeech } from './unified-speech.js';
import { SelectionChat } from './selection-chat.js';
import { icon } from './icons.js';
import { computePosition, offset, flip, shift, size } from '@floating-ui/dom';

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
    <button class="float" type="button" aria-label="翻译当前网页" aria-pressed="false" title="翻译当前网页 · Alt+A">${icon('translate')}</button>
    <div class="selection-bar" role="toolbar" aria-label="划词操作" hidden>
      <button class="select-action" type="button" aria-label="翻译选中文字">${icon('translate')}<span>翻译</span></button><span class="bar-divider"></span>
      <button class="select-read" type="button" aria-label="朗读选中文字" data-speech="selection" data-label="朗读选中文字">${icon('speaker')}<span>朗读</span></button><span class="bar-divider"></span>
      <button class="select-ai" type="button" aria-label="问问 AI">${icon('ai')}<span>问问 AI</span></button>
    </div>
    <section class="panel" role="dialog" aria-label="划词翻译" hidden>
      <div class="toolbar"><span class="brand"></span><button class="read-all" aria-label="朗读译文"></button><button class="copy-all" aria-label="复制译文"></button><button class="close" aria-label="关闭划词翻译"></button></div>
      <nav class="scene-tabs" aria-label="所选内容操作"><button class="scene-translate" aria-pressed="true">翻译</button><button class="scene-ai" aria-pressed="false">问问 AI</button><button class="scene-settings" aria-label="模型与声音设置">${icon('settings')}</button></nav><div class="source" dir="auto"></div><div class="status" role="status"></div><div class="result" dir="auto"></div>
      <div class="chat-area" hidden></div><div class="panel-footer"><button class="retry" hidden>重试</button><button class="open-page">打开独立翻译页</button></div><p class="note">中文自动译英文，其他语言译中文 · Esc 关闭</p>
    </section>
    <aside class="page-note" hidden><p class="page-message" role="status"></p><button class="page-retry">重试</button><button class="page-all">翻译整个页面</button><button class="page-stop">显示原文</button></aside>
    <div class="speech-chip" hidden><span class="speech-wave">${icon('speaker')}</span><span class="speech-caption"></span><button class="speech-pause" aria-label="暂停朗读">${icon('pause')}</button><button class="speech-stop" aria-label="停止当前朗读">${icon('stop')}</button></div><div class="notify" role="status" hidden></div>`;
  document.documentElement.append(host);
  const $ = selector => root.querySelector(selector);
  $('.close').innerHTML = icon('close');
  $('.copy-all').innerHTML = icon('copy');
  $('.read-all').innerHTML = icon('speaker');
  let selected = null;
  let displayed = null;
  let returnFocusTarget = null;
  let noticeTimer;
  const notify = message => { $('.notify').textContent = message; $('.notify').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('.notify').hidden = true; }, 4000); };
  const speech = new UnifiedSpeech(state => {
    for (const button of root.querySelectorAll('[data-speech]')) {
      const active = state.key === button.dataset.speech && ['loading', 'speaking', 'paused'].includes(state.status);
      button.innerHTML = icon(active ? 'stop' : 'speaker') + (button.classList.contains('select-read') ? `<span>${active ? '停止' : '朗读'}</span>` : '');
      button.setAttribute('aria-label', active ? '停止朗读' : button.dataset.label);
    }
    $('.select-read').classList.toggle('speaking', ['loading', 'speaking', 'paused'].includes(state.status) && state.key === 'selection');
    $('.speech-chip').hidden = !['loading', 'speaking', 'paused'].includes(state.status);
    $('.speech-caption').textContent = `${settings.assistant?.tts.name || '系统声音'} · ${state.status === 'loading' ? '准备声音' : state.status === 'paused' ? '已暂停' : state.status === 'speaking' ? '正在朗读' : ''}`;
    $('.speech-pause').disabled = state.status === 'loading';
    $('.speech-pause').innerHTML = icon(state.status === 'paused' ? 'play' : 'pause');
    $('.speech-pause').setAttribute('aria-label', state.status === 'paused' ? '继续朗读' : '暂停朗读');
    if (state.status === 'error') notify(state.message);
  }, () => settings.assistant?.tts);
  $('.read-all').dataset.speech = 'all';
  $('.read-all').dataset.label = '朗读译文';
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); notify('已复制'); }
    catch { notify('复制未获允许，请选中译文并使用系统复制快捷键。'); }
  }
  function read(text, language, key) {
    if (speech.state.key === key && ['loading', 'speaking', 'paused'].includes(speech.state.status)) speech.stop();
    else speech.speak(text, language, key);
  }
  function control(label, action, type = 'speaker', key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = icon(type);
    button.setAttribute('aria-label', label);
    if (key) { button.dataset.speech = key; button.dataset.label = label; }
    button.addEventListener('click', event => { if (event.isTrusted) action(event); });
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
  const chat = new SelectionChat($('.chat-area'), notify, speech, copy);
  let chatSource = '';
  let placementVersion = 0;
  function place(element, rect) {
    if (element === $('.selection-bar')) {
      const version = ++placementVersion;
      const virtual = { getBoundingClientRect: () => rect || new DOMRect(innerWidth / 2, 70, 1, 1) };
      computePosition(virtual, element, { strategy: 'fixed', placement: 'top', middleware: [offset(10), flip(), shift({ padding: 12 })] }).then(({ x, y }) => { if (version === placementVersion) { element.style.left = `${x}px`; element.style.top = `${y}px`; } });
      return;
    }
    const version = ++placementVersion;
    const virtual = { getBoundingClientRect: () => rect || new DOMRect(innerWidth - 430, 60, 1, 1) };
    computePosition(virtual, element, { strategy: 'fixed', placement: 'bottom-start', middleware: [offset(10), flip(), shift({ padding: 12 }), size({ padding: 12, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = `${Math.max(180, Math.min(620, availableHeight))}px`; } })] }).then(({ x, y }) => { if (version === placementVersion) { element.style.left = `${x}px`; element.style.top = `${y}px`; } });

  }
  function rememberFocus() {
    if (!$('.panel').hidden) return;
    const active = document.activeElement;
    const anchor = window.getSelection()?.anchorNode;
    returnFocusTarget = active && active !== host && active !== document.body && active !== document.documentElement
      ? active : selected?.origin || (anchor?.nodeType === 1 ? anchor : anchor?.parentElement);
    if (returnFocusTarget?.getRootNode() !== document) returnFocusTarget = null;
  }
  function close(restoreFocus = false) {
    const target = restoreFocus && !$('.panel').hidden && document.activeElement === host ? returnFocusTarget : null;
    controller.reset(); chat.reset(); chatSource = ''; speech.stop();
    $('.panel').hidden = true; $('.selection-bar').hidden = true; displayed = null; returnFocusTarget = null;
    if (target?.isConnected && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
      if (document.activeElement !== target && !target.hasAttribute('tabindex')) {
        const cleanup = () => {
          if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
        };
        // 普通段落须暂时可聚焦；过早删除 tabindex 会让 Chromium 立即丢失焦点。
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', cleanup, { once: true });
        try { target.focus({ preventScroll: true }); }
        finally {
          if (document.activeElement !== target) {
            target.removeEventListener('blur', cleanup); cleanup();
          }
        }
      }
    }
  }
  function openSelection(text = selected?.text) {
    if (!text?.trim()) return;
    rememberFocus();
    speech.stop();
    chat.cancel();
    controller.reset();
    setScene('translate');
    selected = { text: text.trim(), rect: selected?.rect, origin: selected?.origin };
    $('.selection-bar').hidden = true;
    $('.panel').hidden = false;
    place($('.panel'), selected.rect);
    $('.close').focus({ preventScroll: true });
    $('.brand').textContent = settings.services.find(service => service.id === settings.provider)?.name || '翻译';
    $('.source').textContent = selected.text;
    if (displayed?.request.text === selected.text && displayed.request.provider === settings.provider) { renderResult(displayed.result, displayed.request); return; }
    $('.result').replaceChildren();
    $('.read-all').disabled = true; $('.copy-all').disabled = true;
    displayed = null;
    const direction = resolveDirection(selected.text);
    controller.run({ provider: settings.provider, text: selected.text, from: 'auto', to: direction.to, automaticTarget: true, mode: resolveInputMode(selected.text), config: {} });
  }
  function setScene(scene) {
    const isAI = scene === 'ai';
    $('.panel').setAttribute('aria-label', isAI ? '问问 AI' : '划词翻译');
    $('.panel').classList.toggle('ai-panel', isAI);
    $('.chat-area').hidden = !isAI;
    for (const selector of ['.result','.status','.panel-footer','.read-all','.copy-all']) $(selector).hidden = isAI;
    $('.scene-translate').setAttribute('aria-pressed', String(!isAI));
    $('.scene-ai').setAttribute('aria-pressed', String(isAI));
    $('.note').textContent = isAI ? '仅将所选内容和本轮对话发给所选模型 · Esc 关闭' : '中文自动译英文，其他语言译中文 · Esc 关闭';
  }
  function openChat() {
    if (!selected?.text) return;
    rememberFocus();
    controller.reset(); speech.stop(); setScene('ai');
    $('.selection-bar').hidden = true; $('.panel').hidden = false;
    place($('.panel'), selected.rect); $('.source').textContent = selected.text;
    $('.brand').textContent = settings.assistant.llm.name;
    const fingerprint = `${settings.assistant.llm.provider}:${selected.text}`;
    if (chatSource !== fingerprint) { chat.open(selected.text, settings.assistant); chatSource = fingerprint; }
    else $('.chat-area textarea').focus({ preventScroll: true });
  }
  const pageTranslation = new PageTranslation(document, (texts, context, signal) => pageRpc('ct:page-translate', { texts, provider: context.provider, to: context.target }, signal), state => {
    const floating = $('.float');
    floating.classList.toggle('active', state.active);
    if (floating.getAttribute('aria-pressed') !== String(state.active)) {
      floating.innerHTML = icon(state.active ? 'eye' : 'translate');
      floating.setAttribute('aria-pressed', String(state.active));
    }
    floating.setAttribute('aria-label', state.active ? '显示原文' : '翻译当前网页');
    floating.title = state.active ? `显示原文 · 已翻译 ${state.translated} 段 · Alt+A` : '翻译当前网页 · Alt+A';
    $('.page-note').hidden = !state.error && !state.empty;
    $('.page-message').textContent = state.error || '未找到可翻译的正文，可以尝试翻译整个页面。';
    $('.page-retry').hidden = !state.error;
    $('.page-all').hidden = !state.empty;
  });
  function start(scope = 'smart') { return pageTranslation.start({ provider: settings.provider, target: settings.page.target }, scope); }
  function toggle(scope = 'smart') { return pageTranslation.active ? pageTranslation.stop() : start(scope); }
  function applySettings(next) {
    const changed = next.provider !== settings.provider || next.page.target !== settings.page.target;
    if (next.assistant && settings.assistant && JSON.stringify(next.assistant) !== JSON.stringify(settings.assistant)) {
      speech.stop();
      if (JSON.stringify(next.assistant.llm) !== JSON.stringify(settings.assistant.llm)) {
        chat.cancel(); chat.updateConfig(next.assistant); chatSource = '';
        if ($('.panel').classList.contains('ai-panel')) $('.brand').textContent = next.assistant.llm.name;
      }
    }
    settings = next;
    $('.float').hidden = !settings.page.floating;
    if (!settings.page.selection) $('.selection-bar').hidden = true;
    // 更改服务只影响下一次主动翻译，不把已经显示的网页自动转发给新服务。
    if (changed && pageTranslation.active) { pageTranslation.stop(); notify('服务或目标语言已更改，请重新开启网页翻译。'); }
  }
  const trustedAction = action => event => { if (event.isTrusted) action(event); };
  applySettings(settings);
  $('.float').addEventListener('click', trustedAction(() => toggle()));
  $('.select-action').addEventListener('click', trustedAction(() => openSelection()));
  $('.select-read').addEventListener('click', trustedAction(() => selected && read(selected.text, detectLanguage(selected.text) || 'zh', 'selection')));
  $('.select-ai').addEventListener('click', trustedAction(openChat));
  $('.scene-ai').addEventListener('click', trustedAction(openChat));
  $('.scene-translate').addEventListener('click', trustedAction(() => openSelection()));
  $('.scene-settings').addEventListener('click', trustedAction(() => pageRpc('ct:assistant-open').catch(error => notify(error.message))));
  $('.close').addEventListener('click', () => close(true));
  $('.speech-pause').addEventListener('click', trustedAction(() => speech.pause()));
  $('.speech-stop').addEventListener('click', trustedAction(() => speech.stop()));
  $('.retry').addEventListener('click', trustedAction(() => openSelection()));
  $('.page-retry').addEventListener('click', trustedAction(() => start(pageTranslation.scope)));
  $('.page-all').addEventListener('click', trustedAction(() => start('all')));
  $('.page-stop').addEventListener('click', () => pageTranslation.stop());
  $('.copy-all').addEventListener('click', () => displayed && copy(displayed.request.mode === 'term' ? buildTermEntries(displayed.result).map(entry => entry.text).join('\n') : displayed.result.text));
  $('.read-all').addEventListener('click', trustedAction(() => displayed && read(displayed.request.mode === 'term' ? buildTermEntries(displayed.result).map(entry => entry.text).join('\n') : displayed.result.text, displayed.result.target, 'all')));
  $('.open-page').addEventListener('click', () => pageRpc('ct:open-page').catch(error => notify(error.message)));
  root.addEventListener('pointerdown', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (event.composedPath().includes(host)) return;
    if (!$('.panel').hidden) close();
    $('.selection-bar').hidden = true;
  }, true);
  document.addEventListener('focusin', event => {
    if (!event.composedPath().includes(host)) $('.selection-bar').hidden = true;
  }, true);
  function selectionAction(event) {
    if (!event?.isTrusted || !settings.page.selection || event.composedPath().includes(host) || !$('.panel').hidden) return;
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!selection?.rangeCount || selection.isCollapsed || element?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-ct-owned]')) return;
    const text = selection.toString().trim();
    if (!text || Array.from(text).length > 10000) return;
    if (selected?.text !== text) speech.stop();
    selected = { text, rect: selection.getRangeAt(0).getBoundingClientRect(), origin: element };
    place($('.selection-bar'), selected.rect);
    $('.selection-bar').hidden = false;
  }
  document.addEventListener('pointerup', selectionAction);
  document.addEventListener('keyup', event => { if (event.key === 'Escape') close(event.composedPath().includes(host)); else if (event.key === 'Shift' || event.shiftKey) selectionAction(event); });
  window.addEventListener('scroll', () => { $('.selection-bar').hidden = true; }, { passive: true });
  window.addEventListener('resize', () => { $('.selection-bar').hidden = true; if (!$('.panel').hidden) place($('.panel'), selected?.rect); });
  function isPageAnchor(hash) {
    let id;
    try { id = decodeURIComponent(hash.slice(1).split(':~:')[0]); } catch { return false; }
    return !id || Boolean(document.getElementById(id)) || [...document.getElementsByName(id)].some(element => element.localName === 'a');
  }
  let pageAddress = new URL(location.href);
  let hashRoute = !isPageAnchor(pageAddress.hash);
  window.navigation.addEventListener('currententrychange', () => {
    const next = new URL(location.href);
    if (next.href === pageAddress.href) return;
    const nextHashRoute = !isPageAnchor(next.hash);
    const anchorChange = next.origin === pageAddress.origin && next.pathname === pageAddress.pathname
      && next.search === pageAddress.search && !hashRoute && !nextHashRoute;
    pageAddress = next; hashRoute = nextHashRoute;
    if (anchorChange) return;
    close(); selected = null;
    pageTranslation.stop();
    pageTranslation.queue.cache.clear();
  });
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
