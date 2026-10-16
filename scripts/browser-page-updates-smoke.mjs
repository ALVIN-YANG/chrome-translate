import assert from 'node:assert/strict';

export default async function pageUpdates(page) {
  const calls = [];
  await page.context().route('https://edge.microsoft.com/translate/translatetext?*', route => {
    const texts = JSON.parse(route.request().postData()); calls.push(texts);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(texts.map(text => ({
      detectedLanguage: { language: text.startsWith('这是') ? 'zh-Hans' : 'en' },
      translations: [{ text: text.startsWith('这是') ? text : `中文译文：${text}` }],
    }))) });
  });
  await page.reload();
  const paragraphs = Number(process.env.TRANSLATE_PAGE_PARAGRAPHS || 0);
  assert.ok(Number.isInteger(paragraphs) && paragraphs >= 0 && paragraphs <= 10000, '长文样本段落数应为 0 至 10000 的整数');
  if (paragraphs) await page.locator('main').evaluate((root, count) => {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index++) {
      const paragraph = document.createElement('p');
      paragraph.textContent = `Benchmark paragraph ${index} supplies stable article text for a repeated DOM scan measurement.`;
      fragment.append(paragraph);
    }
    root.append(fragment);
  }, paragraphs);
  const controls = page.locator('[data-ct-owned="controls"]');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.locator('#first [aria-label="译文"]').waitFor();
  const probes = [];
  try {
    for (const area of ['nav', 'main', 'stream']) {
      const id = `continuous-${area}`;
      const source = `A stable paragraph added while the ${area} clock keeps updating.`;
      await page.evaluate(({ area, id, source }) => {
        const clock = document.createElement(area === 'stream' ? 'p' : 'span'); clock.id = 'fixture-clock';
        document.querySelector(area === 'stream' ? '#dynamic' : area).append(clock);
        window.__clockTicks = 0; window.__insertedAt = performance.now();
        window.__clockTimer = setInterval(() => { const tick = ++window.__clockTicks; clock.textContent = area === 'stream' ? `Changing text version ${tick} is still arriving.` : String(tick); }, 20);
        const paragraph = document.createElement('p'); paragraph.id = id; paragraph.textContent = source;
        document.querySelector('#dynamic').append(paragraph);
      }, { area, id, source });
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      const translation = page.locator(`#${id} [aria-label="译文"]`);
      const duringUpdates = await translation.waitFor({ timeout: 1200 }).then(() => true, () => false);
      const firstWaitMs = await page.evaluate(() => Math.round(performance.now() - window.__insertedAt));
      if (firstWaitMs < 1500) await page.waitForTimeout(1500 - firstWaitMs);
      const measured = await page.evaluate(() => ({ ticks: window.__clockTicks, elapsedMs: Math.round(performance.now() - window.__insertedAt) }));
      const requestedDuringUpdates = calls.flat().includes(source);
      const stoppedAt = Date.now();
      await page.evaluate(area => {
        clearInterval(window.__clockTimer);
        const clock = document.querySelector('#fixture-clock');
        if (area === 'stream') { clock.id = 'completed-stream'; clock.textContent = 'A completed streamed paragraph is translated after its text settles.'; }
        else clock.remove();
      }, area);
      await translation.waitFor();
      if (area === 'stream') await page.locator('#completed-stream [aria-label="译文"]').waitFor();
      assert.equal(await page.locator(`#${id}`).textContent(), source, '保留源正文');
      probes.push({ area, duringUpdates, requestedDuringUpdates, firstWaitMs, afterQuietMs: Date.now() - stoppedAt, afterQuiet: true, ...measured });
    }
    assert.ok(probes.every(probe => probe.ticks > 0), '测试实际发生了持续页面更新');
    assert.ok(probes.every(probe => probe.duringUpdates), `稳定正文不能等整个页面停止更新：${JSON.stringify(probes)}`);
    assert.ok(!calls.flat().some(text => /^\d+$/u.test(text)), '纯数字计数器不发给服务');
    assert.ok(!calls.flat().some(text => text.startsWith('Changing text version')), '持续变化的同段文字不反复发送');
    assert.equal(calls.flat().filter(text => text.startsWith('A completed streamed paragraph')).length, 1, '流式正文结束后翻译最终内容一次');
    return { status: 'passed', mode: 'real-extension-controlled-provider', fixtureParagraphs: paragraphs, probes, requests: calls.length,
      checks: ['导航持续更新不饿死新正文', '正文计数器不饿死其他稳定段落', '同页流式更新不阻塞稳定段落', '原文保留', '纯数字不发请求', '流式中间版本不反复发送', '流式结束只翻译最终内容'] };
  } finally { await page.evaluate(() => clearInterval(window.__clockTimer)); }
}
