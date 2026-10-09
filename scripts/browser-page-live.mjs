// 在专用测试扩展使用真实微软/必应网络；不使用任何用户 Key。
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const context = page.context();
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => { await chrome.storage.local.clear(); });
  const responses = [];
  context.on('response', async response => {
    if (!/^https:\/\/(edge.microsoft.com|cn.bing.com)\//.test(response.url())) return;
    const headers = await response.request().allHeaders();
    responses.push({ service: response.url().includes('edge.microsoft.com') ? 'microsoft' : 'bing', status: response.status(), credentialHeaders: Object.keys(headers).filter(name => /authorization|subscription-key|cookie/i.test(name)) });
  });
  await page.goto('http://127.0.0.1:4174/article.html');
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#first [aria-label="译文"]').waitFor({ timeout: 30000 });
  const paragraph = await page.locator('#first [aria-label="译文"]').textContent();
  assert(/[\u4e00-\u9fff]/u.test(paragraph) && !paragraph.startsWith('中文译文：'), '真实微软返回中文正文');
  assert(await page.locator('#first').evaluate(el => el.firstChild.textContent.startsWith('A good translation')), '原文保留');
  await page.screenshot({ path: 'docs/assets/webpage.png' });
  await page.getByRole('button', { name: '显示原文', exact: true }).click();
  await page.locator('#term').evaluate(el => {
    el.tabIndex = -1; el.focus();
    const range = document.createRange(), node = el.firstChild, offset = node.textContent.indexOf('回溯');
    range.setStart(node, offset); range.setEnd(node, offset + 2);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.press('Shift');
  await page.getByRole('button', { name: '翻译选中文字', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '划词翻译' });
  await panel.getByText('backtracking', { exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const terms = await panel.locator('.entry-text').allTextContents();
  assert(terms.includes('backtrack') && terms.includes('backtracking'), '真实划词包含算法的动词与名词');
  await page.screenshot({ path: 'docs/assets/selection.png' });
  await page.keyboard.press('Escape');
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  assert(commands.some(command => command.name === 'toggle-page' && command.shortcut), '网页快捷键已注册');
  await page.keyboard.press('Alt+a');
  const shortcutActivated = await page.getByRole('button', { name: '显示原文', exact: true }).isVisible();
  if (shortcutActivated) await page.getByRole('button', { name: '显示原文', exact: true }).click();
  assert(responses.length > 0 && responses.every(response => response.status === 200 && response.credentialHeaders.length === 0), '真实请求成功且没有凭据');
  return { status: 'passed', mode: 'real-network-no-mocks', version: await worker.evaluate(() => chrome.runtime.getManifest().version), paragraph, terms, responses, commands, shortcutActivated, note: '系统朗读按钮已显示，未新增人工听感验收；其他服务无真实Key调用' };
}
