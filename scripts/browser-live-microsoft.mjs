// 通过 playwright-cli run-code 调用。向微软免费接口发送 3 段公开示例，不使用 Key。
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await page.getByRole('button', { name: '微软翻译', exact: true }).click();
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  const cases = [
    { source: 'Hello, how are you?', target: 'zh-Hans' },
    { source: '你好，今天过得怎么样？', target: 'en' },
    { source: 'Please review the updated design before tomorrow\'s meeting.\n\nWe will start with the translation page and add other features after testing.', target: 'zh-Hans' },
  ];
  const results = [];
  for (const item of cases) {
    const responsePromise = page.waitForResponse(response => response.url().startsWith('https://edge.microsoft.com/translate/translatetext'), { timeout: 30000 });
    await input.fill(item.source);
    const response = await responsePromise;
    await page.waitForFunction(() => ['success', 'error'].includes(document.getElementById('translation-status').dataset.status), { timeout: 30000 });
    const status = await page.locator('#translation-status').getAttribute('data-status');
    if (status !== 'success') throw new Error(await page.locator('#error-message').textContent());
    const text = await page.getByRole('region', { name: '翻译结果', exact: true }).textContent();
    if (response.status() !== 200 || !text.trim() || text === item.source) throw new Error('微软未成功返回新译文');
    if (!response.url().includes(`to=${item.target}`)) throw new Error('翻译方向不正确');
    const headers = await response.request().allHeaders();
    const credentialHeaders = Object.keys(headers).filter(name => /authorization|subscription-key|subscription-region|cookie/i.test(name));
    if (credentialHeaders.length) throw new Error('免 Key 请求不应携带凭据');
    results.push({ source: item.source, translation: text, httpStatus: response.status(), target: item.target, credentialHeaders });
  }
  await page.screenshot({ path: 'output/playwright/microsoft-live-0.1.1.png', fullPage: true });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  if (await page.getByRole('textbox', { name: 'API Key', exact: true }).count()) throw new Error('微软仍显示 Key 输入框');
  await page.screenshot({ path: 'output/playwright/microsoft-settings-0.1.1.png' });
  await page.keyboard.press('Escape');
  return { status: 'passed', mode: 'real-network-no-mocks', extensionVersion: await page.evaluate(() => chrome.runtime.getManifest().version), results };
}
