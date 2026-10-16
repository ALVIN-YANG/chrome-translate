import { collectPageSegments, cleanText, splitPageText, PAGE_BLOCKS } from './page-segments.js';
import { PageQueue } from './page-queue.js';
import { normalizeLanguage } from './language.js';

const SETTLE_MS = 100;

export class PageTranslation {
  constructor(doc, translateBatch, onState) {
    this.doc = doc;
    this.onState = onState;
    this.records = new Map();
    this.serial = 0;
    this.changedAt = new Map();
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
    this.repairPaused = false;
    this.queue.start(context);
    this.intersection = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const record = this.records.get(entry.target);
        if (record) this.enqueue(record);
      }
    }, { rootMargin: '250px 0px' });
    this.scan();
    this.observer = new MutationObserver(mutations => {
      const now = performance.now();
      const mark = element => { if (element) this.changedAt.set(element.closest(PAGE_BLOCKS) || element, now); };
      for (const mutation of mutations) {
        const record = this.records.get(mutation.target);
        const lostTranslation = record?.host && record.host.parentNode !== record.element && [...mutation.removedNodes].includes(record.host);
        const sourceChanged = !mutation.target.parentElement?.closest('[data-ct-owned]')
        && !mutation.target.closest?.('[data-ct-owned]')
        && (mutation.type !== 'childList' || [...mutation.addedNodes, ...mutation.removedNodes].some(node => !node.dataset?.ctOwned));
        if (!lostTranslation && !sourceChanged) continue;
        mark(mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement);
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1 || node.dataset?.ctOwned) continue;
          mark(node);
          for (const element of node.querySelectorAll(PAGE_BLOCKS)) mark(element);
        }
      }
      this.scheduleScan();
    });
    this.observer.observe(this.doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'translate', 'contenteditable'] });
    return this.report();
  }
  scheduleScan() {
    if (!this.active || this.scanTimer || !this.changedAt.size) return;
    // 各块分别等待稳定，其他块的变化不延长它的等待；没有稳定块时只检查时间，不遍历页面。
    let next = Infinity;
    for (const time of this.changedAt.values()) next = Math.min(next, time + SETTLE_MS);
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      const now = performance.now();
      let ready = false;
      for (const [element, time] of this.changedAt) {
        if (time + SETTLE_MS > now) continue;
        this.changedAt.delete(element);
        if (element.isConnected) ready = true;
      }
      if (ready) this.scan();
      this.scheduleScan();
    }, Math.max(0, next - performance.now()));
  }
  scan() {
    if (!this.active) return;
    const visible = parent => {
      const style = this.doc.defaultView.getComputedStyle(parent);
      return style.display !== 'none' && style.visibility !== 'hidden'
        && (parent.localName === 'br' || [...parent.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
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
      if (old?.text === segment.text) {
        if (old.host && old.host.parentNode !== segment.element) this.repair(old);
        if (old.deferred) this.enqueue(old);
        continue;
      }
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
    if (this.changedAt.has(record.element)) { record.deferred = true; return; }
    record.deferred = false;
    const rect = record.element.getBoundingClientRect();
    if (rect.bottom < -250 || rect.top > innerHeight + 250) return;
    record.chunks.forEach((text, index) => this.queue.add({ text, id: `${record.id}-${index}`, record, index }));
  }
  complete(item, result) {
    const record = item.record;
    if (!this.active || this.records.get(record.element) !== record || !record.element.isConnected) return;
    record.results[item.index] = result;
    this.render(record);
  }
  repair(record) {
    if (this.repairPaused) return;
    // 防止与网站自己的 MutationObserver 反复触发；间隔重绘仍可继续恢复。
    const now = Date.now();
    record.rapidRepairs = now - (record.lastRepair || 0) < 1000 ? (record.rapidRepairs || 0) + 1 : 1;
    record.lastRepair = now;
    if (record.rapidRepairs > 8) {
      this.repairPaused = true;
      this.queue.stop();
      this.error = '网站持续移除译文，已暂停翻译。请重试或显示原文。';
      return;
    }
    this.render(record);
  }
  render(record) {
    if (record.chunks.some((_, index) => !record.results[index])) return;
    record.host?.remove();
    record.host = null;
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
    this.scanTimer = null;
    this.changedAt.clear();
    for (const record of this.records.values()) record.host?.remove();
    this.records.clear();
    this.error = '';
    return this.report();
  }
}
