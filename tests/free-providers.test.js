import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { translate, isConfigured } from '../src/providers.js';
import { defaultSettings, normalizeSettings } from '../src/settings.js';

const services = {
  zhipu: ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4.7-flash'],
  siliconflow: ['https://api.siliconflow.cn/v1/chat/completions', 'tencent/Hunyuan-MT-7B'],
  gemini: ['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'gemini-3.1-flash-lite'],
};
const request = { config: { key: ' fixture-key ', model: 'paid-model-must-not-be-used' }, text: 'Please review this design.', from: 'auto', to: 'zh' };
const response = (content, status = 200) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }), { status });

test('三个新增服务仅需 Key，使用各自官方地址和固定免费模型', async () => {
  for (const [provider, [endpoint, model]] of Object.entries(services)) {
    assert.equal(isConfigured(provider, { key: 'fixture-key' }), true);
    const result = await translate({ ...request, provider }, async (url, options) => {
      assert.equal(url, endpoint);
      assert.deepEqual(options.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-key' });
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      assert.equal(body.stream, false);
      if (provider === 'zhipu') assert.deepEqual(body.thinking, { type: 'disabled' });
      if (provider === 'gemini') assert.equal(body.reasoning_effort, 'minimal');
      if (provider === 'siliconflow') {
        assert.equal(body.messages.length, 1);
        assert.match(body.messages[0].content, /without additional explanation/);
        assert(body.messages[0].content.endsWith(request.text));
      } else {
        assert.equal(body.messages[1].content, request.text);
        assert.match(body.messages[0].content, /Return only the translated text/);
      }
      return response('请查看这个设计。');
    });
    assert.equal(result.text, '请查看这个设计。');
  }
});

test('智谱和 Gemini 短词解析候选，保留英文例句和独立中文释义', async () => {
  for (const provider of ['zhipu', 'gemini']) {
    const result = await translate({ ...request, provider, text: '回溯', to: 'en', mode: 'term' }, async (_url, options) => {
      assert.match(JSON.parse(options.body).messages[0].content, /example MUST be in English/);
      return response(JSON.stringify({ translation: 'backtracking', alternatives: [{ text: 'backtrack', context: '算法动作 · 动词', example: 'Backtrack when the path fails.', exampleTranslation: '路径失败时回溯。' }] }));
    });
    assert.equal(result.text, 'backtracking');
    assert.equal(result.candidateStatus, 'ready');
    assert.equal(result.candidates[0].example, 'Backtrack when the path fails.');
    assert.equal(result.candidates[0].exampleTranslation, '路径失败时回溯。');
  }
});

test('混元翻译对短词也返回普通译文，不向专用模型索取词典 JSON', async () => {
  const result = await translate({ ...request, provider: 'siliconflow', text: '回溯', to: 'en', mode: 'term' }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert(!options.body.includes('alternatives'));
    assert(!body.messages[0].content.includes('Return valid JSON'));
    return response('backtracking');
  });
  assert.equal(result.text, 'backtracking');
  assert.equal(result.candidates, undefined);
});

test('已有设置升级保留原 Key，新增设置忽略模型和任意地址注入', () => {
  const result = normalizeSettings({ provider: 'gemini', providers: {
    deepseek: { key: 'old-deepseek-key', model: 'custom-model' },
    kimi: { key: 'old-coding-plan-key', model: 'kimi-for-coding' },
    gemini: { key: ' new-key ', model: 'paid-model', baseUrl: 'https://example.invalid' },
  } });
  assert.equal(result.provider, 'gemini');
  assert.deepEqual(result.providers.gemini, { key: 'new-key' });
  assert.equal(result.providers.deepseek.key, 'old-deepseek-key');
  assert.equal(result.providers.deepseek.model, 'custom-model');
  assert.equal(result.providers.kimi.key, 'old-coding-plan-key');
  assert.deepEqual(result.providers.zhipu, { key: '' });
  assert.equal(defaultSettings().provider, 'microsoft');
});

test('新服务拒绝或限流时不泄露原始响应，也不自动转发到其他厂商', async () => {
  for (const provider of Object.keys(services)) {
    for (const [status, code] of [[401, 'auth'], [429, 'rate_limit'], [503, 'unavailable']]) {
      let calls = 0;
      await assert.rejects(translate({ ...request, provider }, async () => {
        calls++;
        return new Response('{"error":"private-provider-detail"}', { status });
      }), error => error.code === code && !error.message.includes('private-provider-detail'));
      assert.equal(calls, 1);
    }
  }
});

test('扩展权限和 CSP 允许新服务地址，避免网页可用而安装后请求被阻止', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  const connect = manifest.content_security_policy.extension_pages.split('connect-src ')[1].split(';')[0].split(' ');
  for (const [endpoint] of Object.values(services)) {
    const origin = new URL(endpoint).origin;
    assert(manifest.host_permissions.includes(`${origin}/*`), origin);
    assert(connect.includes(origin), origin);
  }
  assert(!manifest.host_permissions.includes('<all_urls>'));
});

test('智谱返回安全拦截、推理中断或上下文超限时，不把部分内容当作成功译文', async () => {
  for (const [reason, code] of [['sensitive', 'filtered'], ['network_error', 'unavailable'], ['model_context_window_exceeded', 'too_long']]) {
    await assert.rejects(translate({ ...request, provider: 'zhipu' }, async () => new Response(JSON.stringify({ choices: [{ finish_reason: reason, message: { content: 'partial-content' } }] }))), { code });
  }
});
