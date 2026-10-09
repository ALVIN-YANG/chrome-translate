import { translate, TranslationError } from './providers.js';
import { lookupAlternatives } from './dictionary.js';
import { automaticTarget, detectLanguage, isDictionaryPair, normalizeLanguage } from './language.js';
import { termNotes } from './terms.js';

// 立即执行；只允许最新输入的请求更新 UI。Abort 不代表服务端一定停止计费。
export class TranslationController {
  constructor(onChange, translator = translate, alternativeLookup = lookupAlternatives) {
    this.onChange = onChange;
    this.translator = translator;
    this.alternativeLookup = alternativeLookup;
    this.version = 0;
    this.status = 'idle';
  }

  reset() {
    this.version++;
    this.abort?.abort();
    this.fingerprint = null;
    this.emit({ status: 'idle' });
  }

  emit(state) { this.status = state.status; this.onChange(state); }

  run(request, { force = false } = {}) {
    const fingerprint = JSON.stringify(request);
    if (!force && fingerprint === this.fingerprint && ['loading', 'success'].includes(this.status)) return this.pending;
    this.abort?.abort();
    this.abort = new AbortController();
    const version = ++this.version;
    this.fingerprint = fingerprint;
    this.emit({ status: 'loading' });
    this.pending = this.execute(request, this.abort.signal, version);
    return this.pending;
  }

  async execute(request, signal, version) {
    try {
      let result = await this.translator({ ...request, signal });
      if (version !== this.version || signal.aborted) return;
      const detected = normalizeLanguage(result.detected);
      // 日语纯汉字等有歧义时，以服务识别结果修正自动目标，不显示中间译文。
      if (request.automaticTarget && detected && automaticTarget(detected) !== request.to) {
        request = { ...request, to: automaticTarget(detected) };
        result = await this.translator({ ...request, signal });
        if (version !== this.version || signal.aborted) return;
      }
      result = { ...result, target: request.to };
      const source = normalizeLanguage(result.detected) || (request.from === 'auto' ? detectLanguage(request.text) : request.from);
      const needsLookup = request.mode === 'term' && request.provider === 'microsoft' && isDictionaryPair(source, request.to);
      const notes = needsLookup ? termNotes(request.text, source, request.to) : [];
      this.emit({ status: 'success', result: { ...result, candidates: result.candidates || notes, candidateStatus: needsLookup ? 'loading' : result.candidateStatus || 'empty' } });
      if (!needsLookup) return;
      let alternatives;
      try { alternatives = await this.alternativeLookup({ ...request, from: source, endpoint: request.dictionaryEndpoint, signal }); }
      catch { alternatives = { candidates: notes, status: 'unavailable' }; }
      if (version === this.version && !signal.aborted) {
        this.emit({ status: 'success', phase: 'alternatives', result: { ...result, candidates: alternatives.candidates, candidateStatus: alternatives.status, dictionaryUrl: alternatives.sourceUrl } });
      }
    } catch (error) {
      if (version !== this.version || signal.aborted) return;
      this.emit({ status: 'error', error: error instanceof TranslationError ? error : new TranslationError('unknown', '翻译未完成，请重试。') });
    }
  }
}
