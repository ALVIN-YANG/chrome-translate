import { generateSpeech } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { serviceFetch, serviceError } from './service-fetch.js';
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export function decodeMiniMax(data) {
  if (data?.base_resp?.status_code !== 0) {
    const error = new Error('MiniMax 没有生成音频。');
    if (data?.base_resp?.status_code === 2054) error.code = 'voice';
    error.statusCode = [1004, 2049].includes(data?.base_resp?.status_code) ? 401 : data?.base_resp?.status_code === 1002 ? 429 : 400;
    throw error;
  }
  const hex = data?.data?.audio;
  if (typeof hex !== 'string' || !hex.length || hex.length % 2 || hex.length / 2 > MAX_AUDIO_BYTES || !/^[a-f\d]+$/i.test(hex)) throw new Error('音频格式无效。');
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}
export function miniMaxSpeechModel(config, fetcher = fetch) {
  const guarded = serviceFetch(config.baseURL, fetcher, { maxBytes: MAX_AUDIO_BYTES * 2 + 65536 });
  return { specificationVersion: 'v4', provider: 'minimax.speech', modelId: config.model,
    async doGenerate({ text, voice, speed = 1, abortSignal }) {
      const response = await guarded(`${config.baseURL}/t2a_v2`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` }, signal: abortSignal,
        body: JSON.stringify({ model: config.model, text, stream: false, output_format: 'hex', language_boost: 'auto',
          voice_setting: { voice_id: voice, speed, vol: 1, pitch: 0 }, audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 } }) });
      if (!response.ok) { const error = new Error('MiniMax 请求失败。'); error.statusCode = response.status; throw error; }
      return { audio: decodeMiniMax(await response.json()), mediaType: 'audio/mpeg', warnings: [], response: { timestamp: new Date(), modelId: config.model } };
    },
  };
}
export async function synthesize({ text, language = 'zh', config, speed = 1, signal, fetcher = fetch }) {
  const abortSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  let model;
  const voice = config.voice || (language === 'en' ? 'English_Trustworthy_Man' : 'Chinese (Mandarin)_Gentleman');
  if (config.protocol === 'minimax') model = miniMaxSpeechModel(config, fetcher);
  else if (config.protocol === 'elevenlabs') {
    const guarded = serviceFetch(config.baseURL, fetcher, { maxBytes: MAX_AUDIO_BYTES, audio: true });
    model = createElevenLabs({ apiKey: config.key, fetch: (input, init) => {
      const original = new URL(typeof input === 'string' ? input : input.url);
      return guarded(`${config.baseURL}${original.pathname.replace(/^\/v1/, '')}${original.search}`, init);
    } }).speech(config.model);
  } else model = createOpenAI({ apiKey: config.key || 'local', baseURL: config.baseURL, fetch: serviceFetch(config.baseURL, fetcher, { maxBytes: MAX_AUDIO_BYTES, audio: true }) }).speech(config.model);
  try {
    const result = await generateSpeech({ model, text, voice, speed, outputFormat: 'mp3', abortSignal, maxRetries: 0, telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false } });
    const bytes = result.audio.uint8Array;
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error('音频为空或过大。');
    return new Blob([bytes], { type: result.audio.mediaType || 'audio/mpeg' });
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(serviceError(abortSignal.aborted ? { name: 'TimeoutError' } : error, config.name));
  }
}
export function splitCloudSpeech(text, limit = 900) {
  const chars = Array.from(text.trim());
  const chunks = [];
  for (let start = 0; start < chars.length;) {
    let end = Math.min(start + limit, chars.length);
    if (end < chars.length) for (let index = end - 1; index > start + limit / 2; index--) if (/[。！？.!?\s]/u.test(chars[index])) { end = index + 1; break; }
    chunks.push(chars.slice(start, end).join('')); start = end;
  }
  return chunks;
}
