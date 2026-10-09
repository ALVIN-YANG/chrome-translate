import { isLanguage } from './language.js';
import { PROVIDERS } from './providers.js';

export const MESSAGE_PREFIX = 'ct:';
export function safeSettings(settings) {
  return {
    provider: settings.provider,
    page: settings.page,
    services: Object.entries(PROVIDERS).map(([id, service]) => ({ id, name: service.name,
      configured: service.fields.filter(field => field.required).every(field => settings.providers[id]?.[field.name]?.trim()) })),
  };
}
export function validateTranslationMessage(message) {
  if (!Object.hasOwn(PROVIDERS, message?.provider) || !isLanguage(message.to)
    || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId)) throw new Error('翻译参数无效。');
  if (message.type === 'ct:page-translate') {
    if (!Array.isArray(message.texts) || !message.texts.length || message.texts.length > 8
      || message.texts.some(text => typeof text !== 'string' || !text.trim() || Array.from(text).length > 1600)) throw new Error('网页翻译参数无效。');
    return { provider: message.provider, to: message.to, texts: message.texts };
  }
  if (message.type !== 'ct:selection-translate' || typeof message.text !== 'string' || !message.text.trim()
    || Array.from(message.text).length > 10000 || !['text', 'term'].includes(message.mode)) throw new Error('划词翻译参数无效，单次最多 10,000 个字符。');
  return { provider: message.provider, to: message.to, text: message.text, mode: message.mode, from: 'auto' };
}
export function isPageSender(sender, extensionId) {
  return sender?.id === extensionId && Number.isInteger(sender.tab?.id) && sender.frameId === 0
    && /^https?:\/\//i.test(sender.url || '');
}
