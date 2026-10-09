import { isLanguage } from './language.js';
import { mergeCandidates } from './terms.js';
import { PROVIDERS } from './providers.js';

const KEY = 'translation-workspace-v1';

// 只暂存当前标签页，不包含 Key、账号配置或历史记录。
export function saveWorkspace(workspace, storage) {
  try { (storage || globalThis.sessionStorage).setItem(KEY, JSON.stringify(normalizeWorkspace(workspace))); return true; }
  catch { return false; }
}

export function loadWorkspace(storage) {
  try { return normalizeWorkspace(JSON.parse((storage || globalThis.sessionStorage).getItem(KEY))); }
  catch { return null; }
}

function normalizeWorkspace(data) {
  try {
    if (!data || typeof data.text !== 'string') return null;
    const target = data.target === 'auto' || isLanguage(data.target) ? data.target : 'auto';
    const saved = data.displayed;
    let displayed = null;
    if (saved && typeof saved.sourceText === 'string' && Object.hasOwn(PROVIDERS, saved.provider)
      && ['term', 'text'].includes(saved.mode) && (saved.targetPreference === 'auto' || isLanguage(saved.targetPreference))
      && typeof saved.result?.text === 'string' && isLanguage(saved.result.target)) {
      displayed = {
        sourceText: saved.sourceText, provider: saved.provider, mode: saved.mode, targetPreference: saved.targetPreference,
        result: {
          text: saved.result.text, target: saved.result.target, detected: saved.result.detected,
          candidates: mergeCandidates(saved.result.candidates || []),
          candidateStatus: saved.result.candidateStatus === 'loading' ? 'unavailable' : saved.result.candidateStatus,
          ...(saved.result.primary ? { primary: mergeCandidates([saved.result.primary])[0] } : {}),
          ...(saved.result.dictionaryUrl?.startsWith('https://cn.bing.com/dict/') ? { dictionaryUrl: saved.result.dictionaryUrl } : {}),
        },
      };
    }
    const provider = Object.hasOwn(PROVIDERS, data.provider) ? data.provider : displayed?.provider || 'microsoft';
    return { text: data.text, target, provider, displayed };
  } catch { return null; }
}

export function matchesWorkspace(displayed, text, targetPreference, provider) {
  return Boolean(displayed && displayed.sourceText === text && displayed.targetPreference === targetPreference && displayed.provider === provider);
}
