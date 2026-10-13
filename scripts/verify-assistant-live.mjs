// Key 仅从进程环境读取，不输出、写入源码或复制到生成包。
import { mkdir, writeFile } from 'node:fs/promises';
import { defaultAssistantSettings, selectedService } from '../src/assistant-config.js';
import { askSelection } from '../src/llm-service.js';
import { synthesize } from '../src/tts-service.js';
const settings = defaultAssistantSettings();
const key = process.env.MINIMAX_API_KEY;
if (!key) throw new Error('需要 MINIMAX_API_KEY 环境变量。');
settings.llm.providers.minimax.key = key;
settings.tts.provider = 'minimax';
const answer = await askSelection({ selection: '回溯算法', messages: [{ role: 'user', content: '用不超过30个字解释它。' }], settings });
await mkdir('output', { recursive: true });
await writeFile('output/minimax-llm-live.json', JSON.stringify({ model: settings.llm.providers.minimax.model, answer }));
const blob = await synthesize({ text: '你好，这是划词朗读的声音测试。', language: 'zh', config: selectedService(settings, 'tts') });
await mkdir('output', { recursive: true });
await writeFile('output/minimax-voice.mp3', new Uint8Array(await blob.arrayBuffer()));
const result = { mode: 'real-minimax-api', llm: { model: settings.llm.providers.minimax.model, answer }, tts: { model: settings.tts.providers.minimax.model, bytes: blob.size, mediaType: blob.type } };
await writeFile('output/minimax-assistant-live.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
