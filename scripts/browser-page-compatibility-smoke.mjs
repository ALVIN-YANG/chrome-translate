import assert from 'node:assert/strict';

async function setup(page) {
  const context = page.context(), worker = context.serviceWorkers()[0];
  await worker.evaluate(() => chrome.storage.local.clear());
  const calls = [];
  let fail = false;
  await context.route('https://edge.microsoft.com/translate/translatetext?*', async route => {
    const texts = JSON.parse(route.request().postData());
    calls.push(texts);
    await route.fulfill(fail ? { status: 429, body: '{}' } : {
      contentType: 'application/json',
      body: JSON.stringify(texts.map(text => ({ detectedLanguage: { language: 'en' }, translations: [{ text: `中文：${text}` }] }))),
    });
  });
  await page.reload();
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  assert.equal(calls.length, 0, '主动开启前没有请求');
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#rerender [aria-label="译文"]').waitFor();
  return { calls, fail: () => { fail = true; } };
}

export async function boundaries(page) {
  const original = await page.locator('main').innerHTML();
  const { calls } = await setup(page);
  const texts = calls.flat();
  assert.ok(texts.includes('Hello world. Backtracking explores possible paths.'), `换行与内联词语不完整：${JSON.stringify(texts)}`);
  assert.ok(texts.includes('Crossword boundaries remain unchanged.'), 'CSS 隐藏的换行不能增加空格');
  assert.ok(!texts.some(text => text.includes('Private content')), '私有段落不发送');
  assert.equal(await page.locator('#breaks strong').textContent(), 'track', '原格式保持');
  await page.getByRole('button', { name: '显示原文', exact: true }).click();
  assert.equal(await page.locator('main').innerHTML(), original, '关闭恢复精确原 DOM');
  return { status: 'passed', mode: 'controlled-response-real-extension', checks: ['可见换行保留词界', '内联词语不拆散', '隐藏换行不添空格', '隐私段落排除', '原格式与关闭恢复'] };
}

export async function rerender(page) {
  const source = await page.locator('#rerender').textContent();
  const { calls, fail } = await setup(page);
  const translation = page.locator('#rerender [aria-label="译文"]');
  const translated = await translation.textContent();
  const before = calls.length;
  for (let round = 0; round < 3; round++) {
    await page.locator('#rerender').evaluate((element, text) => {
      const span = document.createElement('span'); span.textContent = text; element.replaceChildren(span);
    }, source);
    await translation.waitFor();
    assert.equal(await translation.textContent(), translated, '同文重绘应恢复已有译文');
    assert.equal(await page.locator('#rerender [data-ct-owned="translation"]').count(), 1, '恢复后不重复插入');
  }
  assert.equal(calls.length, before, '恢复已有结果不额外请求');
  await page.locator('#rerender [data-ct-owned="translation"]').evaluate(element => element.remove());
  await translation.waitFor();
  assert.equal(calls.length, before, '网站仅删除译文时也能从内存恢复');
  await page.locator('#rerender').evaluate(element => element.setAttribute('translate', 'no'));
  await translation.waitFor({ state: 'hidden' });
  await page.locator('#rerender').evaluate(element => element.removeAttribute('translate'));
  await translation.waitFor();
  assert.equal(calls.length, before, '隐私属性生效，解除后复用缓存');
  await page.locator('#rerender').evaluate(element => {
    window.__removedTranslations = 0;
    const remove = () => { for (const child of element.querySelectorAll('[data-ct-owned="translation"]')) { child.remove(); window.__removedTranslations++; } };
    window.__translationConflict = new MutationObserver(remove);
    window.__translationConflict.observe(element, { childList: true });
    remove();
  });
  await page.getByText('网站持续移除译文，已暂停翻译。请重试或显示原文。', { exact: true }).waitFor();
  const removals = await page.evaluate(() => window.__removedTranslations);
  assert.ok(removals > 1 && removals <= 12, '重复恢复必须有上限');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__removedTranslations), removals, '暂停后停止与网站争抢 DOM');
  assert.equal(calls.length, before, '冲突恢复不重复调用服务');
  await page.evaluate(() => window.__translationConflict.disconnect());
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await translation.waitFor();
  assert.equal(calls.length, before, '用户重试可恢复内存中的译文');
  fail();
  await page.locator('#dynamic').evaluate(element => { const p = document.createElement('p'); p.textContent = 'A new paragraph encounters a quota error.'; element.append(p); });
  await page.getByText('微软免费翻译请求过于频繁，请稍后重试或切换服务。', { exact: true }).waitFor();
  const failedCalls = calls.length;
  await page.locator('#rerender').evaluate((element, text) => { element.textContent = text; }, source);
  await translation.waitFor();
  assert.equal(await translation.textContent(), translated, '页面暂停时，已完成结果仍可恢复');
  assert.equal(calls.length, failedCalls, '恢复不得绕过配额暂停发起重试');
  await page.locator('.page-note').getByRole('button', { name: '显示原文', exact: true }).click();
  await page.waitForTimeout(180);
  assert.equal(await page.locator('[data-ct-owned="translation"]').count(), 0, '关闭后不得恢复或晚到插入');
  return { status: 'passed', mode: 'controlled-response-real-extension', requests: calls.length, checks: ['同文重绘恢复', '重复重绘只有一份译文', '仅删除译文恢复', '无额外翻译调用', '动态隐私属性', '持续冲突有上限并暂停', '暂停后不争抢DOM', '主动重试恢复缓存', '配额暂停后已有结果恢复', '不绕过暂停重试', '关闭后不重新插入'] };
}
