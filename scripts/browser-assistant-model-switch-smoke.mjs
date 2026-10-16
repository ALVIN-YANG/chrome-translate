import assert from 'node:assert/strict';

export default async function assistantModelSwitch(page) {
  const context = page.context();
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ 'selection-services-v1': {
      llm: { provider: 'deepseek', providers: { deepseek: { key: 'fixture-switch-deepseek' }, openai: { key: 'fixture-switch-openai' } } },
      tts: { provider: 'system' },
    } });
    globalThis.__modelSwitchPorts = 0;
    chrome.runtime.onConnect.addListener(port => { if (port.name === 'ct:ask-ai') globalThis.__modelSwitchPorts++; });
  });
  const requests = [];
  const routes = [];
  for (const [provider, url, name] of [['deepseek', 'https://api.deepseek.com/chat/completions', 'DeepSeek'], ['openai', 'https://api.openai.com/v1/chat/completions', 'OpenAI']]) {
    const respond = route => {
      requests.push({ provider, body: JSON.parse(route.request().postData()) });
      const metadata = { id: `switch-${provider}`, object: 'chat.completion.chunk', created: 1, model: 'fixture' };
      const chunks = [{ ...metadata, choices: [{ index: 0, delta: { content: `这是 ${name} 的受控回答。` }, finish_reason: null }] },
        { ...metadata, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }];
      return route.fulfill({ contentType: 'text/event-stream', body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n' });
    };
    routes.push([url, respond]); await context.route(url, respond);
  }
  let settingsPage;
  try {
    await page.reload();
    await page.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
    await page.locator('#first').evaluate(element => {
      element.tabIndex = -1; element.focus();
      const range = document.createRange(); range.selectNodeContents(element);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.keyboard.press('Shift');
    await page.getByRole('toolbar', { name: '划词操作' }).getByRole('button', { name: '问问 AI' }).click();
    const chat = page.getByRole('dialog', { name: '问问 AI' });
    const input = chat.getByRole('textbox', { name: '向 AI 提问' });
    assert.equal(requests.length, 0, '打开面板不自动提问');
    await input.fill('解释这段内容');
    await chat.getByRole('button', { name: '发送问题' }).click();
    await chat.getByRole('button', { name: '复制 AI 回答' }).waitFor();
    await input.fill('继续解释这段内容');
    settingsPage = await context.newPage();
    await settingsPage.goto(await worker.evaluate(() => chrome.runtime.getURL('services.html')));
    const save = async expected => {
      await settingsPage.getByRole('button', { name: '保存设置' }).click();
      await settingsPage.waitForFunction(async ({ provider, key }) => {
        const data = await chrome.storage.local.get('selection-services-v1');
        const llm = data['selection-services-v1']?.llm;
        return llm?.provider === provider && (key === undefined || llm.providers[provider].key === key);
      }, expected);
      const response = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:settings-get' }));
      assert.ok(response.ok);
      // 与后台相同的安全快照；回应作为网页已处理设置的屏障。
      await worker.evaluate(async ({ url, settings }) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.sendMessage(tab.id, { type: 'ct:settings', settings });
      }, { url: page.url(), settings: response.data });
      return response.data.assistant.llm;
    };
    await settingsPage.getByRole('combobox', { name: '服务', exact: true }).selectOption('openai');
    const switched = await save({ provider: 'openai' });
    assert.equal(switched.name, 'OpenAI'); assert.equal(switched.configured, true);
    const labelsAfterSave = { brand: await chat.locator('.brand').textContent(), composer: await chat.locator('.chat-model').textContent() };
    assert.equal(await input.inputValue(), '继续解释这段内容', '切换服务保留未发送问题');
    assert.equal(requests.length, 1, '保存新服务不会自动提交问题');
    await chat.getByRole('button', { name: '发送问题' }).click();
    await chat.getByText('这是 OpenAI 的受控回答。', { exact: true }).waitFor();
    assert.deepEqual(requests.map(request => request.provider), ['deepseek', 'openai'], '下一次主动提问确实使用新接口');
    assert.deepEqual(labelsAfterSave, { brand: 'OpenAI', composer: 'OpenAI' }, '界面不能仍显示旧服务，实际却发给新服务');
    assert.deepEqual(await chat.locator('.chat-message.assistant .message-label').allTextContents(), ['DeepSeek', 'OpenAI'], '旧回答保留原作者，新回答标记实际服务');
    await settingsPage.getByLabel('API Key', { exact: true }).fill('');
    const unavailable = await save({ provider: 'openai', key: '' });
    assert.equal(unavailable.configured, false);
    await input.fill('这个问题应在配置完成后再发送');
    await chat.getByRole('button', { name: '发送问题' }).click();
    await chat.getByText('先在模型设置中填写 Key，然后再提问。', { exact: true }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.__modelSwitchPorts), 2, '未配置时在前端拦截，不新建模型连接');
    assert.equal(await input.inputValue(), '这个问题应在配置完成后再发送');
    await settingsPage.getByLabel('API Key', { exact: true }).fill('fixture-switch-openai');
    const restored = await save({ provider: 'openai', key: 'fixture-switch-openai' });
    assert.equal(restored.configured, true);
    assert.equal(await chat.locator('.chat-error').isVisible(), false, '配置恢复后移除过期的缺少Key提示');
    assert.equal(requests.length, 2, '恢复配置也不自动重发');
    await chat.getByRole('button', { name: '发送问题' }).click();
    await chat.getByRole('button', { name: '复制 AI 回答' }).nth(2).waitFor();
    assert.deepEqual(requests.map(request => request.provider), ['deepseek', 'openai', 'openai']);
    return { status: 'passed', mode: 'real-extension-controlled-sdk-and-settings-ui', providers: requests.map(request => request.provider), labelsAfterSave,
      draftPreserved: true, unavailableBlockedBeforePort: true, configuredAgain: true,
      checks: ['打开及保存无自动提问', '真实设置页切换服务', '请求使用新接口', '品牌与输入区标识同步', '新旧回答标记实际服务', '未发送草稿保留', '未配置时前端拦截', '未配置时问题保留', '恢复配置清理旧错误', '恢复后主动提问成功'] };
  } finally { await settingsPage?.close(); for (const [url, respond] of routes) await context.unroute(url, respond); }
}
