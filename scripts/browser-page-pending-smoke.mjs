import assert from 'node:assert/strict';

async function pendingChange(page, waitForScan) {
  const calls = [];
  let releaseFirst;
  let firstStarted;
  const pending = new Promise(resolve => { releaseFirst = resolve; });
  const started = new Promise(resolve => { firstStarted = resolve; });
  const pattern = 'https://edge.microsoft.com/translate/translatetext?*';
  const respond = async route => {
    const texts = JSON.parse(route.request().postData());
    calls.push(texts);
    if (calls.length === 1) { firstStarted(); await pending; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(texts.map(text => ({
      detectedLanguage: { language: 'en' }, translations: [{ text: `中文译文：${text}` }],
    }))) });
  };
  await page.context().route(pattern, respond);
  await page.reload();
  await page.locator('main').evaluate(root => {
    root.replaceChildren();
    for (let index = 0; index < 13; index++) {
      const paragraph = document.createElement('p');
      paragraph.id = `pending-${index}`;
      paragraph.style.cssText = 'margin:0;font-size:14px;line-height:24px';
      paragraph.textContent = `Pending paragraph ${index} waits behind a slow translation request.`;
      const section = document.createElement('section');
      section.append(paragraph); root.append(section);
    }
  });
  try {
    await page.getByRole('button', { name: '翻译当前网页', exact: true }).click();
    await started;
    assert.equal(calls[0].length, 8, '第一批请求已经发送，其余正文仍排队');
    await page.evaluate(() => {
      document.querySelector('#pending-8').parentElement.remove();
      document.querySelector('#pending-9').textContent = 'Updated paragraph replaces a queued original before it is sent.';
      document.querySelector('#pending-10').parentElement.setAttribute('translate', 'no');
      document.querySelector('#pending-11').parentElement.hidden = true;
    });
    const worker = page.context().serviceWorkers()[0];
    const state = await worker.evaluate(async ({ url, waitForScan }) => {
      const [tab] = await chrome.tabs.query({ url });
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const state = await chrome.tabs.sendMessage(tab.id, { type: 'ct:status' });
        if (!waitForScan || state.total === 10) return state;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('页面变更尚未被扩展扫描');
    }, { url: page.url(), waitForScan });
    assert.equal(state.translated, 0, '首批尚未完成时已处理正文变化');
    releaseFirst();
    await page.locator('#pending-9 [aria-label="译文"]').waitFor();
    await page.locator('#pending-12 [aria-label="译文"]').waitFor();
    const sent = calls.flat();
    const obsolete = [8, 9, 10, 11].map(index => `Pending paragraph ${index} waits behind a slow translation request.`);
    assert.deepEqual(sent.filter(text => obsolete.includes(text)), [], '已移除、已替换、标为不翻译或隐藏的排队正文不应再发送');
    assert.equal(sent.filter(text => text.startsWith('Updated paragraph')).length, 1, '新正文只发送一次');
    assert.equal(await page.locator('#pending-10 [data-ct-owned="translation"]').count(), 0, '不翻译标记保持生效');
    assert.equal(await page.locator('#pending-11 [data-ct-owned="translation"]').count(), 0, '隐藏内容不插入译文');
    await page.getByRole('button', { name: '显示原文', exact: true }).click();
    assert.equal(await page.locator('main [data-ct-owned="translation"]').count(), 0, '停止后清理所有译文');
    return { status: 'passed', waitForScan, totalAtRelease: state.total, requests: calls.length, sentParagraphs: sent.length,
      checks: ['慢请求期间其余正文排队', '首批未完成时变更正文', '删除或替换及祖先排除的排队正文不发送', '替换后的正文只发送一次', '祖先不翻译标记生效', '祖先隐藏内容不插入', '停止清理译文'] };
  } finally { releaseFirst(); await page.context().unroute(pattern, respond); }
}

export default async function pagePending(page) {
  const cases = [];
  for (const waitForScan of [true, false]) cases.push(await pendingChange(page, waitForScan));
  return { status: 'passed', mode: 'real-extension-controlled-provider', cases,
    checks: cases.flatMap(result => result.checks.map(check => `${result.waitForScan ? '扫描后响应' : '直接响应'}：${check}`)) };
}
