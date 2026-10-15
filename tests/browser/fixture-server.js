import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// 随测试启动、随机端口、仅绑定 loopback；不访问真实服务，也不记录凭据。
export async function startFixtureServer() {
  const files = new Map(await Promise.all(['article.html', 'strict.html', 'tone.mp3'].map(async name =>
    [`/${name}`, await readFile(new URL(`../fixtures/${name}`, import.meta.url))])));
  const calls = [];
  let delayMs = 0;
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && files.has(request.url)) {
        response.writeHead(200, { 'Content-Type': request.url.endsWith('.mp3') ? 'audio/mpeg' : 'text/html; charset=utf-8' });
        response.end(files.get(request.url)); return;
      }
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 128 * 1024) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/control') { delayMs = Math.max(0, Math.min(10000, Number(body.delayMs) || 0)); response.end('{}'); return; }
      if (request.url === '/reset') { calls.length = 0; delayMs = 0; response.end('{}'); return; }
      if (request.url === '/calls') { response.end(JSON.stringify(calls)); return; }
      if (request.method === 'POST' && request.url === '/v1/t2a_v2') {
        calls.push({ text: body.text, model: body.model, voice: body.voice_setting?.voice_id, speed: body.voice_setting?.speed });
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        response.end(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: files.get('/tone.mp3').toString('hex') } })); return;
      }
      response.writeHead(404).end('{}');
    } catch { if (!response.destroyed) response.writeHead(400).end('{}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
