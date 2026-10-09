import { TranslationError } from './providers.js';
export async function pageRpc(type, payload = {}, signal) {
  signal?.throwIfAborted();
  const requestId = crypto.randomUUID();
  const cancel = () => chrome.runtime.sendMessage({ type: 'ct:cancel', requestId }).catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await chrome.runtime.sendMessage({ type, ...payload, requestId });
    signal?.throwIfAborted();
    if (!response?.ok) throw new TranslationError(response?.error?.code || 'unavailable', response?.error?.message || '插件连接已断开，请刷新网页后重试。');
    return response.data;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TranslationError) throw error;
    throw new TranslationError('unavailable', '插件连接已断开，请刷新网页后重试。');
  } finally { signal?.removeEventListener('abort', cancel); }
}
