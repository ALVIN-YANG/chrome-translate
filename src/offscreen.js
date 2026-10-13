import { createAudioPlayer } from './audio-player.js';
let idleTimer;
const player = createAudioPlayer({ notify(state) {
  clearTimeout(idleTimer);
  chrome.runtime.sendMessage({ type: 'ct:audio-event', state }).catch(() => {});
  if (['idle', 'error'].includes(state.status)) idleTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'ct:audio-close-idle', playId: state.playId }).catch(() => {}), 25000);
} });
// 长朗读期间保持后台可接收控制；状态同时保存在 session，后台重启后仍能停止当前音频。
setInterval(() => {
  const state = player.status();
  if (['loading', 'speaking', 'paused'].includes(state.status)) chrome.runtime.sendMessage({ type: 'ct:audio-event', state }).catch(() => {});
}, 15000);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'offscreen' || sender.id !== chrome.runtime.id || sender.url?.startsWith(chrome.runtime.getURL('')) !== true) return;
  if (message.type === 'ct:audio-play') { player.play(message.job).then(respond); return true; }
  if (message.type === 'ct:audio-stop') { player.stop(); respond({ stopped: true }); }
  if (message.type === 'ct:audio-pause') { player.pause().then(respond, () => respond({ error: '无法恢复朗读，请重新点击朗读。' })); return true; }
  if (message.type === 'ct:audio-status') respond(player.status());
});
