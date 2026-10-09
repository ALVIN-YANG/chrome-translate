async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const calls = [], dictionaryCalls = [], errors = [];
  const paragraph = 'Backtracking explores a possible path, returns to an earlier choice when that path fails, and then tries another branch.\n\n'.repeat(18) + 'End of explanation.';
  page.on('pageerror', error => errors.push(error.message));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('https://edge.microsoft.com/**', async route => {
    const text = JSON.parse(route.request().postData())[0]; calls.push(text);
    const result = text === '回溯' ? 'Retrospective' : text === 'bank' ? '银行' : text === '请使用回溯算法解决问题。' ? 'Please use backtracking to solve the problem.' : text === '请翻译以下回溯算法说明。' ? paragraph : `Translation: ${text}`;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ translations: [{ text: result }] }]) });
  });
  await page.route('https://cn.bing.com/**', async route => {
    const query = decodeURIComponent(route.request().url().split('q=')[1]); dictionaryCalls.push(query);
    if (query === '回溯') await page.waitForTimeout(700);
    if (query === 'no-dictionary') { await route.fulfill({ status: 503 }); return; }
    const meanings = query === '回溯' ? '<li><span class="pos">na.</span><span class="def">recall; look back upon</span></li><li><span class="pos">网络</span><span class="def">backtracking; trace back; backdate</span></li>'
      : query === 'bank' ? '<li><span class="pos">n.</span><span class="def">银行；河岸</span></li>' : '';
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<div class="qdef"><div id="headword">${query}</div><ul>${meanings}</ul></div>` }).catch(() => {});
  });
  await page.evaluate(async () => { sessionStorage.clear(); await chrome.storage.local.clear(); });
  await page.reload();
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  const result = page.getByRole('region', { name: '翻译结果', exact: true });
  assert(await page.getByRole('combobox', { name: '翻译模式', exact: true }).count() === 0, '自动模式不应显示选择选项');
  assert(await page.getByRole('combobox', { name: '原文语言', exact: true }).count() === 0, '原文语言只需自动识别');
  const candidate = text => page.locator('#alternatives-list').getByText(text, { exact: true });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await input.fill('回溯');
  await candidate('backtrack').waitFor();
  assert(await page.locator('#result-text').textContent() === 'Retrospective', '应立即显示主译文');
  await candidate('backtrack').dblclick();
  await candidate('recall').waitFor();
  assert(await page.evaluate(() => getSelection().toString()) === 'backtrack', '晚到词典不得打断已有文本选区');
  await page.keyboard.press('ControlOrMeta+C');
  assert(await page.evaluate(() => navigator.clipboard.readText()) === 'backtrack', '候选文本允许系统快捷键复制');
  assert(await page.locator('#result-text').textContent() === 'Retrospective', '点击候选文字不应替换主译文');
  assert(await page.getByRole('button', { name: /^使用译法 / }).count() === 0, '候选不再是点选按钮');
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('.result-panel')).borderTopWidth) === '0px', '只读译文不应有外框');
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('.alternative-entry')).borderLeftWidth) === '0px', '词义不应有卡片外框');
  assert(await candidate('backtracking').count() === 1, '应有算法名词候选');
  assert(await candidate('recall').count() === 1, '应有来自词典的其他词义');
  await page.getByRole('button', { name: '复制 backtrack', exact: true }).click();
  assert(await page.evaluate(() => navigator.clipboard.readText()) === 'backtrack', '候选可以直接一键复制');
  await page.getByRole('button', { name: '复制全部译法', exact: true }).click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).toLowerCase().includes('retrospective'), '全部译法复制保留服务返回的含义');
  await page.screenshot({ path: 'output/playwright/terms-static-0.2.1.png', fullPage: true });
  const beforeSentence = dictionaryCalls.length;
  await input.fill('请使用回溯算法解决问题。');
  await result.filter({ hasText: 'Please use backtracking to solve the problem.' }).waitFor();
  assert(await page.getByRole('region', { name: '候选译法', exact: true }).isVisible() === false, '完整句子只显示主译文');
  assert(dictionaryCalls.length === beforeSentence, '句子不得发送词典查询');
  await page.screenshot({ path: 'output/playwright/sentence-0.2.1.png', fullPage: true });
  await input.fill('请翻译以下回溯算法说明。');
  await result.filter({ hasText: 'End of explanation.' }).waitFor();
  assert(await page.locator('#result-text').textContent() === paragraph, '长段落译文必须完整保留');
  const textBounds = await result.boundingBox();
  const inputBounds = await page.locator('.source-panel').boundingBox();
  assert(textBounds.height > inputBounds.height, '长译文应自然超过输入框高度');
  assert(await page.evaluate(() => {
    const body = document.querySelector('.result-body');
    return getComputedStyle(body).overflowY === 'visible' && body.scrollHeight <= body.clientHeight + 1;
  }), '长译文不应被限制在独立滚动框内');
  await page.getByRole('button', { name: '复制译文', exact: true }).click();
  assert(await page.evaluate(() => navigator.clipboard.readText()) === paragraph, '长段落一键复制仍须完整');
  await input.fill('bank');
  await candidate('河岸').waitFor();
  assert(await page.locator('#result-text').textContent() === '银行', '英文多义词也应保留主译文');
  await page.getByRole('button', { name: '复制 河岸', exact: true }).click();
  assert(await page.evaluate(() => navigator.clipboard.readText()) === '河岸', '英文多义词候选独立复制');
  assert(await page.locator('#result-text').textContent() === '银行', '复制候选不应替换主译文');
  await input.fill('请说明银行和河岸的区别。');
  await result.filter({ hasText: 'Translation: 请说明银行和河岸的区别。' }).waitFor();
  assert(await page.getByRole('region', { name: '候选译法', exact: true }).isVisible() === false, '自动判断句段并隐藏候选');
  await input.fill('no-dictionary');
  await page.getByText('词典暂时不可用，已保留当前译文和可用的术语补充。', { exact: true }).waitFor();
  assert(await page.locator('#result-text').textContent() === 'Translation: no-dictionary', '词典失败仍可使用主译文');
  await input.fill('回溯');
  await candidate('backtrack').waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 980 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px 横向溢出`);
    await page.screenshot({ path: `output/playwright/terms-${width}-0.2.1.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole('button', { name: '清空', exact: true }).click();
  assert(await page.getByRole('region', { name: '候选译法', exact: true }).isVisible() === false, '清空应移除候选');
  assert(await page.getByRole('button', { name: '复制译文', exact: true }).isDisabled(), '清空后不能复制旧候选');
  assert(await page.getByRole('button', { name: '朗读译文', exact: true }).isDisabled(), '清空后不能朗读旧译文');
  assert(errors.length === 0, `页面错误：${errors.join('; ')}`);
  return { status: 'passed', translations: calls.length, dictionaries: dictionaryCalls.length, checks: ['无框连续阅读', '长译文自然展开与完整复制', '静态候选', '原生选中复制', '候选独立复制', '主译文复制', '先显示主译文', '晚到词典保留选区', '完整句子单译文', '英文多义词', '自动模式无选项', '词典失败降级', '窄屏', '清空'], responseMode: 'controlled-fixtures' };
}
