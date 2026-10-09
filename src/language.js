// UI 使用统一代码；各服务的代码和系统声音语言集中在这里。
export const LANGUAGES = {
  zh: { name: '中文', label: '简体中文', english: 'Simplified Chinese', microsoft: 'zh-Hans', baidu: 'zh', speech: 'zh-CN' },
  en: { name: '英语', label: '英语', english: 'English', microsoft: 'en', baidu: 'en', speech: 'en-US' },
  ja: { name: '日语', label: '日语', english: 'Japanese', microsoft: 'ja', baidu: 'jp', speech: 'ja-JP' },
  ko: { name: '韩语', label: '韩语', english: 'Korean', microsoft: 'ko', baidu: 'kor', speech: 'ko-KR' },
  fr: { name: '法语', label: '法语', english: 'French', microsoft: 'fr', baidu: 'fra', speech: 'fr-FR' },
  de: { name: '德语', label: '德语', english: 'German', microsoft: 'de', baidu: 'de', speech: 'de-DE' },
  es: { name: '西班牙语', label: '西班牙语', english: 'Spanish', microsoft: 'es', baidu: 'spa', speech: 'es-ES' },
  pt: { name: '葡萄牙语', label: '葡萄牙语', english: 'Portuguese', microsoft: 'pt', baidu: 'pt', speech: 'pt-BR' },
  ru: { name: '俄语', label: '俄语', english: 'Russian', microsoft: 'ru', baidu: 'ru', speech: 'ru-RU' },
  it: { name: '意大利语', label: '意大利语', english: 'Italian', microsoft: 'it', baidu: 'it', speech: 'it-IT' },
  ar: { name: '阿拉伯语', label: '阿拉伯语', english: 'Arabic', microsoft: 'ar', baidu: 'ara', speech: 'ar-SA' },
  hi: { name: '印地语', label: '印地语', english: 'Hindi', microsoft: 'hi', baidu: 'hi', speech: 'hi-IN' },
  th: { name: '泰语', label: '泰语', english: 'Thai', microsoft: 'th', baidu: 'th', speech: 'th-TH' },
  vi: { name: '越南语', label: '越南语', english: 'Vietnamese', microsoft: 'vi', baidu: 'vie', speech: 'vi-VN' },
  id: { name: '印尼语', label: '印尼语', english: 'Indonesian', microsoft: 'id', baidu: 'id', speech: 'id-ID' },
};

export function isLanguage(code) { return Object.hasOwn(LANGUAGES, code); }

export function normalizeLanguage(code) {
  if (typeof code !== 'string') return null;
  const base = code.toLowerCase().replaceAll('_', '-').split('-')[0];
  const language = { jp: 'ja', kor: 'ko', fra: 'fr', spa: 'es', ara: 'ar', vie: 'vi', cht: 'zh' }[base] || base;
  return isLanguage(language) ? language : null;
}

export const automaticTarget = source => source === 'zh' ? 'en' : 'zh';
export const isDictionaryPair = (source, target) => ['zh', 'en'].includes(source) && ['zh', 'en'].includes(target) && source !== target;

// 本地判断只用于立即选择默认目标；服务仍收到 auto，负责实际源语言识别。
export function detectLanguage(text) {
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Thai}/u.test(text)) return 'th';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';
  const han = text.match(/\p{Script=Han}/gu) || [];
  const words = text.match(/\p{Script=Latin}+/gu) || [];
  if (!han.length && !words.length) return /\p{Letter}/u.test(text) ? 'auto' : null;
  if (han.length === words.length) {
    return /\p{Script=Han}/u.test(text.match(/[\p{Script=Han}\p{Script=Latin}]/u)?.[0] || '') ? 'zh' : 'en';
  }
  return han.length > words.length ? 'zh' : 'en';
}

export function resolveDirection(text, source = 'auto', target = 'auto') {
  const detected = detectLanguage(text);
  const language = source === 'auto' ? detected : source;
  return { from: source, detected: language, to: target === 'auto' ? automaticTarget(language) : target };
}
