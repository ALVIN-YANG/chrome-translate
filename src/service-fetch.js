import { validateServiceURL } from './speech-config.js';
export function serviceFetch(baseURL, fetcher = fetch, { maxBytes = 2 * 1024 * 1024, audio = false } = {}) {
  const origin = new URL(validateServiceURL(baseURL)).origin;
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== origin) throw new Error('服务请求地址与已配置地址不一致。');
    const response = await fetcher(input, { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('服务返回的内容过大，请缩短选中文字。');
    if (audio && response.ok && !/^(audio\/|application\/octet-stream)/i.test(response.headers.get('content-type') || '')) throw new Error('语音接口应返回音频文件，请检查接口类型。');
    if (!response.body) return response;
    let count = 0;
    const limited = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
      count += chunk.byteLength;
      if (count > maxBytes) throw new Error('服务返回的内容过大，请缩短选中文字。');
      controller.enqueue(chunk);
    } }));
    return new Response(limited, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
export function serviceError(error, label = '服务') {
  if (error?.code === 'voice') return `${label}音色 ID 不可用，请在声音设置中检查音色。`;
  const status = error?.statusCode || error?.status;
  if (status === 401 || status === 403) return `${label}拒绝授权，请检查 Key 和账号权限。`;
  if (status === 429) return `${label}请求过于频繁或额度不足，请稍后重试。`;
  if (status === 402) return `${label}额度不足，请检查账号余额。`;
  if (error?.name === 'TimeoutError') return `${label}响应超时，请重试。`;
  // SDK 的错误通常包含原始响应和请求参数，不直接回显。
  return `${label}未完成请求，请检查网络、接口、模型和账号状态。`;
}
