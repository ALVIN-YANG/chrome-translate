// 仅在专用测试配置中执行；使用假 Key 和受控响应，不代表厂商翻译质量。
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  assert(page.url().startsWith('chrome-extension://'), '必须在真实测试扩展中验证权限和存储');
  const services = {
    zhipu: { name: '智谱', host: 'open.bigmodel.cn', model: 'glm-4.7-flash' },
    siliconflow: { name: '硅基流动', host: 'api.siliconflow.cn', model: 'tencent/Hunyuan-MT-7B' },
    gemini: { name: 'Gemini', host: 'generativelanguage.googleapis.com', model: 'gemini-3.1-flash-lite' },
  };
  const calls = [], errors = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  page.on('pageerror', error => errors.push(error.message));
  for (const [id, service] of Object.entries(services)) {
    await page.route(`https://${service.host}/**`, route => {
      const request = route.request();
      const payload = JSON.parse(request.postData());
      assert(payload.model === service.model, `${id} 不应使用其他模型`);
      const text = id === 'siliconflow' ? payload.messages[0].content.split('\n\n')[1] : payload.messages[1].content;
      assert(request.headers().authorization === `Bearer fixture-${id}`, `${id} 的 Key 串用了其他服务`);
      calls.push({ provider: id, text });
      if (text === 'rate-limit') return route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"private-provider-detail"}' });
      const term = text === '回溯';
      const content = term && id !== 'siliconflow' ? JSON.stringify({ translation: 'backtracking', alternatives: [{ text: 'backtrack', context: '算法动作 · 动词', example: 'Backtrack when the path fails.', exampleTranslation: '路径失败时回溯。' }] }) : term ? 'backtracking' : '你好';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }) });
    });
  }
  await page.evaluate(() => chrome.storage.local.set({ 'translation-settings-v1': {
    provider: 'microsoft', providers: { deepseek: { key: 'fixture-existing-deepseek', model: 'custom-existing-model' }, kimi: { key: 'fixture-existing-kimi', model: 'kimi-for-coding' } },
  } }));
  await page.reload();
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  const result = page.getByRole('region', { name: '翻译结果', exact: true });
  assert(await page.locator('[data-provider]').count() === 7, '主界面应提供七项服务');
  for (const [id, service] of Object.entries(services)) {
    await page.getByRole('button', { name: service.name, exact: true }).click();
    await input.fill('Hello');
    await page.getByText(`请先配置${service.name}，再开始翻译。`, { exact: true }).waitFor();
    assert(calls.length === Object.keys(services).indexOf(id) * 3, '未配置时不应发请求');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    assert(await page.getByRole('combobox', { name: '当前配置服务' }).inputValue() === id, '应配置当前选择的服务');
    assert(await page.getByRole('combobox', { name: '当前配置服务' }).locator('option').count() === 7, '设置应提供同样的七项服务');
    assert(await page.getByLabel('模型', { exact: true }).count() === 0, '新服务不允许误选付费模型');
    assert((await page.locator('#service-description').textContent()).includes(id === 'zhipu' ? 'GLM-4.7-Flash' : id === 'siliconflow' ? 'Hunyuan-MT-7B' : '3.1 Flash-Lite'), '说明应显示固定模型');
    await page.getByLabel('API Key', { exact: true }).fill(`fixture-${id}`);
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await page.getByText('测试翻译成功；保存后可使用这份配置', { exact: true }).waitFor();
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    await result.filter({ hasText: '你好' }).waitFor();
    await input.fill('回溯');
    await result.filter({ hasText: 'backtracking' }).waitFor();
    if (id === 'siliconflow') assert(await page.locator('.alternative-entry').count() === 0, '混元翻译不展示伪造词义');
    else {
      await page.getByText('例：Backtrack when the path fails.', { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: '朗读例句 backtrack', exact: true }).count() === 1, '新模型例句应可朗读');
      assert(await page.getByRole('button', { name: '复制 backtrack', exact: true }).count() === 1, '新模型候选应可复制');
    }
    await page.getByRole('button', { name: '清空', exact: true }).click();
  }
  await page.reload();
  assert(await page.getByRole('button', { name: 'Gemini', exact: true }).getAttribute('aria-pressed') === 'true', '服务选择应在刷新后保留');
  const persisted = await page.evaluate(() => chrome.storage.local.get('translation-settings-v1'));
  const saved = persisted['translation-settings-v1'].providers;
  assert(saved.deepseek.key === 'fixture-existing-deepseek' && saved.deepseek.model === 'custom-existing-model', '升级不得覆盖已有配置');
  assert(saved.kimi.key === 'fixture-existing-kimi', '升级不得替换 Coding Plan Key');
  for (const id of Object.keys(services)) assert(saved[id].key === `fixture-${id}`, '各 Key 应分别保存');
  await input.fill('rate-limit');
  await page.getByText('调用频率或额度已达上限，请稍后重试或切换服务。', { exact: true }).waitFor();
  assert(calls.length === 10 && calls.at(-1).provider === 'gemini', '限流不得静默转发到其他服务');
  assert(!(await page.locator('body').innerText()).includes('private-provider-detail'), '不得显示原始响应');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  for (const width of [1100, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 页面溢出`);
    for (const id of Object.keys(services)) assert(await page.locator(`[data-provider="${id}"]`).isVisible(), '新增服务不可见');
  }
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  await page.getByRole('button', { name: '智谱', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/free-provider-settings-0.4.0.png', animations: 'disabled' });
  await page.getByRole('button', { name: '关闭服务设置' }).click();
  assert(errors.length === 0, errors.join('; '));
  return { status: 'passed', providers: Object.keys(services), requests: calls.length, checks: ['七项服务入口', '未配置不发请求', '固定免费模型', '各自 Key 和端点', '连接测试', '词义和英文例句', '例句朗读和候选复制入口', '混元单译文', '配置升级保留', '刷新持久化', '限流无自动转发', '窄屏布局'], responseMode: 'controlled-fixtures' };
}
