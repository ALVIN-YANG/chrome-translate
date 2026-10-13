import { defaultAssistantSettings, normalizeAssistantSettings, LLM_PRESETS, TTS_PRESETS } from './assistant-config.js';
import { pageRpc } from './page-rpc.js';
import { SystemSpeech } from './speech.js';
import { icon } from './icons.js';
const $ = id => document.getElementById(id);
let drafts = defaultAssistantSettings(), kind = 'llm', provider = 'minimax', testing = false, playId;
const native = new SystemSpeech(state => { if (state.status === 'error') status(state.message, true); });
$('reveal-key').innerHTML = icon('eye');
function status(message, error = false) { $('service-status').textContent = message; $('service-status').classList.toggle('error', error); }
function readDraft() {
  const current = drafts[kind].providers[provider];
  for (const field of ['key','baseURL','model','voice','protocol']) if (Object.hasOwn(current, field)) current[field] = $(field === 'baseURL' ? 'service-url' : `service-${field}`).value.trim();
  drafts.tts.speed = Number($('service-speed').value);
  drafts.llm.systemPrompt = $('service-prompt').value;
}
function render() {
  const preset = (kind === 'llm' ? LLM_PRESETS : TTS_PRESETS)[provider];
  const current = drafts[kind].providers[provider];
  $('service-provider').value = provider;
  for (const field of ['key','baseURL','model','voice']) $(field === 'baseURL' ? 'service-url' : `service-${field}`).value = current[field] || '';
  $('service-protocol').replaceChildren();
  const protocols = kind === 'llm' ? { openai: 'OpenAI Chat Completions', anthropic: 'Anthropic Messages', google: 'Google Gemini' } : { openai: 'OpenAI Audio Speech', minimax: 'MiniMax 原生语音', elevenlabs: 'ElevenLabs' };
  for (const [value, name] of Object.entries(protocols)) $('service-protocol').add(new Option(name, value));
  $('service-protocol').value = current.protocol;
  $('service-hint').textContent = preset.hint || '预设可直接修改，填写模型平台的账户凭据。';
  $('cloud-fields').hidden = current.protocol === 'system';
  $('protocol-field').hidden = provider !== 'custom';
  $('voice-field').hidden = kind !== 'tts'; $('speed-field').hidden = kind !== 'tts'; $('prompt-field').hidden = kind !== 'llm';
  $('service-speed').value = drafts.tts.speed; $('speed-value').textContent = `${drafts.tts.speed.toFixed(1)}×`;
  $('service-prompt').value = drafts.llm.systemPrompt;
  $('section-title').textContent = kind === 'llm' ? '选择你的模型' : '找到喜欢的声音';
  $('section-description').textContent = kind === 'llm' ? '围绕选中文字解释、总结或连续提问。' : '所选原文、译文、例句和 AI 回答都用这个声音朗读。';
  $('test-service').textContent = kind === 'llm' ? '测试连接' : '试听声音';
  $('key-hint').textContent = preset.reuse ? '留空时沿用独立翻译页中该平台的 Key，也可以单独填写。' : provider === 'minimax' ? 'MiniMax 的模型和声音可共用同一个 Key。' : 'Key 只保存在当前浏览器，不会同步到云端。';
  $('voice-options').replaceChildren();
  const voices = provider === 'minimax' ? { 'Chinese (Mandarin)_Gentleman': '温润男声', 'Chinese (Mandarin)_Warm_Bestie': '温暖闺蜜', 'female-shaonv': '少女音色', 'English_Trustworthy_Man': '英文男声' } : provider === 'openai' ? { coral:'Coral',alloy:'Alloy',nova:'Nova',shimmer:'Shimmer',onyx:'Onyx' } : {};
  for (const [value, label] of Object.entries(voices)) { const option = new Option(label, value); $('voice-options').append(option); }
}
function setKind(next) {
  readDraft(); stopTest(); kind = next; provider = drafts[kind].provider;
  for (const button of document.querySelectorAll('[data-kind]')) button.setAttribute('aria-selected', String(button.dataset.kind === kind));
  $('service-provider').replaceChildren();
  for (const [id, preset] of Object.entries(kind === 'llm' ? LLM_PRESETS : TTS_PRESETS)) $('service-provider').add(new Option(preset.name, id));
  status(''); render();
}
function stopTest() { native.stop(); if (playId) pageRpc('ct:speech-stop', { playId }).catch(() => {}); playId = null; }
for (const button of document.querySelectorAll('[data-kind]')) button.addEventListener('click', () => setKind(button.dataset.kind));
$('service-provider').addEventListener('change', () => { readDraft(); stopTest(); provider = $('service-provider').value; drafts[kind].provider = provider; status(''); render(); });
$('reveal-key').addEventListener('click', () => { $('service-key').type = $('service-key').type === 'password' ? 'text' : 'password'; $('reveal-key').setAttribute('aria-label', $('service-key').type === 'password' ? '显示 Key' : '隐藏 Key'); });
$('service-speed').addEventListener('input', () => { $('speed-value').textContent = `${Number($('service-speed').value).toFixed(1)}×`; });
$('service-form').addEventListener('submit', async event => {
  event.preventDefault(); readDraft(); stopTest();
  try { await pageRpc('ct:assistant-save', { settings: normalizeAssistantSettings(drafts) }); status('设置已保存，下一次提问或朗读时生效。'); }
  catch (error) { status(error.message, true); }
});
$('test-service').addEventListener('click', async () => {
  if (testing) return; readDraft(); stopTest(); testing = true; $('test-service').disabled = true; status(kind === 'llm' ? '正在等待模型回答…' : '正在准备试听…');
  try {
    if (kind === 'llm') { const result = await pageRpc('ct:assistant-test', { settings: drafts }); status(`连接成功：${result.answer}`); }
    else if (provider === 'system') { native.speak('你好，这是划词朗读的声音测试。', 'zh', 'preview'); status('已开始试听系统声音。'); }
    else { playId = crypto.randomUUID(); await pageRpc('ct:speech-preview', { text: '你好，这是划词朗读的声音测试。', language: 'zh', key: 'preview', playId, settings: drafts }); status('已开始试听，再点击可重新试听。'); }
  } catch (error) { status(error.message, true); }
  finally { testing = false; $('test-service').disabled = false; }
});
window.addEventListener('pagehide', stopTest);
try { drafts = await pageRpc('ct:assistant-load'); } catch { status('安装扩展后可保存配置和测试云端服务。'); }
provider = drafts.llm.provider;
$('service-provider').replaceChildren(); for (const [id, preset] of Object.entries(LLM_PRESETS)) $('service-provider').add(new Option(preset.name, id)); render();
