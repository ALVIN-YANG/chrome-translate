// 每页只运行一个批次。停止后清空队列，迟到的完成回调不能重新插入译文。
export class PageQueue {
  constructor(translateBatch, onResult, onError, { batchSize = 8, cacheLimit = 300 } = {}) {
    Object.assign(this, { translateBatch, onResult, onError, batchSize, cacheLimit });
    this.cache = new Map();
    this.generation = 0;
    this.stop();
  }
  start(context) {
    this.stop();
    this.context = context;
    this.active = true;
    this.failed = false;
  }
  stop() {
    this.generation++;
    this.active = false;
    this.queue = [];
    this.keys = new Set();
    this.abort?.abort();
    this.running = false;
  }
  key(item) { return `${this.context.provider}:${this.context.target}:${item.text}`; }
  add(item) {
    if (!this.active || this.failed || this.keys.has(item.id)) return;
    this.keys.add(item.id);
    const key = this.key(item);
    if (this.cache.has(key)) { this.onResult(item, this.cache.get(key)); return; }
    this.queue.push(item);
    // 在同一帧收集可见段落后发送，输入及划词请求没有延时。
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => { this.scheduled = false; this.pump(); });
    }
  }
  async pump() {
    if (!this.active || this.failed || this.running || !this.queue.length) return;
    const version = this.generation;
    const batch = this.queue.splice(0, this.context.provider === 'microsoft' ? this.batchSize : 1);
    this.running = true;
    this.abort = new AbortController();
    try {
      const results = await this.translateBatch(batch.map(item => item.text), this.context, this.abort.signal);
      if (!this.active || version !== this.generation) return;
      if (!Array.isArray(results) || results.length !== batch.length || results.some(result => typeof result?.text !== 'string' || !result.text.trim())) throw new Error('网页译文不完整，请重试。');
      batch.forEach((item, index) => {
        if (this.cache.size >= this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(this.key(item), results[index]);
        this.onResult(item, results[index]);
      });
    } catch (error) {
      if (!this.active || version !== this.generation) return;
      // 配额/鉴权/网络出错后暂停整个页面，避免重复冲击接口；重试由用户触发。
      this.failed = true;
      this.queue = [];
      this.onError(error);
    } finally {
      if (version === this.generation) { this.running = false; this.pump(); }
    }
  }
}
