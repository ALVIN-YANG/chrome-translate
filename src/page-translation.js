import { collectPageSegments, cleanText, splitPageText } from './page-segments.js';
import { PageQueue } from './page-queue.js';
import { normalizeLanguage } from './language.js';

export class PageTranslation {
  constructor(doc, translateBatch, onState) {
    this.doc = doc;
    this.onState = onState;
    this.records = new Map();
    this.serial = 0;
    this.queue = new PageQueue(translateBatch, (item, result) => this.complete(item, result), error => {
      this.error = error.message || '翻译未完成，请重试。';
      this.report();
    });
    this.active = false;
  }
  report() {
    const records = [...this.records.values()];
    this.state = { active: this.active, scope: this.scope || 'smart', translated: records.filter(row => row.host?.isConnected).length,
      total: records.length, error: this.error || '', empty: this.active && !records.length, provider: this.context?.provider, target: this.context?.target };
    this.onState(this.state);
    return this.state;
  }
  start(context, scope = 'smart') {
    this.stop();
    this.active = true;
    this.context = context;
    this.scope = scope;
    this.error = '';
    this.queue.start(context);
    this.intersection = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const record = this.records.get(entry.target);
        if (record) this.enqueue(record);
      }
    }, { rootMargin: '250px 0px' });
    this.scan();
    this.observer = new MutationObserver(mutations => {
      if (!mutations.some(mutation => !mutation.target.parentElement?.closest('[data-ct-owned]')
        && !mutation.target.closest?.('[data-ct-owned]')
        && (mutation.type !== 'childList' || [...mutation.addedNodes, ...mutation.removedNodes].some(node => !node.dataset?.ctOwned)))) return;
      clearTimeout(this.scanTimer);
      this.scanTimer = setTimeout(() => this.scan(), 100);
    });
    this.observer.observe(this.doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'translate', 'contenteditable'] });
    return this.report();
  }
  scan() {
    if (!this.active) return;
    const visible = parent => {
      const style = this.doc.defaultView.getComputedStyle(parent);
      return style.display !== 'none' && style.visibility !== 'hidden' && [...parent.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
    };
    const segments = collectPageSegments(this.doc, this.scope, visible);
    const current = new Set(segments.map(segment => segment.element));
    for (const [element, record] of this.records) {
      if (!current.has(element)) {
        record.host?.remove();
        this.intersection.unobserve(element);
        this.records.delete(element);
      }
    }
    for (const segment of segments) {
      const old = this.records.get(segment.element);
      if (old?.text === segment.text) continue;
      old?.host?.remove();
      const record = { ...segment, id: ++this.serial, chunks: splitPageText(segment.text), results: [] };
      this.records.set(segment.element, record);
      this.intersection.observe(segment.element);
      const rect = segment.element.getBoundingClientRect();
      if (rect.bottom >= -250 && rect.top <= innerHeight + 250) this.enqueue(record);
    }
    this.report();
  }
  enqueue(record) {
    record.chunks.forEach((text, index) => this.queue.add({ text, id: `${record.id}-${index}`, record, index }));
  }
  complete(item, result) {
    const record = item.record;
    if (!this.active || this.records.get(record.element) !== record || !record.element.isConnected) return;
    record.results[item.index] = result;
    if (record.chunks.some((_, index) => !record.results[index])) return;
    const text = record.results.map(part => part.text).join('\n');
    if (cleanText(text) !== record.text && !record.results.every(part => normalizeLanguage(part.detected) === this.context.target)) {
      const host = this.doc.createElement('span');
      host.dataset.ctOwned = 'translation';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = this.doc.createElement('style');
      style.textContent = ':host{display:block!important;margin:8px 0 12px!important;padding:0!important;border:0!important;background:transparent!important;font-size:1em!important;line-height:1.65!important;color:inherit!important}span{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}';
      const translation = this.doc.createElement('span');
      translation.textContent = text;
      translation.lang = this.context.target;
      translation.dir = 'auto';
      translation.setAttribute('aria-label', '译文');
      shadow.append(style, translation);
      record.host = host;
      record.element.append(host);
    }
    this.report();
  }
  stop() {
    this.active = false;
    this.queue.stop();
    this.intersection?.disconnect();
    this.observer?.disconnect();
    clearTimeout(this.scanTimer);
    for (const record of this.records.values()) record.host?.remove();
    this.records.clear();
    this.error = '';
    return this.report();
  }
}
