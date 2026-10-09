import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, detectLanguage, normalizeLanguage, resolveDirection } from '../src/language.js';
import { translate } from '../src/providers.js';
import { TranslationController } from '../src/controller.js';
import { lookupAlternatives } from '../src/dictionary.js';
import { parseModelTerm, resolveInputMode, termNotes } from '../src/terms.js';

const config = { key: 'fixture-key', model: 'fixture-model', appid: 'fixture-appid' };
const json = body => new Response(JSON.stringify(body));

test('常用语言默认译为中文，中文仍默认译为英文，目标可指定', () => {
  assert.equal(Object.keys(LANGUAGES).length, 15);
  for (const [text, language] of [['こんにちは世界', 'ja'], ['안녕하세요', 'ko'], ['Привет, мир', 'ru'], ['مرحبا بالعالم', 'ar'], ['नमस्ते दुनिया', 'hi'], ['สวัสดี', 'th']]) {
    assert.equal(detectLanguage(text), language);
    assert.equal(resolveDirection(text).to, 'zh');
    assert.equal(resolveDirection(text, 'auto', 'fr').to, 'fr');
  }
  for (const text of ['Bonjour', 'Guten Tag', 'Hola', 'Ciao', 'Olá', 'Xin chào', 'Selamat pagi']) assert.equal(resolveDirection(text).to, 'zh');
  assert.equal(resolveDirection('你好').to, 'en');
  assert.equal(resolveDirection('你好', 'auto', 'ja').to, 'ja');
  for (const [code, normalized] of [['zh-Hans', 'zh'], ['jp', 'ja'], ['kor', 'ko'], ['fra', 'fr'], ['ara', 'ar'], ['vie', 'vi'], ['pt_BR', 'pt']]) assert.equal(normalizeLanguage(code), normalized);
  assert.equal(normalizeLanguage('unsupported'), null);
  assert.equal(resolveInputMode('안녕하세요'), 'term');
  assert.equal(resolveInputMode('バックトラック'), 'term');
  assert.equal(resolveInputMode('こんにちは。今日は良い天気です。'), 'text');
});

test('微软及百度的全部目标和源语言使用各自正确代码，仍由服务自动识别', async () => {
  for (const [language, metadata] of Object.entries(LANGUAGES)) {
    for (const provider of ['microsoft', 'baidu']) {
      await translate({ provider, config, text: '你好', from: 'auto', to: language }, async (url, options) => {
        if (provider === 'microsoft') {
          const query = new URL(url).searchParams;
          assert.equal(query.get('to'), metadata.microsoft);
          assert.equal(query.has('from'), false);
          return json([{ translations: [{ text: 'fixture translation' }] }]);
        }
        const body = new URLSearchParams(options.body);
        assert.equal(body.get('to'), metadata.baidu);
        assert.equal(body.get('from'), 'auto');
        assert(body.get('sign'));
        return json({ from: 'zh', trans_result: [{ dst: 'fixture translation' }] });
      });
      await translate({ provider, config, text: 'source text', from: language, to: language === 'zh' ? 'en' : 'zh' }, async (url, options) => {
        if (provider === 'microsoft') {
          assert.equal(new URL(url).searchParams.get('from'), metadata.microsoft);
          return json([{ translations: [{ text: 'fixture translation' }] }]);
        }
        assert.equal(new URLSearchParams(options.body).get('from'), metadata.baidu);
        return json({ trans_result: [{ dst: 'fixture translation' }] });
      });
    }
  }
  await assert.rejects(translate({ provider: 'microsoft', text: 'Hello', to: 'unsupported' }, () => assert.fail('不支持的语言不应发请求')), { code: 'invalid' });
});

test('模型提示词使用指定目标语言，例句语言和中文辅助释义互不混淆', async () => {
  for (const provider of ['deepseek', 'kimi']) {
    for (const [language, metadata] of Object.entries(LANGUAGES)) {
      await translate({ provider, config, text: '回溯', from: 'auto', to: language, mode: 'term' }, async (_url, options) => {
        const prompt = JSON.parse(options.body).messages[0].content;
        assert(prompt.includes(`Translate the user's text into ${metadata.english}.`));
        assert(prompt.includes('Detect the source language automatically.'));
        assert(prompt.includes(`example MUST be in ${metadata.english}`));
        return json({ choices: [{ finish_reason: 'stop', message: { content: '{"translation":"fixture translation","alternatives":[]}' } }] });
      });
    }
  }
  const parsed = parseModelTerm('{"translation":"後戻り","alternatives":[{"text":"遡る","example":"過去の出来事を遡る。","exampleTranslation":"追溯过去发生的事。"}]}', 'ja');
  assert.equal(parsed.candidates[0].exampleLanguage, 'ja');
  assert.equal(parsed.candidates[0].exampleTranslation, '追溯过去发生的事。');
  assert.equal(termNotes('backtrack', 'en', 'zh')[0].exampleLanguage, 'en', '英译中的英文用法仍标记英文声音');
});

test('非中英语言对不查询必应中英词典，服务识别出的法语也不冒充英语', async () => {
  for (const [from, to] of [['zh', 'ja'], ['en', 'fr'], ['ja', 'zh']]) {
    const result = await lookupAlternatives({ text: 'word', from, to }, () => assert.fail('不应查询中英词典'));
    assert.equal(result.status, 'empty');
  }
  const controller = new TranslationController(() => {}, async () => ({ text: '你好', detected: 'fr' }), () => assert.fail('法语不应查询中英词典'));
  await controller.run({ provider: 'microsoft', text: 'Bonjour', from: 'auto', to: 'zh', mode: 'term', automaticTarget: true });
  assert.equal(controller.status, 'success');
});

test('服务识别结果修正有歧义的自动目标，显式目标不被改写', async () => {
  const calls = [], states = [];
  const controller = new TranslationController(state => states.push(state), async request => {
    calls.push(request.to);
    return { text: request.to === 'zh' ? '东京' : 'Tokyo', detected: 'ja' };
  }, () => assert.fail('日语不应查询中英词典'));
  await controller.run({ provider: 'microsoft', text: '東京', from: 'auto', to: 'en', mode: 'term', automaticTarget: true });
  assert.deepEqual(calls, ['en', 'zh']);
  assert.equal(states.filter(state => state.status === 'success').length, 1);
  assert.equal(states.at(-1).result.text, '东京');
  assert.equal(states.at(-1).result.target, 'zh');
  await controller.run({ provider: 'microsoft', text: '東京', from: 'auto', to: 'en', mode: 'term', automaticTarget: false });
  assert.deepEqual(calls, ['en', 'zh', 'en']);
  assert.equal(states.at(-1).result.text, 'Tokyo');
});

test('目标修正期间的新输入和取消信号隔离旧译文', async () => {
  const states = [];
  let finishCorrection, oldSignal;
  const controller = new TranslationController(state => states.push(state), request => {
    if (request.text === '東京' && request.to === 'zh') { oldSignal = request.signal; return new Promise(resolve => { finishCorrection = resolve; }); }
    return Promise.resolve({ text: request.text === '東京' ? 'Tokyo' : '新的译文', detected: request.text === '東京' ? 'ja' : 'en' });
  });
  const old = controller.run({ provider: 'microsoft', text: '東京', from: 'auto', to: 'en', mode: 'text', automaticTarget: true });
  await new Promise(resolve => setImmediate(resolve));
  await controller.run({ provider: 'microsoft', text: 'New sentence.', from: 'auto', to: 'zh', mode: 'text', automaticTarget: true });
  assert(oldSignal.aborted);
  finishCorrection({ text: '旧的东京译文', detected: 'ja' }); await old;
  assert.equal(states.at(-1).result.text, '新的译文');
  assert.equal(states.filter(state => state.status === 'success').length, 1);
});
