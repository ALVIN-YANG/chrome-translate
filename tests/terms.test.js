import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { resolveInputMode, termNotes, mergeCandidates, parseModelTerm } from '../src/terms.js';
import { parseDictionary, lookupAlternatives } from '../src/dictionary.js';
import { translate } from '../src/providers.js';
import { TranslationController } from '../src/controller.js';

// 根据实际词典响应截取结构，保留被拆成多个 <a> 的短语。
const dictionary = `<div class="qdef"><div id="headword"><h1><strong>回溯</strong></h1></div>
<ul><li><span class="pos">na.</span><span class="def"><a>recall</a><span>;</span><a>look</a> <a>back</a> <a>upon</a></span></li>
<li><span class="pos web">网络</span><span class="def"><a>backtracking</a>; <a>trace</a> <a>back</a>; <a>backdate</a></span></li></ul>
<script>throw new Error('must not execute')</script><img src="https://example.invalid/tracker"><a>NOT A DEFINITION</a></div>`;

test('自动区分词语、短语和句段，并允许手动纠正', () => {
  for (const text of ['回溯', '回溯算法', 'backtrack', 'binary search', 'return value', 'C++']) assert.equal(resolveInputMode(text), 'term', text);
  for (const text of ['请使用回溯算法解决这个问题。', '使用回溯算法解决问题', '我们用回溯算法', 'Use backtracking to solve it', 'I love programming', 'How are you?', 'Good morning.', '第一段\n第二段', 'This is a longer paragraph with enough context to translate.']) assert.equal(resolveInputMode(text), 'text', text);
  assert.equal(resolveInputMode('你好', 'text'), 'text');
  assert.equal(resolveInputMode('Go home.', 'term'), 'term');
});

test('回溯候选区分算法名词、动词及其他语境，不改写完整句子', () => {
  const notes = termNotes('回溯', 'zh', 'en');
  assert(notes.some(item => item.text === 'backtracking' && item.context.includes('算法')));
  assert(notes.some(item => item.text === 'backtrack' && item.context.includes('动词')));
  assert(notes.some(item => item.text === 'trace back' && item.context.includes('来源')));
  assert(notes.some(item => item.text === 'retrospective' && item.context.includes('回顾')));
  assert.deepEqual(termNotes('请用回溯算法解决问题', 'zh', 'en'), []);
  assert.equal(termNotes('backtrack', 'en', 'zh')[0].text, '回溯');
});

test('词典从真实词义结构提取完整短语，忽略脚本和其他页面文本', () => {
  const candidates = parseDictionary(dictionary, '回溯', 'zh', 'en', DOMParser);
  assert.deepEqual(candidates.map(item => item.text), ['recall', 'look back upon', 'backtracking', 'trace back', 'backdate']);
  assert.match(candidates.find(item => item.text === 'backtracking').context, /算法/);
  assert.deepEqual(parseDictionary(dictionary, '另一个词', 'zh', 'en', DOMParser), [], '不得把近似搜索结果当成原词词义');
  const english = '<div class="qdef"><div id="headword">bank</div><ul><li><span class="pos">n.</span><span class="def">银行；河岸</span></li></ul></div>';
  assert.deepEqual(parseDictionary(english, 'bank', 'en', 'zh', DOMParser).map(item => item.text), ['银行', '河岸']);
  assert.deepEqual(parseDictionary('<html>Verification required</html>', '回溯', 'zh', 'en', DOMParser), []);
});

test('候选去重，限制输出数量和长度，保留优先提供的语境', () => {
  const candidates = mergeCandidates([{ text: 'Backtracking', context: '算法' }, { text: 'backtracking', context: '重复词义' }, { text: '', context: '空' }, { text: 'x'.repeat(121) }, null]);
  assert.deepEqual(candidates.map(item => [item.text, item.context]), [['Backtracking', '算法']]);
});

test('模型短词返回结构化候选；完整句子仍请求纯译文', async () => {
  const requests = [];
  const config = { key: 'fixture-key', model: 'fixture-model' };
  const fetcher = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translation: 'backtracking', alternatives: [{ text: 'backtrack', context: '算法动作 · 动词' }, { text: 'trace back', context: '追溯来源' }] }) } }] }));
  };
  const result = await translate({ provider: 'deepseek', config, text: '回溯', to: 'en', mode: 'term' }, fetcher);
  assert.equal(result.text, 'backtracking'); assert.equal(result.candidates.length, 2);
  assert.match(requests[0].messages[0].content, /Do not invent meanings/);
  assert.match(requests[0].messages[0].content, /example MUST be in English/);
  assert.match(requests[0].messages[0].content, /separate exampleTranslation field/);
  await translate({ provider: 'deepseek', config, text: '我们会使用回溯算法。', to: 'en', mode: 'text' }, fetcher);
  assert.match(requests[1].messages[0].content, /Return only the translated text/);
  assert(!requests[1].messages[0].content.includes('Return valid JSON'));
  assert.equal(parseModelTerm('```json\n{"translation":"backtrack","alternatives":[]}\n```').text, 'backtrack');
  assert.equal(parseModelTerm('{"translation":'), null);
  assert.equal(parseModelTerm('Ordinary translation').text, 'Ordinary translation');
});

test('英文译法保留英文例句及独立中文释义，纯中文或无效例句不冒充英文', () => {
  const json = JSON.stringify({ translation: 'backtracking', alternatives: [
    { text: 'backtrack', context: '算法动作', example: 'If a path fails, backtrack and try another one.', exampleTranslation: '如果一条路径失败，就回溯并尝试另一条。' },
    { text: 'trace back', context: '追溯来源', example: '我们可以追溯这个问题的原因。', exampleTranslation: '这是纯中文例句。' },
    { text: 'look back', example: { invalid: true } },
  ] });
  const result = parseModelTerm(json, 'en');
  assert.equal(result.candidates[0].example, 'If a path fails, backtrack and try another one.');
  assert.equal(result.candidates[0].exampleTranslation, '如果一条路径失败，就回溯并尝试另一条。');
  assert.equal(result.candidates[1].example, '');
  assert.equal(result.candidates[1].exampleTranslation, undefined);
  assert.equal(result.candidates[1].text, 'trace back', '例句错误不应丢弃有效词义');
  assert.equal(result.candidates[2].example, '');
  assert.equal(parseModelTerm(json, 'zh').candidates[1].example, '我们可以追溯这个问题的原因。', '中文目标仍允许中文例句');
});

test('DeepSeek 和 Kimi 都要求英文例句，并在服务响应入口过滤纯中文例句', async () => {
  for (const provider of ['deepseek', 'kimi']) {
    const result = await translate({ provider, config: { key: 'fixture-key', model: 'fixture-model' }, text: '追溯', to: 'en', mode: 'term' }, async (_url, options) => {
      assert.match(JSON.parse(options.body).messages[0].content, /example MUST be in English/);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translation: 'trace back', alternatives: [{ text: 'look back', example: '回顾过去的事情。' }] }) } }] }));
    });
    assert.equal(result.candidates[0].example, '', provider);
    assert.equal(result.candidates[0].text, 'look back');
  }
});

test('词典不可用不影响主译文；短词优先显示主译文再补充候选', async () => {
  const states = [];
  let finishLookup;
  const controller = new TranslationController(state => states.push(state), async () => ({ text: 'Retrospective' }), () => new Promise(resolve => { finishLookup = resolve; }));
  const pending = controller.run({ provider: 'microsoft', text: '回溯', from: 'auto', to: 'en', mode: 'term' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).result.text, 'Retrospective');
  assert(states.at(-1).result.candidates.some(item => item.text === 'backtrack'));
  assert.equal(states.at(-1).result.candidateStatus, 'loading');
  finishLookup({ candidates: termNotes('回溯', 'zh', 'en'), status: 'unavailable' }); await pending;
  assert.equal(states.at(-1).phase, 'alternatives');
  assert.equal(states.at(-1).status, 'success');
});

test('词典响应晚到不能污染新句子的结果，清空也会取消候选查询', async () => {
  const states = [], lookups = [];
  const controller = new TranslationController(state => states.push(state), async req => ({ text: req.text }), req => new Promise(resolve => lookups.push({ req, resolve })));
  const first = controller.run({ provider: 'microsoft', text: '回溯', from: 'auto', to: 'en', mode: 'term' });
  await new Promise(resolve => setImmediate(resolve));
  const second = controller.run({ provider: 'microsoft', text: '请使用回溯算法。', from: 'auto', to: 'en', mode: 'text' });
  await second;
  assert(lookups[0].req.signal.aborted);
  lookups[0].resolve({ candidates: [{ text: 'stale' }], status: 'ready' }); await first;
  assert.equal(states.at(-1).result.text, '请使用回溯算法。');
  assert.equal(states.filter(state => state.phase === 'alternatives').length, 0);
  const third = controller.run({ provider: 'microsoft', text: '回溯', from: 'auto', to: 'en', mode: 'term' });
  await new Promise(resolve => setImmediate(resolve)); controller.reset();
  lookups[1].resolve({ candidates: [{ text: 'stale' }], status: 'ready' }); await third;
  assert.equal(states.at(-1).status, 'idle');
});

test('词典失败使用术语补充且不发送任何凭据；取消信号正常传播', async () => {
  const result = await lookupAlternatives({ text: '回溯', from: 'auto', to: 'en' }, async (_url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined); throw new TypeError('offline');
  });
  assert.equal(result.status, 'unavailable');
  assert(result.candidates.some(item => item.text === 'backtracking'));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(lookupAlternatives({ text: '回溯', from: 'auto', to: 'en', signal: abort.signal }));
});
