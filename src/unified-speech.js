import { SystemSpeech } from './speech.js';
import { pageRpc } from './page-rpc.js';
export class UnifiedSpeech {
  constructor(onState, getSettings) {
    this.onState = onState; this.getSettings = getSettings; this.version = 0; this.state = { status: 'idle', key: null };
    this.native = new SystemSpeech(state => this.emit(state)); this.supported = true;
    if (!getSettings && globalThis.chrome?.runtime?.id) this.ready = pageRpc('ct:assistant-public').then(settings => { this.cachedSettings ||= settings.tts; }, error => { this.settingsError = error; });
    if (globalThis.chrome?.runtime?.id) chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender.id === chrome.runtime.id && message.type === 'ct:assistant-settings') { this.cachedSettings = message.settings.tts; this.settingsError = null; }
      if (sender.id === chrome.runtime.id && message.type === 'ct:speech-state' && message.state.playId === this.playId) this.emit(message.state);
    });
  }
  emit(state) { this.state = state; this.onState(state); }
  stop() {
    this.version++; this.native.stop();
    if (this.playId) pageRpc('ct:speech-stop', { playId: this.playId }).catch(() => {});
    this.playId = null; this.emit({ status: 'idle', key: null });
  }
  async speak(text, language, key) {
    this.stop(); if (!text.trim()) return;
    const version = this.version;
    try {
      let settings = this.getSettings?.();
      if (!settings && globalThis.chrome?.runtime?.id) {
        if (!this.cachedSettings) await this.ready;
        if (this.settingsError) throw this.settingsError;
        settings = this.cachedSettings;
      }
      if (version !== this.version) return;
      if (!settings || settings.provider === 'system') { this.native.rate = settings?.speed || 1; this.native.speak(text, language, key); return; }
      this.playId = crypto.randomUUID();
      this.emit({ status: 'loading', key });
      await pageRpc('ct:speech-start', { text, language, key, playId: this.playId });
    }
    catch (error) { if (version === this.version) this.emit({ status: 'error', key: null, message: error.message }); }
  }
  async pause() {
    if (!this.playId) {
      if (this.state.status === 'speaking') { this.native.synthesis?.pause(); this.emit({ ...this.state, status: 'paused' }); }
      else if (this.state.status === 'paused') { this.native.synthesis?.resume(); this.emit({ ...this.state, status: 'speaking' }); }
      return;
    }
    await pageRpc('ct:speech-pause', { playId: this.playId }).catch(error => this.emit({ status: 'error', message: error.message }));
  }
}
