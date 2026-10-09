// 只使用公开测试文本和微软免 Key 接口，不读取任何账号凭据。
import { mkdir, writeFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/language.js';
import { translate } from '../src/providers.js';

const targets = Object.keys(LANGUAGES);
await mkdir('output/playwright', { recursive: true });
const results = [];
let index = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (index < targets.length) {
    const target = targets[index++];
    let status;
    try {
      const result = await translate({ provider: 'microsoft', text: '你好，很高兴认识你。', from: 'auto', to: target, timeoutMs: 15000 }, async (url, options) => {
        const response = await fetch(url, options); status = response.status; return response;
      });
      results.push({ target, language: LANGUAGES[target].name, status, text: result.text, detected: result.detected });
    } catch (error) { results.push({ target, status, error: error.code || error.message }); }
  }
}));
results.sort((a, b) => targets.indexOf(a.target) - targets.indexOf(b.target));
await writeFile('output/playwright/languages-live-0.3.0.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({ status: results.every(result => result.status === 200 && result.text) ? 'passed' : 'failed', languages: results.length, results }));
if (results.some(result => result.error)) process.exitCode = 1;
