import assert from 'node:assert/strict';

// 只在显式选择的真实网络检查中使用；新建的测试配置无账号、Key 或历史。
export default async function realSite(page) {
  const responses = [];
  const pageStatus = () => page.context().serviceWorkers()[0].evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    return chrome.tabs.sendMessage(tab.id, { type: 'ct:status' });
  }, page.url()).catch(() => null);
  page.context().on('response', response => {
    if (!response.url().startsWith('https://edge.microsoft.com/translate/translatetext?')) return;
    responses.push(response.request().allHeaders().then(headers => ({
      status: response.status(), credentialHeaders: Object.keys(headers).filter(name => /authorization|subscription-key|cookie/i.test(name)),
    })));
  });
  const root = page.locator('main,[role="main"]').first();
  await root.waitFor();
  const originalCode = await root.locator('pre').evaluateAll(nodes => nodes.map(node => (node.querySelector('code') || node).textContent));
  const initial = await root.evaluate(element => {
    // 网站可异步增加段落；核对已存在的源节点，不要求整站停止更新。
    window.__ctOriginalSource = [...element.querySelectorAll('p')].map(node => ({ node, text: node.textContent }));
    return { paragraphs: window.__ctOriginalSource.length };
  });
  const controls = page.locator('[data-ct-owned="controls"]');
  try { await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click(); }
  catch {
    throw new Error(`真实网页没有可用入口；后台状态 ${JSON.stringify(await pageStatus())}；控件数量 ${await controls.count()}`);
  }
  const translated = page.locator('[data-ct-owned="translation"]:visible [aria-label="译文"]').filter({ hasText: /[\u4e00-\u9fff]/u }).first();
  try { await translated.waitFor({ timeout: 30000 }); }
  catch {
    const status = await pageStatus();
    throw new Error(`真实网页未显示中文译文；页面状态 ${JSON.stringify(status)}；微软响应 ${JSON.stringify(await Promise.all(responses))}`);
  }
  const translatedCount = await page.locator('[data-ct-owned="translation"]').count();
  const translatedCharacters = (await translated.textContent()).length;
  const screenshotCaptured = await page.screenshot({ path: `output/playwright/real-${new URL(page.url()).hostname}.png`, animations: 'disabled', timeout: 5000 }).then(() => true, () => false);
  await controls.locator('.float').click();
  assert.equal(await page.locator('[data-ct-owned="translation"]').count(), 0, '关闭移除全部译文');
  const source = await page.evaluate(() => ({ preserved: window.__ctOriginalSource.filter(row => row.node.isConnected && row.node.textContent === row.text).length }));
  assert.ok(initial.paragraphs > 0 && source.preserved === initial.paragraphs, '原有段落节点及内容均保留');
  // 校验工具读取高亮组件的开放 Shadow DOM；扩展本身仍不读取网站 Shadow DOM。
  const currentCode = await root.locator('pre').evaluateAll(nodes => nodes.map(node => ({ text: (node.querySelector('code') || node).textContent, shadow: node.getRootNode() !== document })));
  const counts = new Map();
  for (const row of currentCode) counts.set(row.text, (counts.get(row.text) || 0) + 1);
  let codePreserved = 0;
  for (const text of originalCode) if (counts.get(text)) { codePreserved++; counts.set(text, counts.get(text) - 1); }
  assert.ok(originalCode.length > 0, '公共技术文档必须实际验证代码块');
  assert.equal(codePreserved, originalCode.length, '原有代码文本均保留');
  const requests = await Promise.all(responses);
  assert.ok(requests.length > 0 && requests.every(row => row.status === 200 && row.credentialHeaders.length === 0), '真实微软调用成功且无凭据');
  return {
    status: 'passed', mode: 'real-public-site-real-microsoft-no-mocks', url: page.url(),
    sourceParagraphs: initial.paragraphs, sourceNodesPreserved: source.preserved, codeBlocksPreserved: codePreserved, codeBlocksInSiteShadowDOM: currentCode.filter(row => row.shadow).length, translatedCount, translatedCharacters, screenshotCaptured, requests,
    checks: ['真实公共网页', '真实微软免Key调用', '中文译文显示', '无认证或Cookie', '源段落和代码保留', '关闭恢复'],
  };
}
