import assert from 'node:assert/strict';

// 实际 ZIP 的隔离扩展页；受控响应与语音事件，不读取用户配置或调用收费服务。
export default async function sourceInput(page) {
  const calls = [], errors = [];
  let releaseTranslation;
  const delayed = new Promise(resolve => { releaseTranslation = resolve; });
  await page.addInitScript(() => {
    const engine = new EventTarget();
    window.__sourceSpoken = [];
    engine.getVoices = () => ['zh-CN', 'en-US', 'ja-JP', 'fr-FR'].map(lang => ({ name: lang, lang, localService: true }));
    engine.cancel = () => {};
    engine.speak = utterance => { __sourceSpoken.push({ text: utterance.text, lang: utterance.lang }); utterance.onstart?.(); };
    Object.defineProperty(window, 'speechSynthesis', { value: engine });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } } });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://edge.microsoft.com/**', async route => {
    const query = new URL(route.request().url()).searchParams;
    const text = JSON.parse(route.request().postData())[0];
    const from = query.get('from'), to = query.get('to');
    calls.push({ text, from, to });
    if (text === 'A sentence waiting for translation.') await delayed;
    if (text === 'A sentence that fails to translate.') return route.fulfill({ status: 503 });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{
      detectedLanguage: { language: text === '東京' ? 'ja' : text === 'Bonjour' ? 'fr' : 'en' },
      translations: [{ text: `Translated (${from || 'auto'} → ${to}): ${text}` }],
    }]) }).catch(() => {});
  });
  await page.route('https://cn.bing.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html>No entries</html>' }));
  await page.evaluate(async () => { sessionStorage.clear(); await chrome.storage.local.clear(); });
  await page.reload();
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  const source = page.getByRole('combobox', { name: '原文语言', exact: true });
  const target = page.getByRole('combobox', { name: '译文语言', exact: true });
  const read = page.locator('#read-source');
  const output = page.getByRole('region', { name: '翻译结果', exact: true });
  const completed = () => page.locator('#translation-status[data-status="success"]').waitFor();
  assert.equal(await source.inputValue(), 'auto');
  assert.equal(await source.locator('option').count(), 16);
  assert(await read.isDisabled());
  await input.fill('Bonjour'); await completed();
  assert.equal(calls.at(-1).from, null, '自动模式仍由服务识别');
  assert.equal(await source.locator('option:checked').textContent(), '自动识别 · 法语');
  await read.click();
  assert.deepEqual(await page.evaluate(() => __sourceSpoken.at(-1)), { text: 'Bonjour', lang: 'fr-FR' });
  assert.equal(await read.getAttribute('aria-label'), '停止朗读原文');
  await read.click();
  assert.equal(await read.getAttribute('aria-pressed'), 'false');
  await source.selectOption('ja'); await completed();
  await input.fill('東京'); await completed();
  assert.deepEqual(calls.at(-1), { text: '東京', from: 'ja', to: 'zh-Hans' });
  const beforeManual = calls.length;
  await source.selectOption('zh'); await completed();
  assert.equal(calls.length, beforeManual + 1, '手动中文不能被服务日语检测结果再次改写');
  assert.deepEqual(calls.at(-1), { text: '東京', from: 'zh-Hans', to: 'en' });
  assert.equal(await source.inputValue(), 'zh');
  await read.click();
  assert.equal(await page.evaluate(() => __sourceSpoken.at(-1).lang), 'zh-CN');
  await source.selectOption('fr'); await completed();
  assert.equal(await read.getAttribute('aria-pressed'), 'false', '换原文语言停止旧声音');
  await target.selectOption('ja'); await completed();
  assert.equal(calls.at(-1).to, 'ja', '手动目标继续生效');
  await target.selectOption('auto'); await completed();
  await input.fill('A sentence waiting for translation.');
  await page.locator('#translation-status[data-status="loading"]').waitFor();
  await read.click();
  assert.deepEqual(await page.evaluate(() => __sourceSpoken.at(-1)), { text: 'A sentence waiting for translation.', lang: 'fr-FR' });
  releaseTranslation(); await completed();
  assert.equal(await read.getAttribute('aria-pressed'), 'true', '翻译完成不能打断原文朗读');
  assert(await page.locator('#speech-status').isHidden(), '正常朗读不增加状态行');
  await page.locator('#read-result').click();
  assert.equal(await read.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#read-result').getAttribute('aria-pressed'), 'true');
  await read.click();
  assert.equal(await page.locator('#read-result').getAttribute('aria-pressed'), 'false', '原文和译文共用一个播放器');
  await input.fill('A new sentence for translation.'); await completed();
  assert.equal(await read.getAttribute('aria-pressed'), 'false', '改原文停止旧朗读');
  const beforeReload = calls.length;
  await page.reload();
  await page.getByText('结果已恢复', { exact: true }).waitFor();
  assert.equal(await source.inputValue(), 'fr');
  assert.equal(calls.length, beforeReload, '匹配源语言的会话直接恢复，不重复调用');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  assert(await read.isDisabled());
  await page.getByRole('button', { name: '撤销清空', exact: true }).click();
  assert.equal(await source.inputValue(), 'fr');
  assert.equal(calls.length, beforeReload);
  await input.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  assert(await read.isDisabled(), '选字期间不朗读半成品');
  await input.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await completed();
  assert(await read.isEnabled());
  await input.fill('A sentence that fails to translate.');
  await page.locator('#translation-status[data-status="error"]').waitFor();
  await read.click();
  assert.equal(await page.evaluate(() => __sourceSpoken.at(-1).text), 'A sentence that fails to translate.', '翻译失败仍可读当前原文');
  await input.fill('   ');
  assert(await read.isDisabled());
  assert.equal(await read.getAttribute('aria-pressed'), 'false');
  await source.selectOption('auto');
  await input.fill('Bonjour'); await completed();
  assert.equal(calls.at(-1).from, null, '切回自动时去掉手动源语言参数');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 980 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 页面横向溢出`);
    await page.getByRole('button', { name: '清空', exact: true }).click();
    for (const selector of ['#read-source', '#undo-clear', '#character-count']) {
      const bounds = await page.locator(selector).boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width, `${width}px ${selector} 超出页面`);
    }
    await page.getByRole('button', { name: '撤销清空', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  await source.selectOption('fr'); await completed();
  await page.screenshot({ path: 'output/playwright/source-input-current.png' });
  assert.deepEqual(errors, []);
  assert(await output.isVisible());
  return { status: 'passed', responseMode: 'controlled-fixtures', speech: 'controlled-system-events', requests: calls.length,
    checks: ['自动加15种源语言', '自动模式不传from', '服务识别语言朗读原文', '再次点击停止', '手动源语言写入请求', '手动源语言优先服务检测', '手动源语言选择声音', '切换语言停止声音', '手动目标保留', '译文返回不打断原文朗读', '正常朗读无新增状态行', '原文译文播放互斥', '修改原文停止声音', '源语言及结果刷新恢复不重发', '清空禁用和撤销恢复', 'IME朗读禁用与恢复', '翻译失败仍可朗读输入', '空白不可朗读', '切回自动识别', '320px390px布局'] };
}
