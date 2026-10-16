import assert from 'node:assert/strict';

export default async function assistantPreferences(page) {
  const context = page.context();
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => chrome.storage.local.set({ 'selection-services-v1': {
    llm: { provider: 'deepseek', providers: { deepseek: { key: 'fixture-preferences-key' } } },
    tts: { provider: 'system', speed: 1 },
  } }));
  let release;
  let begin;
  let pending;
  let started;
  const hold = () => {
    pending = new Promise(resolve => { release = resolve; });
    started = new Promise(resolve => { begin = resolve; });
  };
  hold();
  const requests = [];
  const pattern = 'https://api.deepseek.com/chat/completions';
  const respond = async route => {
    requests.push(JSON.parse(route.request().postData()));
    begin(); await pending;
    const metadata = { id: 'preferences-test', object: 'chat.completion.chunk', created: 1, model: 'fixture' };
    const chunks = [{ ...metadata, choices: [{ index: 0, delta: { content: '语音偏好变化后，回答仍正常完成。' }, finish_reason: null }] },
      { ...metadata, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }];
    await route.fulfill({ contentType: 'text/event-stream', body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n' }).catch(() => {});
  };
  await context.route(pattern, respond);
  const translationPattern = 'https://edge.microsoft.com/translate/translatetext?*';
  const translate = route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(JSON.parse(route.request().postData()).map(() => ({
    detectedLanguage: { language: 'en' }, translations: [{ text: '这是一段用于恢复测试的译文。' }],
  }))) });
  await context.route(translationPattern, translate);
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
    await chat.getByRole('textbox', { name: '向 AI 提问' }).fill('解释这段内容');
    await chat.getByRole('button', { name: '发送问题' }).click();
    await started;
    assert.equal(await chat.getByRole('button', { name: '停止生成', exact: true }).isVisible(), true, '保存设置前模型请求仍在进行');
    settingsPage = await context.newPage();
    await settingsPage.goto(await worker.evaluate(() => chrome.runtime.getURL('services.html')));
    const before = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:settings-get' }));
    const save = async (kind, field, value) => {
      await settingsPage.getByRole('button', { name: '保存设置' }).click();
      await settingsPage.waitForFunction(async ({ kind, field, value }) => {
        const data = await chrome.storage.local.get('selection-services-v1');
        return data['selection-services-v1']?.[kind]?.[field] === value;
      }, { kind, field, value });
      await settingsPage.getByText('设置已保存，下一次提问或朗读时生效。', { exact: true }).waitFor();
      const response = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:settings-get' }));
      assert.ok(response.ok);
      // 重发后台同款安全快照并等待回应，确保断言发生在网页已收到变更之后。
      await worker.evaluate(async ({ url, settings }) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.sendMessage(tab.id, { type: 'ct:settings', settings });
      }, { url: page.url(), settings: response.data });
      return response.data;
    };
    await settingsPage.getByRole('tab', { name: '朗读声音' }).click();
    await save('tts', 'speed', 1);
    assert.equal(await chat.getByRole('button', { name: '停止生成', exact: true }).isVisible(), true, '未修改配置直接保存不会中断请求');
    await settingsPage.getByRole('slider', { name: '语速' }).focus();
    await settingsPage.getByRole('slider', { name: '语速' }).press('ArrowRight');
    const afterSpeed = await save('tts', 'speed', 1.1);
    assert.equal(afterSpeed.assistant.tts.speed, 1.1);
    assert.deepEqual(afterSpeed.assistant.llm, before.data.assistant.llm, '语速保存没有改动公开模型配置');
    assert.equal(await chat.getByRole('button', { name: '停止生成', exact: true }).isVisible(), true, '只修改语速不能中断正在生成的 AI 回答');
    assert.equal(requests.length, 1, '修改声音不重新请求模型');
    release();
    await chat.getByRole('button', { name: '复制 AI 回答', exact: true }).waitFor();
    assert.equal((await chat.locator('.message-body').last().textContent()).trim(), '语音偏好变化后，回答仍正常完成。');
    const input = chat.getByRole('textbox', { name: '向 AI 提问' });
    await input.fill('保留这段尚未发送的追问');
    await settingsPage.getByRole('combobox', { name: '服务', exact: true }).selectOption('openai');
    const afterVoice = await save('tts', 'provider', 'openai');
    assert.deepEqual(afterVoice.assistant.llm, before.data.assistant.llm);
    await chat.getByRole('button', { name: '翻译', exact: true }).click();
    await page.getByRole('dialog', { name: '划词翻译' }).getByText('这是一段用于恢复测试的译文。', { exact: true }).waitFor();
    await page.getByRole('dialog', { name: '划词翻译' }).getByRole('button', { name: '问问 AI', exact: true }).click();
    assert.equal(await chat.getByRole('button', { name: '复制 AI 回答', exact: true }).count(), 1, '切换声音后跨场景返回仍保留对话');
    assert.equal(await input.inputValue(), '保留这段尚未发送的追问', '切换声音后仍保留草稿');
    hold();
    await chat.getByRole('button', { name: '发送问题' }).click();
    await started;
    assert.ok(requests[1].messages.some(message => message.role === 'assistant' && message.content.includes('语音偏好变化后')), '后续请求仍带上一轮上下文');
    await settingsPage.getByRole('tab', { name: '问问 AI' }).click();
    await settingsPage.getByRole('combobox', { name: '服务', exact: true }).selectOption('openai');
    await save('llm', 'provider', 'openai');
    assert.equal(await chat.getByRole('button', { name: '停止生成', exact: true }).isVisible(), false, '模型服务变化仍取消旧请求');
    release();
    await page.waitForTimeout(250);
    assert.equal(await chat.getByRole('button', { name: '复制 AI 回答', exact: true }).count(), 1, '取消后旧模型回答不能晚到插入');
    assert.equal(requests.length, 2, '只有用户主动提交的两次模型请求');
    return { status: 'passed', mode: 'real-extension-controlled-sdk-and-settings-ui', requests: requests.length,
      unchangedSavePreserved: true, speed: afterSpeed.assistant.tts.speed, modelUnchangedByVoice: true, retainedRounds: 1, draftPreserved: true, modelChangeCancelled: true,
      checks: ['真实设置页保存语速', '不改配置保存对照', '声音变化不改变模型快照', '语速变化不中断AI', '无自动模型重发', '原请求正常完成', '切换声音保留对话上下文', '跨场景草稿保留', '模型变化仍取消旧请求', '取消后的回答不能晚到插入'] };
  } finally { release(); await settingsPage?.close(); await context.unroute(pattern, respond); await context.unroute(translationPattern, translate); }
}
