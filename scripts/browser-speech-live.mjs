// 保留真正的系统语音引擎，记录实际播放事件。翻译响应使用受控文本。
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('https://edge.microsoft.com/**', route => {
    const text = JSON.parse(route.request().postData())[0] === '你好' ? 'Hello' : '你好';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ translations: [{ text }] }]) });
  });
  await page.route('https://cn.bing.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>No entries</html>' }));
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  await page.evaluate(() => {
    window.__speechLive = [];
    const nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => {
      const entry = { text: utterance.text, name: utterance.voice.name, lang: utterance.lang, local: utterance.voice.localService, events: [] };
      __speechLive.push(entry);
      for (const event of ['start', 'end', 'error']) utterance.addEventListener(event, value => entry.events.push(value.error || event));
      nativeSpeak(utterance);
    };
  });
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  for (const text of ['你好', 'Hello']) {
    await input.fill(text);
    await page.getByRole('button', { name: '朗读译文', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('read-result').disabled);
    await page.getByRole('button', { name: '朗读译文', exact: true }).click();
    await page.waitForFunction(() => window.__speechLive.at(-1)?.events.some(event => event === 'end' || !['start'].includes(event)), null, { timeout: 12000 });
    const entry = await page.evaluate(() => __speechLive.at(-1));
    if (!entry.local || !entry.events.includes('start') || !entry.events.includes('end')) throw new Error(`系统朗读失败：${JSON.stringify(entry)}`);
    if (!await page.getByRole('button', { name: '朗读译文', exact: true }).isVisible()) throw new Error('完成后未恢复朗读按钮');
  }
  return { status: 'passed', speech: 'real-system-engine', playback: await page.evaluate(() => __speechLive) };
}
