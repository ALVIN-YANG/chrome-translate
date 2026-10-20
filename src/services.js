import { defaultSpeechSettings, normalizeSpeechSettings, TTS_PRESETS } from './speech-config.js';
import { pageRpc } from './page-rpc.js';
import { SystemSpeech } from './speech.js';
import { icon } from './icons.js';
const $ = id => document.getElementById(id);
let drafts = defaultSpeechSettings(), provider = 'system', testing = false, playId;
const native = new SystemSpeech(state => { if (state.status === 'error') status(state.message, true); });
$('reveal-key').innerHTML = icon('eye');
$('voice-mark').innerHTML = icon('speaker');
function status(message, error = false) { $('service-status').textContent = message; $('service-status').classList.toggle('error', error); }
function readDraft() {
  const current = drafts.tts.providers[provider];
  for (const field of ['key', 'baseURL', 'model', 'voice', 'protocol']) current[field] = $(field === 'baseURL' ? 'service-url' : `service-${field}`).value.trim();
  drafts.tts.speed = Number($('service-speed').value);
}
function render() {
  const preset = TTS_PRESETS[provider];
  const current = drafts.tts.providers[provider];
  $('service-provider').value = provider;
  for (const field of ['key', 'baseURL', 'model', 'voice']) $(field === 'baseURL' ? 'service-url' : `service-${field}`).value = current[field];
  $('service-protocol').replaceChildren();
  for (const [value, label] of Object.entries({ openai: 'OpenAI Audio Speech', minimax: 'MiniMax 原生语音', elevenlabs: 'ElevenLabs' })) $('service-protocol').add(new Option(label, value));
  $('service-protocol').value = current.protocol;
  $('service-hint').textContent = preset.hint || '填写语音平台的账户凭据，模型和接口地址均可修改。';
  $('cloud-fields').hidden = current.protocol === 'system';
  $('protocol-field').hidden = provider !== 'custom';
  $('service-speed').value = drafts.tts.speed;
  $('speed-value').textContent = `${drafts.tts.speed.toFixed(1)}×`;
  $('key-hint').textContent = preset.reuse ? '留空时沿用翻译设置中硅基流动的 Key，也可以单独填写。' : 'Key 只保存在当前浏览器，不会同步到云端。';
  $('voice-options').replaceChildren();
  const voices = provider === 'minimax' ? { 'Chinese (Mandarin)_Gentleman': '温润男声', 'Chinese (Mandarin)_Warm_Bestie': '温暖闺蜜', 'female-shaonv': '少女音色', 'English_Trustworthy_Man': '英文男声' } : provider === 'openai' ? { coral: 'Coral', alloy: 'Alloy', nova: 'Nova', shimmer: 'Shimmer', onyx: 'Onyx' } : {};
  for (const [value, label] of Object.entries(voices)) $('voice-options').append(new Option(label, value));
}
function stopTest() { native.stop(); if (playId) pageRpc('ct:speech-stop', { playId }).catch(() => {}); playId = null; }
$('service-provider').addEventListener('change', () => { readDraft(); stopTest(); provider = $('service-provider').value; drafts.tts.provider = provider; status(''); render(); });
$('reveal-key').addEventListener('click', () => { $('service-key').type = $('service-key').type === 'password' ? 'text' : 'password'; $('reveal-key').setAttribute('aria-label', $('service-key').type === 'password' ? '显示 Key' : '隐藏 Key'); });
$('service-speed').addEventListener('input', () => { $('speed-value').textContent = `${Number($('service-speed').value).toFixed(1)}×`; });
$('service-form').addEventListener('submit', async event => {
  event.preventDefault(); readDraft(); stopTest();
  try { await pageRpc('ct:voice-save', { settings: normalizeSpeechSettings(drafts) }); status('设置已保存，下一次朗读时生效。'); }
  catch (error) { status(error.message, true); }
});
$('test-service').addEventListener('click', async () => {
  if (testing) return;
  readDraft(); stopTest(); testing = true; $('test-service').disabled = true; status('正在准备试听…');
  try {
    if (provider === 'system') { native.rate = drafts.tts.speed; native.speak('你好，这是划词朗读的声音测试。', 'zh', 'preview'); status('已开始试听系统声音。'); }
    else { playId = crypto.randomUUID(); await pageRpc('ct:speech-preview', { text: '你好，这是划词朗读的声音测试。', language: 'zh', key: 'preview', playId, settings: drafts }); status('已开始试听，再点击可重新试听。'); }
  } catch (error) { status(error.message, true); }
  finally { testing = false; $('test-service').disabled = false; }
});
window.addEventListener('pagehide', stopTest);
try { drafts = await pageRpc('ct:voice-load'); } catch { status('安装扩展后可保存配置和试听云端声音。'); }
provider = drafts.tts.provider;
for (const [id, preset] of Object.entries(TTS_PRESETS)) $('service-provider').add(new Option(preset.name, id));
render();
