import assert from 'node:assert/strict';

// 隔离测试配置：旧版共用 Key、MiniMax 合成、本机测试音；不访问真实账号。
export default async function speechScenario(page) {
  const context = page.context(), worker = context.serviceWorkers()[0];
  const origin = new URL(page.url()).origin;
  const voice = 'Chinese (Mandarin)_Gentleman';
  await worker.evaluate(({ origin, voice }) => {
    globalThis.__speechEvents = [];
    chrome.runtime.onMessage.addListener(message => { if (message.type === 'ct:audio-event') globalThis.__speechEvents.push(message.state.status); });
    return chrome.storage.local.set({ 'selection-services-v1': {
      llm: { provider: 'minimax', providers: { minimax: { key: 'fixture-legacy-minimax' } } },
      tts: { provider: 'minimax', speed: 1.2, providers: { minimax: { baseURL: `${origin}/v1`, voice } } },
    } });
  }, { origin, voice });
  await context.route('https://edge.microsoft.com/translate/translatetext?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(JSON.parse(route.request().postData()).map(text => ({ detectedLanguage: { language: text === '回溯' ? 'zh-Hans' : 'en' }, translations: [{ text: text === '回溯' ? 'Looking back' : '中文译文：' + text }] }))) }));
  await context.route('https://cn.bing.com/dict/search?*', route => route.fulfill({ contentType: 'text/html', body: '<div id="headword">回溯</div><div class="qdef"><ul><li><span class="pos">v.</span><span class="def">backtrack</span></li></ul></div>' }));
  const ttsCalls = () => worker.evaluate(async origin => (await fetch(`${origin}/calls`)).json(), origin);
  const controlTTS = delayMs => worker.evaluate(({ origin, delayMs }) => fetch(`${origin}/control`, { method: 'POST', body: JSON.stringify({ delayMs }) }), { origin, delayMs });
  await page.reload();
  const controls = page.locator('[data-ct-owned="controls"]');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  const select = async () => {
    await page.locator('#term').evaluate(el => {
      el.tabIndex = -1; el.focus({ preventScroll: true });
      const node = el.firstChild, start = node.textContent.indexOf('回溯'), range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + 2);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.keyboard.press('Shift');
    await controls.getByRole('toolbar', { name: '划词操作' }).waitFor();
  };
  const bar = controls.getByRole('toolbar', { name: '划词操作' });
  const chip = controls.locator('.speech-chip');
  const speaking = () => page.waitForFunction(() => document.querySelector('[data-ct-owned="controls"]').shadowRoot.querySelector('.speech-caption').textContent.includes('正在朗读'));
  const stop = async () => { await controls.getByRole('button', { name: '停止当前朗读', exact: true }).click(); await chip.waitFor({ state: 'hidden' }); };
  await select();
  assert.deepEqual(await bar.getByRole('button').allTextContents(), ['翻译', '朗读']);
  assert.equal((await ttsCalls()).length, 0, '选择文本不自动合成');
  assert.equal(await controls.getByRole('button', { name: '问问 AI', exact: true }).count(), 0);
  if (process.env.UPDATE_README_SCREENSHOTS === '1') await bar.screenshot({ path: 'docs/assets/selection-toolbar.png' });
  await bar.getByRole('button', { name: '翻译选中文字' }).click();
  const panel = controls.getByRole('dialog', { name: '划词翻译' });
  await panel.getByText('backtracking', { exact: true }).waitFor();
  assert.equal(await panel.locator('textarea, .scene-tabs, .chat-area').count(), 0, '翻译面板只保留译文与操作');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: '复制 backtracking', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'backtracking');
  await panel.getByRole('button', { name: '朗读 backtracking', exact: true }).click();
  await speaking();
  assert.deepEqual((await ttsCalls()).at(-1), { text: 'backtracking', model: 'speech-2.8-turbo', voice, speed: 1.2 });
  await stop();
  await panel.getByRole('button', { name: '朗读例句', exact: true }).first().click();
  await speaking();
  assert.match((await ttsCalls()).at(-1).text, /[a-zA-Z]/, '例句朗读发送英文原文');
  await stop();
  await page.screenshot({ path: 'output/playwright/selection-current.png' });
  if (process.env.UPDATE_README_SCREENSHOTS === '1') await panel.screenshot({ path: 'docs/assets/selection.png' });
  await page.keyboard.press('Escape');
  await select();
  await bar.getByRole('button', { name: '朗读选中文字' }).click();
  await speaking();
  assert.equal((await ttsCalls()).at(-1).text, '回溯');
  await controls.getByRole('button', { name: '暂停朗读', exact: true }).click();
  await controls.getByRole('button', { name: '继续朗读', exact: true }).click();
  await controls.getByRole('button', { name: '暂停朗读', exact: true }).waitFor();
  await stop();
  await controlTTS(1000);
  await select(); await bar.getByRole('button', { name: '朗读选中文字' }).click();
  await page.waitForFunction(() => document.querySelector('[data-ct-owned="controls"]').shadowRoot.querySelector('.speech-caption').textContent.includes('准备声音'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200); await controlTTS(0);
  assert.equal(await chip.isVisible(), false, '取消合成后，迟到音频不播放');
  const events = await worker.evaluate(() => globalThis.__speechEvents);
  assert(events.includes('speaking') && events.includes('paused'));

  const settingsPage = await context.newPage();
  await settingsPage.goto(await worker.evaluate(() => chrome.runtime.getURL('services.html')));
  assert.equal(await settingsPage.getByRole('tab').count(), 0);
  assert.equal(await settingsPage.getByRole('textbox', { name: '回答偏好', exact: true }).count(), 0);
  assert.equal(await settingsPage.getByRole('combobox', { name: '服务', exact: true }).inputValue(), 'minimax');
  assert.equal(await settingsPage.locator('#service-key').inputValue(), 'fixture-legacy-minimax');
  assert.equal(await settingsPage.getByRole('combobox', { name: '音色 ID' }).inputValue(), voice);
  const before = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:settings-get' }));
  assert.equal(before.data.speech.configured, true);
  assert.equal(JSON.stringify(before).includes('fixture-legacy-minimax'), false);
  const removed = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:assistant-test', settings: {} }));
  assert.equal(removed.ok, false, '旧模型测试消息不能继续发起问答');
  await settingsPage.getByRole('button', { name: '保存设置' }).click();
  await settingsPage.getByText('设置已保存，下一次朗读时生效。', { exact: true }).waitFor();
  await settingsPage.reload();
  assert.equal(await settingsPage.locator('#service-key').inputValue(), 'fixture-legacy-minimax');
  const saved = await settingsPage.evaluate(async () => (await chrome.storage.local.get('selection-services-v1'))['selection-services-v1']);
  assert.deepEqual(Object.keys(saved), ['tts']);
  assert.equal(saved.tts.providers.minimax.voice, voice);
  assert.equal(saved.tts.speed, 1.2);
  const after = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:settings-get' }));
  assert.deepEqual({ ...after.data, speech: null }, { ...before.data, speech: null }, '保存声音不改翻译服务和网页偏好');
  await settingsPage.getByRole('button', { name: '试听声音' }).click();
  await settingsPage.getByText('已开始试听，再点击可重新试听。', { exact: true }).waitFor();
  assert.equal((await ttsCalls()).at(-1).voice, voice);
  await settingsPage.screenshot({ path: 'output/playwright/voice-settings-current.png', fullPage: true });
  if (process.env.UPDATE_README_SCREENSHOTS === '1') await settingsPage.locator('.settings-shell').screenshot({ path: 'docs/assets/voice-settings.png' });
  await settingsPage.getByRole('combobox', { name: '服务', exact: true }).selectOption('custom');
  await settingsPage.getByRole('textbox', { name: 'API 基础地址' }).fill(`${origin}/v1`);
  await settingsPage.getByRole('textbox', { name: '模型', exact: true }).fill('custom-speech');
  await settingsPage.getByRole('combobox', { name: '音色 ID' }).fill('custom-voice');
  await settingsPage.getByRole('combobox', { name: '接口类型' }).selectOption('minimax');
  await settingsPage.getByRole('button', { name: '保存设置' }).click();
  await settingsPage.getByText('设置已保存，下一次朗读时生效。', { exact: true }).waitFor();
  await settingsPage.reload();
  assert.equal(await settingsPage.getByRole('combobox', { name: '服务', exact: true }).inputValue(), 'custom');
  assert.equal(await settingsPage.getByRole('textbox', { name: '模型', exact: true }).inputValue(), 'custom-speech');
  assert.equal(await settingsPage.getByRole('combobox', { name: '接口类型' }).inputValue(), 'minimax');
  for (const width of [390, 320]) {
    await settingsPage.setViewportSize({ width, height: 850 });
    assert(await settingsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await select();
    const bounds = await bar.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await bar.getByRole('button', { name: '翻译选中文字' }).click();
    // 浮层通过异步定位计算尺寸；先等待实际布局，仍按原边界检查。
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-ct-owned="controls"]').shadowRoot.querySelector('.panel');
      const rect = panel.getBoundingClientRect();
      return !panel.hidden && rect.x >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }, null, { timeout: 1000 });
    const rect = await panel.boundingBox(); assert(rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 850, JSON.stringify({ width, rect }));
    await page.keyboard.press('Escape');
  }
  await settingsPage.getByRole('combobox', { name: '服务', exact: true }).selectOption('system');
  await settingsPage.getByRole('button', { name: '保存设置' }).click();
  await settingsPage.getByText('设置已保存，下一次朗读时生效。', { exact: true }).waitFor();
  const workspace = await context.newPage();
  await workspace.addInitScript(() => {
    const engine = new EventTarget();
    engine.getVoices = () => [{ name: 'Local Chinese', lang: 'zh-CN', localService: true }];
    engine.speak = utterance => { window.__spoken = { text: utterance.text, rate: utterance.rate, voice: utterance.voice.name }; utterance.onstart(); };
    engine.cancel = () => {};
    Object.defineProperty(window, 'speechSynthesis', { value: engine });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } } });
  });
  await workspace.goto(await worker.evaluate(() => chrome.runtime.getURL('index.html')));
  await workspace.getByRole('textbox', { name: '输入要翻译的文本' }).fill('This is a complete sentence for speech testing.');
  await workspace.locator('#translation-status[data-status="success"]').waitFor();
  const beforeSpeech = (await ttsCalls()).length;
  const beforeCopy = await workspace.locator('#copy-result').boundingBox();
  await workspace.locator('#read-result').click();
  assert.deepEqual(await workspace.evaluate(() => window.__spoken), { text: '中文译文：This is a complete sentence for speech testing.', rate: 1.2, voice: 'Local Chinese' });
  assert.equal((await ttsCalls()).length, beforeSpeech, '系统声音不发送云端合成请求');
  assert.equal((await workspace.locator('#copy-result').boundingBox()).y, beforeCopy.y, '朗读不推移复制按钮');
  await workspace.close();
  await settingsPage.close();
  return { status: 'passed', mode: 'controlled-provider-real-extension-and-audio', ttsCalls: (await ttsCalls()).length, audioEvents: events,
    checks: ['翻译朗读双入口', '选择不自动请求', '原词义和复制', '译文与英文例句朗读', '原文朗读', '实际音频暂停恢复停止', '取消合成隔离', '旧MiniMax共享Key兼容', '音色地址语速保留', '声音设置单页', '旧问答消息拒绝', '公开设置无凭据', '保存刷新保留语音Key', '保存不改翻译偏好', '试听指定声音', '自定义协议持久化', '320px390px布局', '独立页系统声音与语速', '系统声音无网络请求', '朗读不推移复制按钮'] };
}
