// 真实公共网页与微软接口验证，不模拟响应。
async (page) => {
  const context = page.context();
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.serviceWorkers()[0].evaluate(() => chrome.storage.local.clear());
  await page.goto('https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  const translatedParagraph = page.locator('main p [data-ct-owned="translation"]:visible').filter({ hasText: /Array|数组/ }).first();
  await translatedParagraph.waitFor({ timeout: 30000 });
  const paragraph = await translatedParagraph.locator('[aria-label="译文"]').textContent();
  if (!/[\u4e00-\u9fff]/u.test(paragraph)) throw new Error('公共网页未出现中文译文');
  const sourceCount = await page.locator('main p').count();
  const translated = await page.locator('[data-ct-owned="translation"]').count();
  await page.screenshot({ path: 'output/playwright/page-mdn-0.6.0.png' });
  await page.getByRole('button', { name: '显示原文', exact: true }).click();
  if (await page.locator('[data-ct-owned="translation"]').count() || await page.locator('main p').count() !== sourceCount) throw new Error('公共网页恢复失败');
  return { status: 'passed', mode: 'real-public-page-and-provider', url: page.url(), paragraph, translated, sourceParagraphsPreserved: sourceCount };
}
