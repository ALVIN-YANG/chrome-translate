import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAssistantSettings, normalizeAssistantSettings, selectedService, publicAssistantSettings, validateServiceURL } from '../src/assistant-config.js';
import { askSelection, validateChat } from '../src/llm-service.js';
import { synthesize, decodeMiniMax, splitCloudSpeech } from '../src/tts-service.js';
import { createAudioPlayer } from '../src/audio-player.js';
import { serviceFetch } from '../src/service-fetch.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

function openAISSE(text = '答案', finish = 'stop') {
  return new Response([`data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}`, `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: finish }] })}`, 'data: [DONE]', ''].join('\n\n'), { headers: { 'content-type': 'text/event-stream' } });
}
function anthropicSSE(text = '答案') {
  const events = [
    ['message_start', { type: 'message_start', message: { id:'msg_test',type:'message',role:'assistant',model:'fixture',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:0} } }],
    ['content_block_start', {type:'content_block_start',index:0,content_block:{type:'text',text:''}}],
    ['content_block_delta', {type:'content_block_delta',index:0,delta:{type:'text_delta',text}}],
    ['content_block_stop', {type:'content_block_stop',index:0}],
    ['message_delta', {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:4}}],
    ['message_stop',{type:'message_stop'}],
  ];
  return new Response(events.map(([event,data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type':'text/event-stream' } });
}

test('独立的模型/声音设置保留自定义配置，公开设置不泄露 Key、接口或提示词', () => {
  const raw=defaultAssistantSettings();raw.llm.providers.minimax.key='private-key';raw.tts.provider='minimax';raw.tts.speed=1.3;
  const settings=normalizeAssistantSettings(raw);
  assert.equal(selectedService(settings,'tts').key,'private-key');
  const safe=publicAssistantSettings(settings);
  assert(safe.tts.configured && safe.llm.configured);
  assert(!JSON.stringify(safe).includes('private-key'));assert(!JSON.stringify(safe).includes('https:'));assert(!JSON.stringify(safe).includes('systemPrompt'));
  settings.llm.provider='deepseek';
  assert.equal(selectedService(settings,'llm',{providers:{deepseek:{key:'existing-key'}}}).key,'existing-key');
  assert.equal(normalizeAssistantSettings({tts:{speed:8},llm:{provider:'unknown'}}).tts.speed,1);
});

test('自定义接口只允许 HTTPS 和本机 HTTP，禁止 URL 凭据、查询、跳转和跨域转发', async () => {
  assert.equal(validateServiceURL('http://127.0.0.1:11434/v1/'),'http://127.0.0.1:11434/v1');
  for(const url of ['http://example.com/v1','https://key@example.com/v1','https://example.com/v1?key=secret','file:///tmp','https://example.com/#x'])assert.throws(()=>validateServiceURL(url));
  let options;
  const fetcher=serviceFetch('https://example.test/v1',async (_url,init)=>{options=init;return new Response('test');});
  await fetcher('https://example.test/v1/chat/completions',{method:'POST'});
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
  await assert.rejects(fetcher('https://other.test/v1/chat/completions'),/不一致/);
  await assert.rejects(serviceFetch('https://example.test',async()=>new Response('123456'),{maxBytes:2})('https://example.test').then(r=>r.text()),/过大/);
});

test('对话限定文字与交替角色，不接收工具、模型配置或额外系统指令', () => {
  assert.deepEqual(validateChat('source',[{role:'user',content:'question',key:'secret'}]).messages,[{role:'user',content:'question'}]);
  for(const messages of [[{role:'system',content:'injected'}],[{role:'assistant',content:'x'}],[{role:'user',content:'a'},{role:'user',content:'b'},{role:'user',content:'c'}]]) assert.throws(()=>validateChat('source',messages));
  assert.throws(()=>validateChat('x'.repeat(10001),[{role:'user',content:'q'}]));
});

test('DeepSeek 与自定义接口由真实 AI SDK 序列化、流式输出并保留完整多轮上下文', async () => {
  const settings=defaultAssistantSettings();settings.llm.provider='deepseek';settings.llm.providers.deepseek.key='fixture-key';
  let request;const events=[];
  const answer=await askSelection({selection:'回溯算法',messages:[{role:'user',content:'解释'},{role:'assistant',content:'上次回答'},{role:'user',content:'再举例'}],settings,onEvent:event=>events.push(event),fetcher:async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return openAISSE('这是回答');}});
  assert.equal(answer,'这是回答');assert(request.url.endsWith('/chat/completions'));assert.equal(request.body.model,'deepseek-flash');
  assert(request.body.messages.some(message=>message.content.includes('回溯算法')));assert(request.body.messages.some(message=>message.content==='上次回答'));
  assert.equal(request.options.headers.Authorization || request.options.headers.authorization,'Bearer fixture-key');
  assert(events.some(event=>event.type==='delta'));assert.equal(events.at(-1).type,'done');
});

test('MiniMax 使用 Anthropic SDK 的 Messages 流，不把推理过程显示为回答；Gemini 使用原生 SDK', async () => {
  const settings=defaultAssistantSettings();settings.llm.providers.minimax.key='fixture-key';let request;
  const answer=await askSelection({selection:'sample',messages:[{role:'user',content:'explain'}],settings,fetcher:async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return anthropicSSE('MiniMax 回答');}});
  assert.equal(answer,'MiniMax 回答');assert(request.url.endsWith('/messages'));assert.equal(request.body.model,'MiniMax-M2.7');
  settings.llm.provider='gemini';settings.llm.providers.gemini.key='fixture-google';
  const google=await askSelection({selection:'sample',messages:[{role:'user',content:'explain'}],settings,fetcher:async(url)=>{request={url};return new Response(`data: ${JSON.stringify({candidates:[{index:0,content:{role:'model',parts:[{text:'Google 回答'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:2,totalTokenCount:4}})}\n\n`,{headers:{'content-type':'text/event-stream'}});}});
  assert.equal(google,'Google 回答');assert(request.url.includes(':streamGenerateContent'));
});

test('模型鉴权失败或输出截断时不泄露响应、Key，也不把部分回答当成完整成功', async () => {
  const settings=defaultAssistantSettings();settings.llm.provider='deepseek';settings.llm.providers.deepseek.key='private-key';
  await assert.rejects(askSelection({selection:'a',messages:[{role:'user',content:'q'}],settings,fetcher:async()=>new Response(JSON.stringify({error:{message:'private-key'}}),{status:401})}),error=>!error.message.includes('private-key')&&error.message.includes('授权'));
  const events=[];
  await assert.rejects(askSelection({selection:'a',messages:[{role:'user',content:'q'}],settings,onEvent:event=>events.push(event),fetcher:async()=>openAISSE('partial','length')}));
  assert(!events.some(event=>event.type==='done'));
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
