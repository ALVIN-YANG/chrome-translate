import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dictionaryUrl } from '../src/dictionary.js';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    const incoming = new URL(req.url, 'http://127.0.0.1:4173');
    const pathname = decodeURIComponent(incoming.pathname);
    if (pathname === '/api/dictionary') {
      const text = incoming.searchParams.get('text') || '';
      if (req.method !== 'GET' || !text.trim() || /[\r\n]/u.test(text) || text.length > 60) { res.writeHead(400).end('Invalid dictionary query'); return; }
      if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4173' && req.headers.origin !== 'http://localhost:4173') { res.writeHead(403).end(); return; }
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      try {
        // 仅为本机网页预览解决词典跨域问题。扩展直接访问固定的微软词典域名。
        const upstream = await fetch(dictionaryUrl(text), { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5500)]), credentials: 'omit' });
        if (!upstream.ok) { res.writeHead(502).end('Dictionary unavailable'); return; }
        const body = await upstream.text();
        if (body.length > 1500000) { res.writeHead(502).end('Dictionary response too large'); return; }
        res.writeHead(200, { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(body);
      } catch { if (!res.destroyed) res.writeHead(502).end('Dictionary unavailable'); }
      return;
    }
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('界面预览：http://127.0.0.1:4173（真实服务请在扩展页面使用）'));
