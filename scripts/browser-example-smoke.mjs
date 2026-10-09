// 仅在专用测试扩展配置中执行；模型响应和 Key 均为测试数据。
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  for (const host of ['api.deepseek.com', 'api.kimi.com']) {
    await page.route(`https://${host}/**`, async route => {
      const request = JSON.parse(route.request().postData());
      assert(request.messages[0].content.includes('example MUST be in English'), `${host} 未指定英文例句`);
      calls.push(host);
      const content = JSON.stringify({ translation: 'backtracking', alternatives: [
        { text: 'backtrack', context: '算法动作 · 动词', example: 'If a path fails, backtrack and try another one.', exampleTranslation: '如果一条路径失败，就回溯并尝试另一条。' },
        { text: 'trace back', context: '追溯来源', example: '我们可以追溯这个问题的原因。', exampleTranslation: '模型只返回中文时不展示为英文例句。' },
      ] });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }) });
    });
  }
  for (const provider of ['deepseek', 'kimi']) {
    await page.evaluate(provider => chrome.storage.local.set({ 'translation-settings-v1': {
      provider, providers: { [provider]: { key: `fixture-${provider}-key`, model: 'fixture-model' } },
    } }), provider);
    await page.reload();
    await page.getByRole('textbox', { name: '输入要翻译的文本' }).fill('回溯');
    const candidate = text => page.locator('.alternative-entry').filter({ has: page.locator('.alternative-text').filter({ hasText: new RegExp(`^${text}$`) }) });
    const backtrack = candidate('backtrack');
    await backtrack.getByText('例：If a path fails, backtrack and try another one.', { exact: true }).waitFor();
    assert(await backtrack.locator('.alternative-example-translation').textContent() === '如果一条路径失败，就回溯并尝试另一条。', '中文释义应独立展示');
    const traceBack = candidate('trace back');
    assert(await traceBack.locator('.alternative-example').count() === 0, '不能展示纯中文英文例句');
    assert(await traceBack.locator('.alternative-example-translation').count() === 0, '不能只展示中文辅助释义');
    assert(await page.getByRole('region', { name: '翻译结果', exact: true }).textContent() === 'backtracking', '错误例句不能影响主译文');
    assert(await page.getByRole('button', { name: '复制 backtrack', exact: true }).isEnabled(), '候选仍可独立复制');
    if (provider === 'deepseek') await page.screenshot({ path: 'output/playwright/english-examples-0.2.1.png', fullPage: true });
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 980 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 例句布局横向溢出`);
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  assert(calls.length === 2, '每个模型只发一次原翻译请求，无额外例句调用');
  assert(errors.length === 0, errors.join('; '));
  return { status: 'passed', providers: calls, checks: ['模型英文例句指令', '英文例句及独立中文释义', '过滤纯中文例句', '保留主译文和候选', '单次模型请求', '窄屏'], responseMode: 'controlled-fixtures' };
}
