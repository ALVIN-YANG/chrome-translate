// 本机测试后端；只用于扩展的真实消息、SDK 与媒体链路验证，不记录凭据。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const audio = await readFile('output/minimax-voice.mp3');
let delayMs = 0;
const calls = [];
createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
  response.setHeader('Content-Type','application/json');
  if (request.url === '/control') { delayMs = Math.max(0,Math.min(10000,Number(body.delayMs)||0)); response.end('{}'); return; }
  if (request.url === '/calls') { response.end(JSON.stringify(calls)); return; }
  if (request.url === '/reset') { calls.length=0;delayMs=0;response.end('{}');return; }
  if (request.url === '/v1/t2a_v2') {
    calls.push({ text:body.text,model:body.model,voice:body.voice_setting?.voice_id,speed:body.voice_setting?.speed });
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    response.end(JSON.stringify({base_resp:{status_code:0},data:{audio:audio.toString('hex')}}));return;
  }
  response.writeHead(404);response.end('{}');
}).listen(4175,'127.0.0.1',()=>console.log('扩展测试语音后端：127.0.0.1:4175'));
