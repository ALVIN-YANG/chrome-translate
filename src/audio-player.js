import { synthesize, splitCloudSpeech } from './tts-service.js';
// 最多预取下一段。停止会取消合成、释放 Blob URL，并隔离旧任务的媒体回调。
export function createAudioPlayer({ AudioClass = globalThis.Audio, urls = URL, generate = synthesize, notify = () => {} } = {}) {
  let generation = 0, controller, audio, objectURL, active = { status: 'idle' };
  const publish = next => { active = { ...active, ...next }; notify({ ...active }); };
  function dispose() {
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    audio = null;
    if (objectURL) urls.revokeObjectURL(objectURL);
    objectURL = null;
  }
  function stop() {
    generation++; controller?.abort(); controller = null; dispose();
    publish({ status: 'idle' });
  }
  async function play(job) {
    stop(); const run = generation; controller = new AbortController();
    active = { status: 'loading', playId: job.playId, key: job.key, message: '', provider: job.config.id };
    notify({ ...active });
    const pieces = splitCloudSpeech(job.text);
    const signal = controller.signal;
    const prepare = index => generate({ text: pieces[index], language: job.language, config: job.config, speed: job.speed, signal })
      .then(blob => ({ blob }), error => ({ error }));
    let next = prepare(0);
    let acknowledged;
    const started = new Promise(resolve => { acknowledged = resolve; });
    async function loop() {
      try {
        for (let index = 0; index < pieces.length; index++) {
          const { blob, error } = await next;
          if (run !== generation) { acknowledged({ cancelled: true }); return; }
          if (error) throw error;
          if (index + 1 < pieces.length) next = prepare(index + 1);
          dispose(); objectURL = urls.createObjectURL(blob);
          const current = audio = new AudioClass(objectURL);
          const ended = new Promise((resolve, reject) => {
            current.addEventListener('ended', resolve, { once: true });
            current.addEventListener('error', () => reject(new Error('音频无法播放，请检查模型和音色配置。')), { once: true });
            signal.addEventListener('abort', resolve, { once: true });
          });
          await current.play();
          if (run !== generation) { acknowledged({ cancelled: true }); return; }
          publish({ status: 'speaking', index, total: pieces.length }); acknowledged({ started: true });
          await ended;
          if (run !== generation) return;
        }
        stop();
      } catch (error) {
        if (run !== generation) { acknowledged({ cancelled: true }); return; }
        const message = error.name === 'NotAllowedError' ? '浏览器未允许播放，请在设置中点击试听后重试。' : error.message || '语音播放未完成，请重试。';
        stop(); publish({ status: 'error', message }); acknowledged({ error: message });
      }
    }
    loop();
    return started;
  }
  async function pause() {
    const run = generation;
    if (active.status === 'speaking' && audio) { audio.pause(); publish({ status: 'paused' }); }
    else if (active.status === 'paused' && audio) { await audio.play(); if (run === generation) publish({ status: 'speaking' }); }
    return { ...active };
  }
  return { play, stop, pause, status: () => ({ ...active }) };
}
