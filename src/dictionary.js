import { mergeCandidates, termNotes } from './terms.js';
import { detectLanguage, isDictionaryPair } from './language.js';

const POS_NAMES = { 'n.': '名词', 'v.': '动词', 'adj.': '形容词', 'adv.': '副词', 'prep.': '介词', 'pron.': '代词', 'conj.': '连词', 'na.': '词组', '网络': '网络释义' };
const cache = new Map();
export const dictionaryUrl = text => `https://cn.bing.com/dict/search?q=${encodeURIComponent(text.trim())}`;

export function parseDictionary(html, text, source, target, Parser = globalThis.DOMParser) {
  if (!Parser || typeof html !== 'string' || html.length > 1500000) return [];
  // 只提取文本，词典页面中的脚本、样式和资源不进入产品 DOM。
  const inert = html.replace(/<(script|style|iframe|svg|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<(img|link|embed|meta)\b[^>]*>/gi, '');
  const doc = new Parser().parseFromString(inert, 'text/html');
  const normalize = value => value?.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ') || '';
  if (normalize(doc.querySelector('#headword')?.textContent) !== normalize(text)) return [];
  const candidates = [];
  const notes = termNotes(text, source, target);
  for (const row of doc.querySelectorAll('.qdef > ul > li')) {
    const pos = row.querySelector('.pos')?.textContent?.trim() || '';
    const definition = row.querySelector('.def')?.textContent || '';
    for (const item of definition.split(/[;；]/u)) {
      const translation = item.trim();
      if (!translation || (target === 'en' && !/\p{Script=Latin}/u.test(translation)) || (target === 'zh' && !/\p{Script=Han}/u.test(translation))) continue;
      const note = notes.find(candidate => normalize(candidate.text) === normalize(translation));
      candidates.push({ text: translation, context: note?.context || POS_NAMES[pos] || pos || '词典释义', example: note?.example || '', exampleLanguage: note?.exampleLanguage, source: '必应词典' });
    }
  }
  return mergeCandidates(candidates);
}

export async function lookupAlternatives({ text, from, to, signal, timeoutMs = 6000, endpoint }, fetcher = fetch) {
  const source = from === 'auto' ? detectLanguage(text) : from;
  const notes = termNotes(text, source, to);
  if (!isDictionaryPair(source, to)) return { candidates: [], status: 'empty' };
  const key = `${source}:${to}:${text.trim().toLocaleLowerCase('en-US')}`;
  signal?.throwIfAborted();
  if (cache.has(key)) return cache.get(key);
  try {
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const response = await fetcher(endpoint || dictionaryUrl(text), { signal: requestSignal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Dictionary unavailable');
    const candidates = parseDictionary(await response.text(), text, source, to);
    requestSignal.throwIfAborted();
    const result = { candidates: mergeCandidates(notes, candidates), status: candidates.length ? 'ready' : 'empty', sourceUrl: dictionaryUrl(text) };
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  } catch {
    signal?.throwIfAborted();
    return { candidates: notes, status: 'unavailable', sourceUrl: dictionaryUrl(text) };
  }
}
