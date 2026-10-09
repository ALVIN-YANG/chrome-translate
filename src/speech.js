import { LANGUAGES, normalizeLanguage } from './language.js';

// 只使用设备本地声音；翻译服务无需提供语音接口或 Key。
export class SystemSpeech {
  constructor(onState, { synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, voiceTimeoutMs = 3000 } = {}) {
    this.synthesis = synthesis;
    this.Utterance = Utterance;
    this.onState = onState;
    this.voiceTimeoutMs = voiceTimeoutMs;
    this.version = 0;
    this.state = { status: 'idle', key: null };
    this.supported = Boolean(synthesis && Utterance);
    // Chrome 的声音列表可能异步加载，提前请求一次。
    if (this.supported) synthesis.getVoices();
  }

  update(status, key = null, message = '') {
    this.state = { status, key, message };
    this.onState(this.state);
  }

  clearVoiceWait() {
    clearTimeout(this.voiceTimer);
    if (this.voiceListener) this.synthesis.removeEventListener('voiceschanged', this.voiceListener);
    this.voiceListener = null;
  }

  stop() {
    this.version++;
    this.clearVoiceWait();
    this.utterance = null;
    this.synthesis?.cancel();
    this.update('idle');
  }

  speak(text, language, key) {
    this.stop();
    if (!text.trim()) return;
    if (!this.supported) {
      this.update('error', null, '当前浏览器不支持系统朗读，请在 Chrome 中使用。');
      return;
    }
    const version = this.version;
    this.update('loading', key);
    const start = () => {
      if (version !== this.version) return;
      const voices = this.synthesis.getVoices();
      if (!voices.length) return;
      this.clearVoiceWait();
      const locale = LANGUAGES[language]?.speech.toLowerCase();
      const matches = voices.filter(voice => voice.localService && normalizeLanguage(voice.lang) === language);
      const voice = matches.find(voice => voice.lang.toLowerCase().replaceAll('_', '-') === locale && voice.default)
        // macOS 的列表包含排在普通人声前的音效声音，优先常规人声。
        || matches.find(voice => voice.lang.toLowerCase().replaceAll('_', '-') === locale && ['Samantha', '婷婷'].includes(voice.name))
        || matches.find(voice => voice.lang.toLowerCase().replaceAll('_', '-') === locale)
        || matches.find(voice => voice.default) || matches[0];
      if (!voice) {
        this.update('error', null, `未找到系统${language === 'en' ? '英文' : LANGUAGES[language]?.name || '对应语言'}声音，请在系统设置中安装对应语音后重试。`);
        return;
      }
      // 分段朗读长文本，避免单个 utterance 超长；不丢字、不截断内容。
      const chunks = splitSpeech(text.trim());
      let index = 0;
      const next = () => {
        if (version !== this.version) return;
        if (index === chunks.length) { this.utterance = null; this.update('idle'); return; }
        const utterance = new this.Utterance(chunks[index++]);
        this.utterance = utterance;
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = 1;
        utterance.onstart = () => { if (version === this.version) this.update('speaking', key); };
        utterance.onend = next;
        utterance.onerror = event => {
          if (version !== this.version) return;
          this.version++;
          this.utterance = null;
          this.synthesis.cancel();
          this.update('error', null, event.error === 'not-allowed' ? '浏览器未允许朗读，请重新点击朗读按钮。' : '系统朗读未完成，请重试或检查系统声音设置。');
        };
        try { this.synthesis.speak(utterance); }
        catch { utterance.onerror({ error: 'synthesis-failed' }); }
      };
      next();
    };
    this.voiceListener = start;
    this.synthesis.addEventListener('voiceschanged', start);
    this.voiceTimer = setTimeout(() => {
      if (version !== this.version) return;
      this.clearVoiceWait();
      this.update('error', null, '系统声音尚未就绪，请重试或在系统设置中安装对应语言的语音。');
    }, this.voiceTimeoutMs);
    start();
  }
}

function splitSpeech(text) {
  const characters = Array.from(text);
  const chunks = [];
  let offset = 0;
  while (offset < characters.length) {
    let end = Math.min(offset + 240, characters.length);
    if (end < characters.length) {
      for (let i = end - 1; i >= offset + 100; i--) {
        if (/[\s。！？.!?]/u.test(characters[i])) { end = i + 1; break; }
      }
    }
    chunks.push(characters.slice(offset, end).join(''));
    offset = end;
  }
  return chunks;
}
