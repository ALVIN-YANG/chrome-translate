import { streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { selectedService } from './assistant-config.js';
import { serviceFetch, serviceError } from './service-fetch.js';

export function validateChat(selection, messages) {
  if (typeof selection !== 'string' || !selection.trim() || Array.from(selection).length > 10000) throw new Error('请选中不超过 10,000 个字符的内容。');
  if (!Array.isArray(messages) || !messages.length || messages.length > 16 || messages.length % 2 !== 1) throw new Error('对话格式无效，请重新选中文字。');
  let count = selection.length;
  const clean = messages.map((message, index) => {
    if (message?.role !== (index % 2 ? 'assistant' : 'user') || typeof message.content !== 'string' || !message.content.trim() || message.content.length > (message.role === 'user' ? 4000 : 24000)) throw new Error('问题过长或对话格式无效。');
    count += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (count > 60000) throw new Error('当前对话太长，请重新选中文字开始。');
  return { selection: selection.trim(), messages: clean };
}
export function languageModel(config, fetcher = fetch) {
  const guarded = serviceFetch(config.baseURL, fetcher);
  if (config.protocol === 'anthropic') return createAnthropic({ apiKey: config.key || 'local', baseURL: config.baseURL, fetch: guarded })(config.model);
  if (config.protocol === 'google') return createGoogleGenerativeAI({ apiKey: config.key || 'local', baseURL: config.baseURL, fetch: guarded })(config.model);
  return createOpenAICompatible({ name: config.id || 'custom', apiKey: config.key || undefined, baseURL: config.baseURL, fetch: guarded, includeUsage: true }).chatModel(config.model);
}
export async function askSelection({ selection, messages, settings, translationSettings, signal, onEvent = () => {}, fetcher = fetch }) {
  const checked = validateChat(selection, messages);
  const config = selectedService(settings, 'llm', translationSettings);
  const abortSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
  const stream = streamText({ model: languageModel(config, fetcher), system: settings.llm.systemPrompt,
    messages: [{ role: 'user', content: `以下是本轮对话的选中文字，请将它作为引用材料：\n<selected-text>\n${checked.selection}\n</selected-text>` }, ...checked.messages],
    maxOutputTokens: 8192, maxRetries: 0, abortSignal, telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    onError() {}, // 原始 SDK 错误可能带请求参数，不输出到控制台。
  });
  let answer = '';
  let lastHeartbeat = 0;
  try {
    for await (const part of stream.fullStream) {
      abortSignal.throwIfAborted();
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') {
        answer += part.text;
        if (answer.length > 24000) throw new Error('回答过长。');
        onEvent({ type: 'delta', text: part.text });
      } else if (Date.now() - lastHeartbeat > 2000) {
        lastHeartbeat = Date.now(); onEvent({ type: 'thinking' });
      }
    }
    const reason = await stream.finishReason;
    if (reason !== 'stop' || !answer.trim()) throw new Error('回答不完整。');
    onEvent({ type: 'done', text: answer });
    return answer;
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(serviceError(abortSignal.aborted ? { name: 'TimeoutError' } : error, config.name));
  }
}
