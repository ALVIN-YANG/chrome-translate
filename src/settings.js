export const SETTINGS_KEY = 'translation-settings-v1';

export function defaultSettings() {
  return {
    provider: 'microsoft',
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

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  if (isExtension) await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
  else previewSettings = normalized;
}
