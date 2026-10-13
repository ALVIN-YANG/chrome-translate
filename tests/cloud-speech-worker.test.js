import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAssistantSettings } from '../src/assistant-config.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise}};
function browser(session={}) {
  const calls=[],settings=defaultAssistantSettings();settings.tts.provider='minimax';settings.tts.providers.minimax.key='fixture-key';
  let player=true;
  const api={
    storage:{local:{get:async key=>({[key]:key==='selection-services-v1'?settings:{}})},session:{get:async()=>session,set:async data=>Object.assign(session,data)}},
    runtime:{id:'own',getURL:name=>`chrome-extension://own/${name}`,getContexts:async()=>player?[{documentUrl:'chrome-extension://own/offscreen.html'}]:[],sendMessage:async message=>{calls.push(message);return {started:true}}},
    tabs:{sendMessage:async(id,message)=>{calls.push({tabId:id,...message})}},
    offscreen:{createDocument:async()=>{player=true},closeDocument:async()=>{player=false}},
  };
  return {api,calls,session,setPlayer:value=>{player=value}};
}
const sender=id=>({id:'own',tab:{id},documentId:`doc-${id}`,frameId:0,url:'https://example.test'});
const role={trusted:false,pageSender:true};
const load=async fake=>{globalThis.chrome=fake.api;return import(`../src/cloud-speech-worker.js?test=${crypto.randomUUID()}`)};

test('后台重新启动后，从session恢复所有者，只有当前文档可以停止音频',async()=>{
  const saved={sender:{tab:{id:1},documentId:'doc-1'},playId:'existing',key:'selection'};
  const fake=browser({'selection-audio-session':saved});const worker=await load(fake);
  await worker.speechMessage({type:'ct:speech-stop',playId:'existing'},sender(2),role);
  assert.equal(fake.calls.length,0,'其他文档不能停止音频');
  await worker.speechMessage({type:'ct:speech-stop',playId:'existing'},sender(1),role);
  assert(fake.calls.some(call=>call.type==='ct:audio-stop'));assert.equal(fake.session['selection-audio-session'],null);
});

test('创建播放页期间停止，迟到的初始化不能启动合成或播放',async()=>{
  const fake=browser();fake.setPlayer(false);const creating=deferred();let called=false;
  fake.api.offscreen.createDocument=async()=>{called=true;await creating.promise;fake.setPlayer(true)};
  const worker=await load(fake);
  const start=worker.speechMessage({type:'ct:speech-start',playId:'pending',key:'selection',text:'read me',language:'en'},sender(1),role);
  while(!called)await tick();
  await worker.speechMessage({type:'ct:speech-stop',playId:'pending'},sender(1),role);creating.resolve();
  assert.equal((await start).cancelled,true);assert(!fake.calls.some(call=>call.type==='ct:audio-play'));
});

test('新文档接管朗读时，旧文档迟到的停止命令不能取消新任务',async()=>{
  const fake=browser({'selection-audio-session':{sender:{tab:{id:1},documentId:'doc-1'},playId:'old',key:'selection'}});
  const notify=deferred();let notifying=false;
  fake.api.tabs.sendMessage=async(id,message)=>{fake.calls.push({tabId:id,...message});if(id===1&&message.state.status==='idle'){notifying=true;await notify.promise}};
  const worker=await load(fake);
  const start=worker.speechMessage({type:'ct:speech-start',playId:'new',key:'selection',text:'new text',language:'en'},sender(2),role);
  while(!notifying)await tick();
  await worker.speechMessage({type:'ct:speech-stop',playId:'old'},sender(1),role);notify.resolve();
  assert.equal((await start).started,true);
  assert.equal(fake.session['selection-audio-session'].playId,'new');assert(fake.calls.some(call=>call.type==='ct:audio-play'&&call.job.playId==='new'));
  await worker.speechMessage({type:'ct:speech-stop',playId:'old'},sender(1),role);
  assert.equal(fake.session['selection-audio-session'].playId,'new');
});

test('来源标签页关闭时取消尚未完成的播放页初始化',async()=>{
  const fake=browser();fake.setPlayer(false);const creating=deferred();let called=false;
  fake.api.offscreen.createDocument=async()=>{called=true;await creating.promise;fake.setPlayer(true)};
  const worker=await load(fake);
  const start=worker.speechMessage({type:'ct:speech-start',playId:'closing',key:'selection',text:'read me',language:'en'},sender(1),role);
  while(!called)await tick();worker.stopSpeechForTab(1);creating.resolve();
  assert.equal((await start).cancelled,true);assert(!fake.calls.some(call=>call.type==='ct:audio-play'));
});
