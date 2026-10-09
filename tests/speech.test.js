import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemSpeech } from '../src/speech.js';

const english = { name: 'System English', lang: 'en-US', localService: true };
const chinese = { name: 'System Chinese', lang: 'zh_CN', localService: true };
function fixture(voices = [english, chinese], voiceTimeoutMs = 30) {
  class Synthesis extends EventTarget {
    voices = voices;
    utterances = [];
    canceled = 0;
    getVoices() { return this.voices; }
    speak(utterance) { this.utterances.push(utterance); }
    cancel() { this.canceled++; this.utterances.at(-1)?.onerror?.({ error: 'canceled' }); }
  }
  const synthesis = new Synthesis();
  const states = [];
  const speech = new SystemSpeech(state => states.push(state), { synthesis, Utterance: class { constructor(text) { this.text = text; } }, voiceTimeoutMs });
  return { speech, synthesis, states };
}

test('按译文语言选择本地声音，不使用同语言的远程声音', () => {
  const { speech, synthesis } = fixture([{ ...english, localService: false, default: true }, { ...english, lang: 'en-GB' }, chinese]);
  speech.speak('backtrack', 'en', 'candidate:backtrack');
  const first = synthesis.utterances[0];
  assert.equal(first.voice.lang, 'en-GB');
  assert.equal(first.voice.localService, true);
  first.onstart();
  assert.equal(speech.state.status, 'speaking');
  speech.speak('回溯', 'zh', 'result');
  assert.equal(synthesis.utterances[1].voice, chinese);
  synthesis.utterances[1].onend();
  assert.equal(speech.state.status, 'idle');
});

test('macOS 英文默认避免列表前部的音效声音，优先普通人声', () => {
  const { speech, synthesis } = fixture([{ ...english, name: 'Albert' }, { ...english, name: 'Samantha' }, chinese]);
  speech.speak('hello', 'en', 'result');
  assert.equal(synthesis.utterances[0].voice.name, 'Samantha');
  speech.stop();
});

test('日语等新增语言匹配本地声音，缺少对应声音时不误用英语', () => {
  const japanese = { name: 'System Japanese', lang: 'ja-JP', localService: true };
  const { speech, synthesis } = fixture([english, chinese, japanese]);
  speech.speak('過去の出来事を遡る。', 'ja', 'example');
  assert.equal(synthesis.utterances[0].voice, japanese);
  assert.equal(synthesis.utterances[0].lang, 'ja-JP');
  speech.speak('Bonjour', 'fr', 'example-fr');
  assert.equal(synthesis.utterances.length, 1);
  assert.match(speech.state.message, /未找到系统法语声音/);
});

test('停止和切换朗读隔离旧回调，不播放旧文本的后续分段', () => {
  const { speech, synthesis } = fixture();
  speech.speak('A sentence. '.repeat(80), 'en', 'old');
  const old = synthesis.utterances[0];
  speech.speak('新的译文', 'zh', 'new');
  old.onstart(); old.onend(); old.onerror({ error: 'synthesis-failed' });
  assert.equal(synthesis.utterances.length, 2);
  assert.equal(speech.state.key, 'new');
  speech.stop();
  synthesis.utterances[1].onend();
  assert.equal(speech.state.status, 'idle');
  assert.equal(synthesis.utterances.length, 2);
});

test('长段落全部顺序朗读，分段不丢失字符或拆开 Unicode 字符', () => {
  const { speech, synthesis } = fixture();
  const text = 'This is a long sentence for translation. '.repeat(20) + '😊'.repeat(260);
  speech.speak(text, 'en', 'result');
  for (let i = 0; i < synthesis.utterances.length; i++) synthesis.utterances[i].onend();
  assert.equal(synthesis.utterances.map(utterance => utterance.text).join(''), text);
  assert(synthesis.utterances.every(utterance => Array.from(utterance.text).length <= 240));
  assert.equal(speech.state.status, 'idle');
});

test('异步声音列表加载后开始朗读，停止等待后不再触发播放', () => {
  const { speech, synthesis } = fixture([]);
  speech.speak('hello', 'en', 'result');
  assert.equal(speech.state.status, 'loading');
  synthesis.voices = [english]; synthesis.dispatchEvent(new Event('voiceschanged'));
  assert.equal(synthesis.utterances.length, 1);
  speech.stop(); synthesis.voices = [];
  speech.speak('old', 'en', 'result'); speech.stop();
  synthesis.voices = [english]; synthesis.dispatchEvent(new Event('voiceschanged'));
  assert.equal(synthesis.utterances.length, 1);
  assert.equal(speech.state.status, 'idle');
});

test('无本地匹配声音或浏览器不支持时明确提示，仍可复制译文', async () => {
  const { speech, synthesis } = fixture([{ ...english, localService: false }]);
  speech.speak('hello', 'en', 'result');
  assert.equal(synthesis.utterances.length, 0);
  assert.match(speech.state.message, /未找到系统英文声音/);
  const waiting = fixture([], 5);
  waiting.speech.speak('hello', 'en', 'result');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(waiting.speech.state.status, 'error');
  assert.match(waiting.speech.state.message, /尚未就绪/);
  const unsupported = new SystemSpeech(() => {}, { synthesis: null, Utterance: null });
  unsupported.speak('hello', 'en', 'result');
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.state.message, /不支持/);
});

test('真实播放报错恢复按钮状态，不循环播放或留下排队内容', () => {
  const { speech, synthesis } = fixture();
  speech.speak('hello', 'en', 'result');
  synthesis.utterances[0].onerror({ error: 'not-allowed' });
  assert.equal(speech.state.key, null);
  assert.match(speech.state.message, /未允许朗读/);
  synthesis.utterances[0].onend();
  assert.equal(synthesis.utterances.length, 1);
});
