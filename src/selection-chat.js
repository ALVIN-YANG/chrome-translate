import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { icon } from './icons.js';
import { detectLanguage } from './language.js';
export function markdownHTML(text) {
  return DOMPurify.sanitize(marked.parse(text, { breaks: true }), { ALLOWED_TAGS: ['p','br','strong','em','ul','ol','li','code','pre','blockquote','a','h1','h2','h3','h4','table','thead','tbody','tr','td','th','hr'], ALLOWED_ATTR: ['href','title'] });
}
export class SelectionChat {
  constructor(element, notify, speech, copy) {
    Object.assign(this, { element, notify, speech, copy, messages: [], version: 0 });
    element.innerHTML = `<div class="chat-intro"><span class="chat-spark">${icon('ai')}</span><h3>从这段内容，聊深一点</h3><p>解释概念、总结要点，也可以直接提问。</p></div><div class="suggestions"><button data-prompt="请解释这段内容，用一个具体例子说明。">解释内容</button><button data-prompt="请概括这段内容的要点。">总结要点</button><button data-prompt="请润色这段表达，保留原意。">润色表达</button></div><div class="chat-messages" role="log" aria-label="AI 对话" aria-live="polite"></div><div class="chat-error" role="status" hidden></div><form class="chat-composer"><label class="sr-only" for="ct-question">向 AI 提问</label><textarea id="ct-question" placeholder="问问 AI，比如：这里为什么用回溯？" rows="2" maxlength="4000"></textarea><button type="submit" class="chat-send" aria-label="发送问题">${icon('send')}</button></form><div class="chat-bottom"><span class="chat-model"></span><button class="chat-stop" hidden>停止生成</button><button class="chat-settings">${icon('settings')}模型设置</button></div>`;
    this.$ = selector => element.querySelector(selector);
    this.$('.chat-send').addEventListener('click', event => { this.authorizedSubmit = event.isTrusted; });
    this.$('.chat-composer').addEventListener('submit', event => { event.preventDefault(); const allowed = this.authorizedSubmit; this.authorizedSubmit = false; if (event.isTrusted && allowed) this.ask(this.$('textarea').value); });
    this.$('textarea').addEventListener('keydown', event => { if (event.isTrusted && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.authorizedSubmit = true; this.$('.chat-composer').requestSubmit(); } });
    for (const button of element.querySelectorAll('[data-prompt]')) button.addEventListener('click', event => { if (event.isTrusted) this.ask(button.dataset.prompt); });
    this.$('.chat-stop').addEventListener('click', () => this.cancel());
    this.$('.chat-settings').addEventListener('click', event => { if (event.isTrusted) chrome.runtime.sendMessage({ type: 'ct:assistant-open' }).catch(() => {}); });
  }
  open(selection, config) {
    this.reset(); this.selection = selection; this.config = config;
    this.$('.chat-model').textContent = config.llm.name;
    this.$('textarea').focus({ preventScroll: true });
  }
  busy(value) { this.loading = value; this.$('.chat-send').disabled = value; this.$('.chat-stop').hidden = !value; }
  cancel() {
    this.version++; this.port?.disconnect(); this.port = null;
    if (this.loading && this.pendingRow) { this.pendingRow.classList.add('partial'); this.$('textarea').value = this.pendingQuestion || ''; }
    this.busy(false);
  }
  reset() {
    this.cancel(); this.messages = []; this.$('.chat-messages').replaceChildren(); this.$('textarea').value = '';
    this.$('.chat-error').hidden = true; this.$('.chat-intro').hidden = false; this.$('.suggestions').hidden = false;
  }
  row(role, text) {
    const row = document.createElement('div'); row.className = `chat-message ${role}`;
    const label = document.createElement('div'); label.className = 'message-label'; label.textContent = role === 'user' ? '你' : this.config.llm.name;
    const body = document.createElement('div'); body.className = 'message-body'; body.dir = 'auto'; body.textContent = text;
    row.append(label, body); this.$('.chat-messages').append(row); return { row, body };
  }
  ask(question) {
    if (this.loading || !question.trim()) return;
    if (!this.config.llm.configured) { this.$('.chat-error').textContent = '先在模型设置中填写 Key，然后再提问。'; this.$('.chat-error').hidden = false; return; }
    if (this.messages.length >= 14) { this.notify('这段对话已达到 7 轮，请重新选中文字开始。'); return; }
    this.speech.stop(); this.$('.chat-intro').hidden = true; this.$('.suggestions').hidden = true; this.$('.chat-error').hidden = true;
    this.row('user', question.trim());
    const { row, body } = this.row('assistant', '正在整理回答…'); this.pendingRow = row;
    this.pendingQuestion = question; this.busy(true); this.$('textarea').value = '';
    const run = ++this.version; const port = this.port = chrome.runtime.connect({ name: 'ct:ask-ai' });
    let text = '';
    port.onMessage.addListener(event => {
      if (run !== this.version) return;
      if (event.type === 'delta') {
        if (!text) body.replaceChildren(document.createTextNode(''));
        text += event.text; body.firstChild.appendData(event.text);
      }
      if (event.type === 'done') {
        const selected = body.getRootNode().getSelection?.()?.toString();
        if (!selected) body.innerHTML = markdownHTML(event.text);
        for (const link of body.querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noreferrer noopener'; }
        this.messages.push({ role: 'user', content: question.trim() }, { role: 'assistant', content: event.text });
        const actions = document.createElement('div'); actions.className = 'message-actions';
        const copy = document.createElement('button'); copy.innerHTML = `${icon('copy')}复制`; copy.setAttribute('aria-label', '复制 AI 回答'); copy.onclick = () => this.copy(event.text);
        const read = document.createElement('button'); read.innerHTML = `${icon('speaker')}朗读`; read.setAttribute('aria-label', '朗读 AI 回答'); read.onclick = click => { if (click.isTrusted) this.speech.speak(event.text, detectLanguage(event.text) || 'zh', `ai-${this.messages.length}`); };
        actions.append(copy, read); row.append(actions);
        this.busy(false); port.disconnect(); this.port = null;
      }
      if (event.type === 'error') {
        this.busy(false); this.$('.chat-error').textContent = event.message; this.$('.chat-error').hidden = false;
        if (!text) body.textContent = '回答未完成';
        row.classList.add('partial'); port.disconnect(); this.port = null; this.$('textarea').value = question;
      }
    });
    port.onDisconnect.addListener(() => {
      if (run !== this.version || !this.loading) return;
      this.busy(false); this.$('.chat-error').textContent = '连接已中断，请重新发送问题。'; this.$('.chat-error').hidden = false; this.$('textarea').value = question;
    });
    port.postMessage({ type: 'ask', selection: this.selection, messages: [...this.messages, { role: 'user', content: question.trim() }] });
  }
}
