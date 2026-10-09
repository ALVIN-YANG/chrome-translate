import { detectLanguage, isLanguage } from './language.js';

export function resolveInputMode(text, preference = 'auto', source = 'auto') {
  if (preference === 'term' || preference === 'text') return preference;
  const value = text.trim();
  const language = source === 'auto' ? detectLanguage(value) : source;
  if (!value || /[\r\n。！？!?；;，,؟؛।]/u.test(value) || /[.!?]$/u.test(value)) return 'text';
  if (language === 'zh') {
    if (/^(请|我|你|他|她|它|我们|你们|他们|是否|如何|为什么|怎么|不要|已经|正在)/u.test(value)) return 'text';
    if (/^(使用|采用).+(解决|完成|处理|实现)/u.test(value)) return 'text';
    return Array.from(value).length <= 12 ? 'term' : 'text';
  }
  if (language === 'en') {
    if (/^(i|you|he|she|it|we|they|please|how|why|when|where|what|who|is|are|was|were|do|does|did|can|could|will|would|let)\b/i.test(value)) return 'text';
    const words = value.split(/\s+/u);
    if (words.length >= 3 && /^(use|apply|try|solve|avoid|find|check|show|run|go)\b/i.test(value)) return 'text';
    return value.length <= 60 && words.length <= 5 ? 'term' : 'text';
  }
  if (['ja', 'ko', 'th', 'hi'].includes(language)) return Array.from(value).length <= 12 ? 'term' : 'text';
  return isLanguage(language) && value.length <= 60 && value.split(/\s+/u).length <= 5 ? 'term' : 'text';
}

// 专业词义只作为可核实的补充，通用候选来自当前服务或词典。
const BACKTRACKING_SOURCE = 'https://xlinux.nist.gov/dads/HTML/backtrack.html';
const NOTES = [
  { chinese: ['回溯', '回溯算法', '回溯法', '回溯搜索'], english: 'backtracking', context: '算法 · 名词：尝试不同选择，失败时退回上一个选择点', example: 'backtracking algorithm', source: '术语补充', sourceUrl: BACKTRACKING_SOURCE },
  { chinese: ['回溯', '回溯搜索'], english: 'backtrack', context: '算法动作 · 动词：退回并尝试另一条分支', example: 'backtrack to the previous choice', source: '术语补充', sourceUrl: BACKTRACKING_SOURCE },
  { chinese: ['回溯', '追溯'], english: 'trace back', context: '追溯来源、原因或历史', example: 'trace back to the source', source: '用法说明' },
  { chinese: ['回溯', '回顾'], english: 'look back', context: '回顾过去的经历或事件', example: 'look back on the past', source: '用法说明' },
  { chinese: ['回溯', '回顾'], english: 'retrospective', context: '回顾、复盘；不是回溯算法的常用术语', example: 'a project retrospective', source: '用法说明' },
];

export function termNotes(text, source, target) {
  const value = text.trim().toLocaleLowerCase('en-US');
  if (source === 'zh' && target === 'en') {
    return NOTES.filter(note => note.chinese.includes(value)).map(note => ({ text: note.english, context: note.context, example: note.example, exampleLanguage: 'en', source: note.source, sourceUrl: note.sourceUrl }));
  }
  if (source === 'en' && target === 'zh') {
    return NOTES.filter(note => note.english === value).map(note => ({ text: note.chinese[0], context: note.context, example: note.example, exampleLanguage: 'en', source: note.source, sourceUrl: note.sourceUrl }));
  }
  return [];
}

export function mergeCandidates(...groups) {
  const candidates = new Map();
  for (const group of groups) for (const candidate of group || []) {
    if (typeof candidate?.text !== 'string') continue;
    const text = candidate.text.trim();
    if (!text || Array.from(text).length > 120) continue;
    const key = text.toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
    const next = { text, context: String(candidate.context || '').slice(0, 240), example: String(candidate.example || '').slice(0, 160), source: String(candidate.source || '').slice(0, 40) };
    if (next.example && typeof candidate.exampleTranslation === 'string' && candidate.exampleTranslation.trim()) next.exampleTranslation = candidate.exampleTranslation.trim().slice(0, 160);
    if (next.example && isLanguage(candidate.exampleLanguage)) next.exampleLanguage = candidate.exampleLanguage;
    if (candidate.sourceUrl?.startsWith('https://')) next.sourceUrl = candidate.sourceUrl;
    if (!candidates.has(key)) candidates.set(key, next);
  }
  return [...candidates.values()].slice(0, 10);
}

export function parseModelTerm(content, target) {
  const trimmed = content.trim();
  const json = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data;
  try { data = JSON.parse(json); }
  catch { return /^[\[{]|^```/u.test(trimmed) ? null : { text: trimmed, candidates: [] }; }
  if (typeof data?.translation !== 'string' || !data.translation.trim()) return null;
  const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];
  return { text: data.translation.trim(), candidates: mergeCandidates(alternatives.map(item => {
    let example = typeof item?.example === 'string' ? item.example.trim().slice(0, 160) : '';
    // 非合规例句不影响有效词义，但不能把纯中文当作英文用法展示。
    const script = { zh: /\p{Script=Han}/u, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, ko: /\p{Script=Hangul}/u, ar: /\p{Script=Arabic}/u, hi: /\p{Script=Devanagari}/u, th: /\p{Script=Thai}/u, ru: /\p{Script=Cyrillic}/u }[target] || /\p{Script=Latin}/u;
    if (target && !script.test(example)) example = '';
    return { text: item?.text, context: item?.context, example, exampleLanguage: target, exampleTranslation: item?.exampleTranslation, source: '模型候选' };
  })) };
}
