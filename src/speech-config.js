// 沿用已有存储键，保留本机声音、接口和凭据。
export const SPEECH_SETTINGS_KEY = 'selection-services-v1';
export const TTS_PRESETS = {
  system: { name: '系统声音', protocol: 'system', baseURL: '', model: '', voice: '', hint: '本机朗读，无需 Key' },
  minimax: { name: 'MiniMax', protocol: 'minimax', baseURL: 'https://api.minimaxi.com/v1', model: 'speech-2.8-turbo', voice: '', hint: '留空音色时按中英文选声音，也可填写自己的音色 ID' },
  openai: { name: 'OpenAI', protocol: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: 'coral' },
  elevenlabs: { name: 'ElevenLabs', protocol: 'elevenlabs', baseURL: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM' },
  siliconflow: { name: '硅基流动', protocol: 'openai', baseURL: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'FunAudioLLM/CosyVoice2-0.5B:alex', reuse: 'siliconflow' },
  custom: { name: '自定义语音', protocol: 'openai', baseURL: '', model: '', voice: '' },
};
export function defaultSpeechSettings() {
  return { tts: { provider: 'system', speed: 1, providers: Object.fromEntries(Object.entries(TTS_PRESETS).map(([id, preset]) => [id, { key: '', baseURL: preset.baseURL, model: preset.model, protocol: preset.protocol, voice: preset.voice }])) } };
}
export function normalizeSpeechSettings(raw) {
  const result = defaultSpeechSettings();
  if (Object.hasOwn(TTS_PRESETS, raw?.tts?.provider)) result.tts.provider = raw.tts.provider;
  for (const [id, fields] of Object.entries(result.tts.providers)) {
    for (const field of Object.keys(fields)) {
      const value = raw?.tts?.providers?.[id]?.[field];
      if (typeof value === 'string' && value.length <= (field === 'key' ? 4096 : 512)) fields[field] = value.trim();
    }
    if (!['openai', 'minimax', 'elevenlabs'].includes(fields.protocol) || id !== 'custom' && fields.protocol !== TTS_PRESETS[id].protocol) fields.protocol = TTS_PRESETS[id].protocol;
    if (id !== 'custom') {
      if (!fields.model) fields.model = TTS_PRESETS[id].model;
      if (!fields.baseURL) fields.baseURL = TTS_PRESETS[id].baseURL;
    }
  }
  // 旧版 MiniMax 声音可沿用模型 Key；复制到声音配置，避免升级后丢失朗读权限。
  const legacyKey = raw?.llm?.providers?.minimax?.key;
  if (!result.tts.providers.minimax.key && typeof legacyKey === 'string' && legacyKey.length <= 4096) result.tts.providers.minimax.key = legacyKey.trim();
  if (typeof raw?.tts?.speed === 'number' && raw.tts.speed >= 0.5 && raw.tts.speed <= 2) result.tts.speed = raw.tts.speed;
  return result;
}
export function validateServiceURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('请填写完整的 API 地址。'); }
  if (url.protocol === 'http:' && url.hostname === '[::1]') throw new Error('本机 HTTP 服务请使用 localhost 或 127.0.0.1。');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && local)) throw new Error('服务地址需使用 HTTPS；只有本机服务可以使用 HTTP。地址不能包含账户、查询参数或片段。');
  return url.href.replace(/\/+$/, '');
}
export function selectedSpeechService(settings, translationSettings = {}) {
  const id = settings.tts.provider;
  const config = { ...settings.tts.providers[id] };
  if (!config.key && TTS_PRESETS[id].reuse) config.key = translationSettings.providers?.[TTS_PRESETS[id].reuse]?.key || '';
  if (config.protocol === 'system') return { id, name: TTS_PRESETS[id].name, ...config };
  config.baseURL = validateServiceURL(config.baseURL);
  if (!config.model || config.protocol !== 'minimax' && !config.voice) throw new Error('请配置模型和音色后再试。');
  if (!config.key && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.baseURL).hostname)) throw new Error(`请先在声音设置中填写${TTS_PRESETS[id].name}的 API Key。`);
  return { id, name: TTS_PRESETS[id].name, ...config };
}
export function publicSpeechSettings(settings, translationSettings = {}) {
  const provider = settings.tts.provider;
  let configured = true;
  try { selectedSpeechService(settings, translationSettings); } catch { configured = false; }
  return { provider, name: TTS_PRESETS[provider].name, configured, speed: settings.tts.speed };
}
export async function loadSpeechSettings() {
  const data = await chrome.storage.local.get(SPEECH_SETTINGS_KEY);
  return normalizeSpeechSettings(data[SPEECH_SETTINGS_KEY]);
}
export async function saveSpeechSettings(settings) {
  const result = normalizeSpeechSettings(settings);
  const config = result.tts.providers[result.tts.provider];
  if (config.protocol !== 'system') config.baseURL = validateServiceURL(config.baseURL);
  await chrome.storage.local.set({ [SPEECH_SETTINGS_KEY]: result });
  return result;
}
