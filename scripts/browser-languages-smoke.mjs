// 专用测试扩展中的受控多语言请求和 UI 验证。
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const languages = { zh: '你好', en: 'Hello', ja: 'こんにちは', ko: '안녕하세요', fr: 'Bonjour', de: 'Hallo', es: 'Hola', pt: 'Olá', ru: 'Привет', it: 'Ciao', ar: 'مرحبا', hi: 'नमस्ते', th: 'สวัสดี', vi: 'Xin chào', id: 'Halo' };
  const calls = [], dictionaries = [], errors = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cn.bing.com/**', route => {
    dictionaries.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>No entries</html>' });
  });
  await page.route('https://edge.microsoft.com/**', route => {
    const query = route.request().url().split('?')[1];
    const params = Object.fromEntries(query.split('&').map(pair => pair.split('=').map(decodeURIComponent)));
    const text = JSON.parse(route.request().postData())[0];
    assert(!Object.hasOwn(params, 'from'), '原文应由服务自动识别');
    const target = params.to === 'zh-Hans' ? 'zh' : params.to;
    const source = text === 'こんにちは' || text === '東京' ? 'ja' : text === 'Bonjour' ? 'fr' : 'zh';
    calls.push({ text, target });
    const translated = text === '東京' ? target === 'zh' ? '东京' : 'Tokyo' : languages[target];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ detectedLanguage: { language: source }, translations: [{ text: translated }] }]) });
  });
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  const target = page.getByRole('combobox', { name: '译文语言', exact: true });
  const result = page.getByRole('region', { name: '翻译结果', exact: true });
  assert(await page.getByRole('combobox', { name: '翻译模式' }).count() === 0, '不得显示词语句段模式选项');
  assert(await page.getByRole('combobox', { name: '原文语言' }).count() === 0, '不得显示原文语言选项');
  assert(await target.locator('option').count() === 16, '自动目标加 15 种常用语言');
  await input.fill('欢迎使用翻译。');
  await result.filter({ hasText: 'Hello' }).waitFor();
  for (const [language, translation] of Object.entries(languages)) {
    await target.selectOption(language);
    await page.waitForFunction(expected => document.getElementById('translation-status').dataset.status === 'success' && document.getElementById('result-text').textContent === expected, translation);
    assert(calls.at(-1).target === language, `${language} 目标编码错误`);
    assert(await result.getAttribute('lang') === language, `${language} 内容语言标签错误`);
    if (language === 'ar') assert(await result.getAttribute('dir') === 'rtl', '阿拉伯语应按从右向左展示');
  }
  assert(dictionaries.length === 0, '段落和非中英目标不查询词典');
  await target.selectOption('auto');
  await input.fill('こんにちは');
  await result.filter({ hasText: '你好' }).waitFor();
  assert(calls.at(-1).target === 'zh', '日语默认译为中文');
  assert(await page.locator('#source-language').textContent() === '自动识别 · 日语', '日语源语言应来自实际服务结果');
  await input.fill('Bonjour');
  await page.waitForFunction(() => document.getElementById('source-language').textContent === '自动识别 · 法语');
  assert(dictionaries.length === 0, '法语短词不误查英语词典');
  const beforeTokyo = calls.length;
  await input.fill('東京');
  await result.filter({ hasText: '东京' }).waitFor();
  assert(calls.length === beforeTokyo + 2, '共享汉字的日语应按服务检测修正自动目标');
  assert(await target.inputValue() === 'auto', '自动目标修正后仍保留自动选择');
  assert(await target.locator('option').first().textContent() === '简体中文（自动）', '显示修正后的自动目标');
  await target.selectOption('en');
  await result.filter({ hasText: 'Tokyo' }).waitFor();
  assert(calls.at(-1).target === 'en', '明确指定的目标不得被自动覆盖');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 980 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 多语言布局溢出`);
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  await input.fill('欢迎使用翻译。');
  await target.selectOption('ar');
  await result.filter({ hasText: 'مرحبا' }).waitFor();
  await page.screenshot({ path: 'output/playwright/languages-0.3.0.png', fullPage: true });
  assert(errors.length === 0, errors.join('; '));
  return { status: 'passed', targets: Object.keys(languages), calls: calls.length, checks: ['模式及源语言选项移除', '15种目标语言', '原文自动识别', '外语默认译中文', '日语汉字自动修正', '非中英词典隔离', '阿拉伯语方向', '窄屏'], responseMode: 'controlled-fixtures' };
}
