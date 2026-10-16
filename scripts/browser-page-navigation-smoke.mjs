import assert from 'node:assert/strict';

export default async function pageNavigation(page) {
  const calls = [];
  await page.context().route('https://edge.microsoft.com/translate/translatetext?*', route => {
    const texts = JSON.parse(route.request().postData()); calls.push(texts);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(texts.map(text => ({
      detectedLanguage: { language: text.startsWith('这是') ? 'zh-Hans' : 'en' },
      translations: [{ text: text.startsWith('这是') ? text : `中文译文：${text}` }],
    }))) });
  });
  await page.reload();
  const controls = page.locator('[data-ct-owned="controls"]');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#first [aria-label="译文"]').waitFor();
  await page.locator('#article-link').click();
  await page.locator('#lazy [aria-label="译文"]').waitFor();
  assert.equal(await controls.getByRole('button', { name: '显示原文', exact: true }).count(), 1, '目录锚点不关闭当前翻译');
  const before = calls.length;
  await page.evaluate(() => {
    history.pushState({}, '', '?article=second');
    document.querySelector('main').innerHTML = '<h1>Another article</h1><p id="second">This second article must wait for a new translation action before its text is sent.</p>';
    scrollTo(0, 0);
  });
  const stopped = await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor({ timeout: 1500 }).then(() => true, () => false);
  assert.equal(await page.evaluate(() => location.search), '?article=second', '测试实际切换了页面查询参数');
  assert.equal(calls.slice(before).flat().filter(text => text.startsWith('This second article')).length, 0, '单页网站切换文章后不自动发送新正文');
  assert.ok(stopped, '新路径或查询参数下恢复为等待开启状态');
  assert.equal(await page.locator('[data-ct-owned="translation"]').count(), 0, '新文章没有晚到译文');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#second [aria-label="译文"]').waitFor();
  assert.ok(calls.flat().some(text => text.startsWith('This second article')), '重新开启后可翻译新文章');
  await page.evaluate(() => history.replaceState({ view: 'same' }, '', location.href));
  assert.equal(await controls.getByRole('button', { name: '显示原文', exact: true }).count(), 1, '同 URL 修改历史状态不关闭翻译');
  const beforeHash = calls.length;
  await page.evaluate(() => {
    history.pushState({}, '', '#/third-article');
    document.querySelector('main').innerHTML = '<p id="third">This third article uses a hash route and also requires a new translation action.</p>';
  });
  const hashStopped = await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor({ timeout: 1500 }).then(() => true, () => false);
  assert.equal(calls.slice(beforeHash).flat().filter(text => text.startsWith('This third article')).length, 0, '哈希路由的新文章不自动发送');
  assert.ok(hashStopped, '哈希路由切换后等待重新开启');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#third [aria-label="译文"]').waitFor();
  const beforeBack = calls.length;
  await page.evaluate(() => {
    window.addEventListener('popstate', () => {
      document.querySelector('main').innerHTML = '<p id="back">Returning to the previous article must also wait for explicit translation.</p>';
    }, { once: true });
    history.back();
  });
  await page.waitForURL(url => url.hash === '' && url.search === '?article=second');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  assert.equal(calls.slice(beforeBack).flat().filter(text => text.startsWith('Returning')).length, 0, '从哈希路由后退也停止翻译');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#back [aria-label="译文"]').waitFor();
  const worker = page.context().serviceWorkers()[0];
  await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.tabs.sendMessage(tab.id, { type: 'ct:selection-open', text: 'A complete selected sentence from the previous article.' });
  }, page.url());
  const panel = controls.getByRole('dialog', { name: '划词翻译' });
  await panel.getByText('中文译文：A complete selected sentence from the previous article.', { exact: true }).waitFor();
  await page.evaluate(() => history.replaceState({}, '', '/another-article.html'));
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  assert.equal(await page.locator('[data-ct-owned="translation"]').count(), 0, '只改变路径而不重绘正文也清理旧译文');
  assert.equal(await panel.isVisible(), false, '地址切换关闭旧文章的划词浮层');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#back [aria-label="译文"]').waitFor();
  const beforeForward = calls.length;
  await page.evaluate(() => {
    window.addEventListener('popstate', () => {
      document.querySelector('main').innerHTML = '<p id="forward">Going forward to an article still requires translation to be enabled again.</p>';
    }, { once: true });
    history.forward();
  });
  await page.waitForURL(url => url.hash === '#/third-article');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  assert.equal(calls.slice(beforeForward).flat().filter(text => text.startsWith('Going forward')).length, 0, '前进到另一文章不自动翻译');
  return { status: 'passed', mode: 'real-extension-controlled-provider', checks: ['目录锚点继续翻译', '查询参数跳转后停止', '新文章等待主动开启', '旧页面译文清理', '重新开启翻译新正文', '同URL状态更新继续翻译', '哈希路由新正文不自动发送', '哈希路由后退停止', '路径replaceState清理原节点译文', '切换文章关闭划词浮层', '前进到新文章停止翻译'] };
}
