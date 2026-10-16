import assert from 'node:assert/strict';
import realSite from './browser-page-real-sites.mjs';

// 用真实扩展校验验证工具：只有标题有中文时必须失败，正文和滚动加载都成功时才通过。
export default async function verifyRealSiteScenario(page) {
  let headingsOnly = true;
  let requests = 0;
  await page.context().route('https://edge.microsoft.com/translate/translatetext?*', route => {
    requests++;
    const texts = JSON.parse(route.request().postData());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(texts.map(text => ({
      detectedLanguage: { language: 'en' },
      translations: [{ text: !headingsOnly || text === 'Reading with bilingual translation' ? '这是一段用于验证正文翻译和滚动加载的中文内容。' : text }],
    }))) });
  });
  await assert.rejects(() => realSite(page, { translationTimeout: 1200 }), /正文段落未显示中文译文/u, '只翻译标题不能通过真实网页验证');
  assert.equal(await page.locator('#first [data-ct-owned="translation"]').count(), 0, '负例确实没有正文译文');
  assert.ok(await page.locator('h1 [data-ct-owned="translation"]').count() > 0, '负例确实有中文标题');
  headingsOnly = false;
  await page.reload();
  await page.evaluate(() => {
    const details = document.createElement('details'); details.open = true;
    const summary = document.createElement('summary'); summary.textContent = 'Browser compatibility';
    const note = document.createElement('p');
    note.textContent = 'Browser compatibility notes describe support status across different versions and devices. This explanatory widget is separate from the article paragraph being read.';
    details.append(summary, note); document.querySelector('#first').before(details);
    document.body.style.overflowAnchor = 'none';
    window.__ctLateLayoutShift = false;
    const observer = new MutationObserver(() => {
      if (!document.querySelector('#lazy > [data-ct-owned="translation"]')) return;
      observer.disconnect();
      const spacer = document.createElement('div'); spacer.style.height = '1600px';
      document.querySelector('#lazy').before(spacer);
      window.__ctLateLayoutShift = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  const expectedBodyCharacters = await page.locator('#first').evaluate(element => element.textContent.length);
  const result = await realSite(page, { translationTimeout: 5000 });
  assert.equal(result.bodySourceCharacters, expectedBodyCharacters, '选择文章正文而非兼容性控件说明');
  assert.equal(await page.evaluate(() => window.__ctLateLayoutShift), true, '正例实际经历译文加载后的排版位移');
  assert.ok(result.bodyTranslationCharacters > 10);
  assert.ok(result.belowFoldTranslationCharacters > 10);
  return {
    status: 'passed', mode: 'controlled-provider-real-extension-verifier', requests,
    checks: ['拒绝仅标题译文', '真实正文关联', '正文排除兼容性控件', '滚动后的正文译文', '加载后排版位移仍能定位', '源段落与代码保留', '关闭恢复'],
  };
}
