// 真正的微软请求及本机声音，使用公开测试文本；不读取账号凭据。
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  const result = page.getByRole('region', { name: '翻译结果', exact: true });
  const target = page.getByRole('combobox', { name: '译文语言', exact: true });
  const results = [];
  await page.evaluate(() => {
    window.__speechLive = [];
    const nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => {
      const record = { text: utterance.text, lang: utterance.lang, name: utterance.voice.name, local: utterance.voice.localService, events: [] };
      __speechLive.push(record);
      for (const type of ['start', 'end', 'error']) utterance.addEventListener(type, event => record.events.push(event.error || type));
      nativeSpeak(utterance);
    };
  });
  for (const [text, language] of [['こんにちは。よろしくお願いします。', '日语'], ['Bonjour, comment allez-vous ?', '法语']]) {
    await input.fill(text);
    await page.waitForFunction(() => document.getElementById('translation-status').dataset.status === 'success');
    const translated = await result.textContent();
    assert(/\p{Script=Han}/u.test(translated), `${language} 未译成中文`);
    assert(await page.locator('#source-language').textContent() === `自动识别 · ${language}`, `${language} 未自动识别`);
    results.push({ source: language, target: 'zh', text: translated });
  }
  await target.selectOption('ja');
  await input.fill('你好，很高兴认识你。');
  await page.waitForFunction(() => document.getElementById('translation-status').dataset.status === 'success');
  assert(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(await result.textContent()), '中文未译成日语');
  results.push({ source: '中文', target: 'ja', text: await result.textContent() });
  const readAndWait = async button => {
    const before = await page.evaluate(() => __speechLive.length);
    await button.click();
    await page.waitForFunction(before => __speechLive.length > before && __speechLive.at(-1).events.some(event => event !== 'start'), before, { timeout: 15000 });
    const playback = await page.evaluate(() => __speechLive.at(-1));
    assert(playback.local && playback.events.includes('start') && playback.events.includes('end'), `系统声音未完成播放：${JSON.stringify(playback)}`);
    return playback;
  };
  const japaneseSpeech = await readAndWait(page.getByRole('button', { name: '朗读译文', exact: true }));
  assert(japaneseSpeech.lang.startsWith('ja'), '日语译文声音错误');
  await target.selectOption('en');
  await input.fill('回溯');
  await page.getByRole('button', { name: '朗读例句 backtrack', exact: true }).waitFor();
  const exampleSpeech = await readAndWait(page.getByRole('button', { name: '朗读例句 backtrack', exact: true }));
  assert(exampleSpeech.lang.startsWith('en') && exampleSpeech.text.includes('backtrack'), '英文例句声音或内容错误');
  await page.screenshot({ path: 'output/playwright/multilingual-example-live-0.3.0.png', fullPage: true });
  return { status: 'passed', translation: 'real-microsoft', results, speech: 'real-system-engine', japaneseSpeech, exampleSpeech };
}
