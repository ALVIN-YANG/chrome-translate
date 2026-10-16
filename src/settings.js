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

export function providerChanges(before, after) {
  const previous = normalizeSettings({ providers: before }).providers;
  const next = normalizeSettings({ providers: after }).providers;
  const changes = {};
  for (const [provider, fields] of Object.entries(next)) {
    const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== previous[provider][key]));
    if (Object.keys(changed).length) changes[provider] = changed;
  }
  return changes;
}

function mergeSettings(current, patch) {
  const next = normalizeSettings(current);
  if (Object.hasOwn(next.providers, patch.provider)) next.provider = patch.provider;
  next.page = { ...next.page, ...patch.page };
  for (const provider of Object.keys(next.providers)) next.providers[provider] = { ...next.providers[provider], ...patch.providers?.[provider] };
  return normalizeSettings(next);
}

export async function updateSettings(patch) {
  const snapshot = structuredClone(patch);
  if (!isExtension) {
    previewSettings = mergeSettings(previewSettings, snapshot);
    return structuredClone(previewSettings);
  }
  // 扩展页和后台共享同源锁；读取最新值与写入必须属于同一次操作。
  return navigator.locks.request(SETTINGS_KEY, async () => {
    const next = mergeSettings(await loadSettings(), snapshot);
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  });
}
