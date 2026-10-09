export const SETTINGS_KEY = 'translation-settings-v1';

export function defaultSettings() {
  return {
    provider: 'microsoft',
    page: { target: 'zh', selection: true, floating: true },
    providers: {
      microsoft: {},
      baidu: { appid: '', key: '' },
      zhipu: { key: '' },
      siliconflow: { key: '' },
      gemini: { key: '' },
      deepseek: { key: '', model: 'deepseek-flash' },
      kimi: { key: '', model: 'kimi-for-coding' },
    },
  };
}

export function normalizeSettings(raw) {
  const result = defaultSettings();
  if (Object.hasOwn(result.providers, raw?.provider)) result.provider = raw.provider;
  const targets = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'it', 'ar', 'hi', 'th', 'vi', 'id'];
  if (targets.includes(raw?.page?.target)) result.page.target = raw.page.target;
  for (const key of ['selection', 'floating']) {
    if (typeof raw?.page?.[key] === 'boolean') result.page[key] = raw.page[key];
  }
  for (const [provider, fields] of Object.entries(result.providers)) {
    for (const key of Object.keys(fields)) {
      const value = raw?.providers?.[provider]?.[key];
      if (typeof value === 'string') fields[key] = value.trim();
    }
    if ('model' in fields && !fields.model) fields.model = defaultSettings().providers[provider].model;
  }
  return result;
}

export const isExtension = Boolean(globalThis.chrome?.storage?.local && globalThis.chrome?.runtime?.id);
let previewSettings = defaultSettings();

export async function loadSettings() {
  if (!isExtension) return structuredClone(previewSettings);
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings, { updatePage = false } = {}) {
  const normalized = normalizeSettings(settings);
  if (isExtension) {
    // 独立翻译页打开后，工具栏仍可能调整网页偏好，保存 Key 时保留最新网页偏好。
    if (!updatePage) normalized.page = (await loadSettings()).page;
    await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
  }
  else previewSettings = normalized;
}
