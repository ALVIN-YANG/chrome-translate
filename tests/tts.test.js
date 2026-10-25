import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSpeechSettings, normalizeSpeechSettings, selectedSpeechService, publicSpeechSettings, validateServiceURL } from '../src/speech-config.js';
import { synthesize, decodeMiniMax, splitCloudSpeech } from '../src/tts-service.js';
import { createAudioPlayer } from '../src/audio-player.js';
import { serviceFetch } from '../src/service-fetch.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

test('旧版 MiniMax 共用 Key 保留到声音配置，自选音色、地址和语速不变', () => {
  const tts = defaultSpeechSettings().tts;
  tts.provider = 'minimax'; tts.speed = 1.3;
  Object.assign(tts.providers.minimax, { voice: 'Chinese (Mandarin)_Gentleman', baseURL: 'https://audio.example/v1', model: 'custom-speech' });
  const settings = normalizeSpeechSettings({ tts, llm: { providers: { minimax: { key: 'legacy-key' } } } });
  assert.equal(selectedSpeechService(settings).key, 'legacy-key');
  assert.equal(settings.tts.providers.minimax.voice, tts.providers.minimax.voice);
  assert.equal(settings.tts.providers.minimax.baseURL, tts.providers.minimax.baseURL);
  assert.equal(settings.tts.providers.minimax.model, 'custom-speech');
  assert.equal(settings.tts.speed, 1.3);
  assert.equal(settings.llm, undefined);
  assert.deepEqual(normalizeSpeechSettings(settings), settings, '重复读取不会改变兼容后的配置');
  assert.deepEqual(publicSpeechSettings(settings), { provider: 'minimax', name: 'MiniMax', configured: true, speed: 1.3 });
});

test('明确配置的语音 Key 优先，硅基流动仍可沿用翻译 Key，异常值回到默认设置', () => {
  const raw = defaultSpeechSettings(); raw.tts.provider = 'minimax'; raw.tts.providers.minimax.key = 'voice-key';
  raw.llm = { providers: { minimax: { key: 'legacy-key' } } };
  assert.equal(selectedSpeechService(normalizeSpeechSettings(raw)).key, 'voice-key');
  const settings = defaultSpeechSettings(); settings.tts.provider = 'siliconflow';
  assert.equal(selectedSpeechService(settings, { providers: { siliconflow: { key: 'translation-key' } } }).key, 'translation-key');
  assert.equal(normalizeSpeechSettings({ tts: { speed: 8, provider: 'unknown' } }).tts.speed, 1);
  assert.equal(normalizeSpeechSettings({ tts: { provider: 'system', providers: { system: { protocol: 'openai' } } } }).tts.providers.system.protocol, 'system');
});

test('自定义接口只允许 HTTPS 和本机 HTTP，禁止 URL 凭据、查询、跳转和跨域转发', async () => {
  assert.equal(validateServiceURL('http://127.0.0.1:11434/v1/'),'http://127.0.0.1:11434/v1');
  assert.equal(validateServiceURL('http://localhost:11434/v1/'),'http://localhost:11434/v1');
  assert.equal(validateServiceURL('https://[::1]:11434/v1/'),'https://[::1]:11434/v1');
  assert.throws(()=>validateServiceURL('http://[::1]:11434/v1'),/localhost 或 127\.0\.0\.1/);
  for(const url of ['http://example.com/v1','https://key@example.com/v1','https://example.com/v1?key=secret','file:///tmp','https://example.com/#x'])assert.throws(()=>validateServiceURL(url));
  let options;
  const fetcher=serviceFetch('https://example.test/v1',async (_url,init)=>{options=init;return new Response('test');});
  await fetcher('https://example.test/v1/chat/completions',{method:'POST'});
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
  await assert.rejects(fetcher('https://other.test/v1/chat/completions'),/不一致/);
  await assert.rejects(serviceFetch('https://example.test',async()=>new Response('123456'),{maxBytes:2})('https://example.test').then(r=>r.text()),/过大/);
});

test('MiniMax 语音通过 SDK 扩展适配器发送正确音色语速，并严格解码 Hex', async () => {
  let request;
  const blob=await synthesize({text:'你好',language:'zh',config:{id:'minimax',name:'MiniMax',protocol:'minimax',baseURL:'https://api.minimaxi.com/v1',model:'speech-2.8-turbo',key:'fixture-key',voice:''},speed:1.2,fetcher:async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return new Response(JSON.stringify({base_resp:{status_code:0},data:{audio:'49443301'}}));}});
  assert.equal(blob.size,4);assert.equal(request.body.voice_setting.voice_id,'Chinese (Mandarin)_Gentleman');assert.equal(request.body.voice_setting.speed,1.2);assert.equal(request.body.output_format,'hex');assert.equal(request.options.credentials,'omit');
  for(const audio of ['xx','abc',''])assert.throws(()=>decodeMiniMax({base_resp:{status_code:0},data:{audio}}));
  assert.throws(()=>decodeMiniMax({base_resp:{status_code:2054},data:{audio:'4944'}}));
});

test('OpenAI、硅基流动及自定义 TTS 兼容 Audio Speech；ElevenLabs 使用它的认证与路径', async () => {
  for(const protocol of ['openai','elevenlabs']){
    let request;
    const config={id:protocol,name:protocol,protocol,baseURL:protocol==='openai'?'https://audio.example/v1':'https://api.elevenlabs.io/v1',key:'fixture-key',model:protocol==='openai'?'gpt-4o-mini-tts':'eleven_multilingual_v2',voice:'fixture-voice'};
    const blob=await synthesize({text:'hello',config,speed:1.1,fetcher:async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return new Response(new Uint8Array([73,68,51,1]),{headers:{'content-type':'audio/mpeg'}});}});
    assert.equal(blob.size,4);
    if(protocol==='openai'){assert(request.url.endsWith('/audio/speech'));assert.equal(request.body.input,'hello');assert.equal(request.body.voice,'fixture-voice');assert.equal(request.body.speed,1.1);}
    else{assert(request.url.includes('/text-to-speech/fixture-voice'));assert.equal(request.body.text,'hello');assert.equal(request.body.voice_settings.speed,1.1);assert.equal(request.options.headers['xi-api-key'],'fixture-key');}
  }
});

class FakeAudio {
  static instances=[];
  constructor(){this.handlers={};FakeAudio.instances.push(this);}
  addEventListener(name,fn){this.handlers[name]=fn;}
  async play(){this.played=true;}
  pause(){this.paused=true;}removeAttribute(){}load(){}
  end(){this.handlers.ended?.();}
}

test('停止音频会取消合成并释放 URL，迟到结果不播放；旧任务回调不影响新任务', async () => {
  FakeAudio.instances=[];const old=deferred(),states=[],signals=[],revoked=[];let count=0;
  const player=createAudioPlayer({AudioClass:FakeAudio,urls:{createObjectURL:()=>`blob:${count}`,revokeObjectURL:url=>revoked.push(url)},generate:async args=>{signals.push(args.signal);return ++count===1?old.promise:new Blob(['audio']);},notify:state=>states.push(state)});
  const first=player.play({playId:'old',text:'old',config:{id:'minimax'}});await tick();player.stop();assert(signals[0].aborted);
  await player.play({playId:'new',text:'new',config:{id:'minimax'}});old.resolve(new Blob(['old']));await first;await tick();
  assert.equal(FakeAudio.instances.length,1);assert.equal(player.status().playId,'new');assert.equal(player.status().status,'speaking');
  await player.pause();assert.equal(player.status().status,'paused');await player.pause();assert.equal(player.status().status,'speaking');player.stop();assert(revoked.length===1);
});

test('长段落朗读完整切分并只预取下一段，支持逐段完成与停止', async () => {
  const text='完整句子🙂。'.repeat(600);const chunks=splitCloudSpeech(text);assert.equal(chunks.join(''),text);assert(chunks.every(chunk=>Array.from(chunk).length<=900));
  FakeAudio.instances=[];let generated=0;
  const player=createAudioPlayer({AudioClass:FakeAudio,urls:{createObjectURL:()=>`blob:${generated}`,revokeObjectURL(){}},generate:async()=>{generated++;return new Blob(['audio']);}});
  await player.play({playId:'long',text,config:{id:'minimax'}});await tick();assert.equal(generated,2);
  FakeAudio.instances[0].end();await tick();assert.equal(generated,3);assert.equal(FakeAudio.instances.length,2);player.stop();
});
