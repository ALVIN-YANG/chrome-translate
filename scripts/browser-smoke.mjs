// 通过 playwright-cli run-code 调用此函数；仅使用测试凭据和受控网络响应。
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const waitText = async text => page.getByRole('region', { name: '翻译结果', exact: true }).filter({ hasText: text }).waitFor();
  const calls = [];
  const errors = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('https://cn.bing.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>No additional entries</html>' }));
  page.on('pageerror', error => errors.push(error.message));
  const hosts = ['edge.microsoft.com', 'fanyi-api.baidu.com', 'api.deepseek.com', 'api.kimi.com'];
  for (const host of hosts) {
    await page.route(`https://${host}/**`, async route => {
      const req = route.request();
      const body = req.postData();
      const parsed = host === 'fanyi-api.baidu.com' ? Object.fromEntries(body.split('&').map(pair => pair.split('=').map(part => decodeURIComponent(part.replace(/\+/g, ' '))))) : JSON.parse(body);
      const text = host === 'edge.microsoft.com' ? parsed[0] : host === 'fanyi-api.baidu.com' ? parsed.q : parsed.messages[1].content;
      calls.push({ host, text, url: req.url() });
      if (text === 'slow') await page.waitForTimeout(450);
      let response;
      if (text === 'rate-limit') { await route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"DO_NOT_DISPLAY"}' }); return; }
      if (host === 'api.kimi.com') { await route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"DO_NOT_DISPLAY"}' }); return; }
      const translated = text === 'Hello' ? '你好' : text === '你好世界' ? 'Hello world' : text === 'HTML' ? '<img src=x onerror=alert(1)>' : `测试译文：${text}`;
      if (host === 'edge.microsoft.com') response = [{ detectedLanguage: { language: /\p{Script=Han}/u.test(text) ? 'zh-Hans' : 'en' }, translations: [{ text: translated }] }];
      else if (host === 'fanyi-api.baidu.com') response = { from: /\p{Script=Han}/u.test(text) ? 'zh' : 'en', trans_result: [{ dst: translated }] };
      else response = { choices: [{ message: { content: translated }, finish_reason: 'stop' }] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }).catch(() => {});
    });
  }
  const current = page.url();
  await page.evaluate(() => chrome.storage.local.clear());
  await page.goto(current.replace(/#.*$/, ''));
  const input = page.getByRole('textbox', { name: '输入要翻译的文本' });
  await input.fill('Hello');
  await waitText('你好');
  assert(calls.length === 1, '全新安装无需配置即可调用微软');
  await page.getByRole('button', { name: '百度翻译', exact: true }).click();
  await page.getByText('配置后即可翻译', { exact: true }).waitFor();
  assert(calls.length === 1, '百度未配置时不应发送请求');
  await page.getByRole('button', { name: '微软翻译', exact: true }).click();
  await waitText('你好');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert(await page.getByRole('textbox', { name: 'API Key', exact: true }).count() === 0, '微软设置不应要求 API Key');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByText('测试翻译成功，可直接使用', { exact: true }).waitFor();
  for (const provider of ['baidu', 'deepseek', 'kimi']) {
    await page.getByRole('combobox', { name: '当前配置服务' }).selectOption(provider);
    if (provider === 'baidu') {
      await page.getByRole('textbox', { name: 'APP ID', exact: true }).fill('fixture-appid');
      await page.getByRole('textbox', { name: '密钥', exact: true }).fill('fixture-baidu-key');
    } else await page.getByRole('textbox', { name: 'API Key', exact: true }).fill(`fixture-${provider}-key`);
  }
  await page.getByRole('button', { name: '保存配置' }).click();
  await waitText('你好');
  await page.reload();
  await input.fill('你好世界');
  await waitText('Hello world');
  assert(calls.at(-1).url.includes('to=en'), '中文必须自动翻成英文');
  assert(await page.getByRole('combobox', { name: '译文语言' }).inputValue() === 'auto', '译文方向仍应自动');
  await input.fill('slow');
  await page.waitForFunction(() => document.getElementById('translation-status').textContent === '正在翻译');
  await input.fill('fast');
  await waitText('测试译文：fast');
  await page.waitForTimeout(500);
  assert(await page.getByRole('region', { name: '翻译结果', exact: true }).textContent() === '测试译文：fast', '迟到的旧译文覆盖了新译文');
  await input.fill('rate-limit');
  await page.getByText('微软免费翻译请求过于频繁，请稍后重试或切换服务。', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '复制译文', exact: true }).isDisabled(), '错误时禁止复制旧译文');
  assert(!(await page.locator('body').innerText()).includes('DO_NOT_DISPLAY'), '不得暴露服务原始响应');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  const beforeComposition = calls.length;
  await input.evaluate(el => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = 'nihao'; el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await page.waitForTimeout(80);
  assert(calls.length === beforeComposition, '输入法组合期间不得发送请求');
  await input.evaluate(el => {
    el.value = '你好世界';
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await waitText('Hello world');
  assert(calls.length === beforeComposition + 1, '输入法确认后应立即且仅发一次请求');
  await page.getByRole('button', { name: '百度翻译', exact: true }).click();
  await waitText('Hello world');
  assert(calls.at(-1).host === 'fanyi-api.baidu.com', '服务切换未发往百度');
  const beforeLong = calls.length;
  await input.fill('中'.repeat(2001));
  await page.getByText('百度单次最多支持 6,000 字节（约 2,000 个汉字），请分段粘贴。', { exact: true }).waitFor();
  assert(calls.length === beforeLong, '百度超长文本不应发送');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.getByRole('button', { name: 'DeepSeek', exact: true }).click();
  await input.fill('HTML');
  await waitText('<img src=x onerror=alert(1)>');
  assert(await page.getByRole('region', { name: '翻译结果', exact: true }).locator('img').count() === 0, '模型文本不应当作 HTML 渲染');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '复制译文', exact: true }).click();
  assert(await page.evaluate(() => navigator.clipboard.readText()) === '<img src=x onerror=alert(1)>', '复制内容不正确');
  await page.getByRole('button', { name: 'Kimi Coding Plan', exact: true }).click();
  await page.getByText('Kimi Coding Plan 拒绝了本次调用，请检查 Key 和允许的使用范围，或切换服务。', { exact: true }).waitFor();
  assert(calls.at(-1).url === 'https://api.kimi.com/coding/v1/chat/completions', 'Kimi 必须使用 Coding Plan 端点');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.getByRole('button', { name: '微软翻译', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('combobox', { name: '当前配置服务' }).selectOption('kimi');
  await page.screenshot({ path: 'output/playwright/settings.png' });
  await page.keyboard.press('Escape');
  assert(await page.getByRole('dialog').isVisible() === false, 'Esc 应关闭设置');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 980 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px 出现横向溢出`);
    await page.screenshot({ path: `output/playwright/page-${width}.png`, fullPage: true });
  }
  assert(errors.length === 0, `页面异常：${errors.join('; ')}`);
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  await page.screenshot({ path: 'output/playwright/translation-page.png' });
  return { status: 'passed', mockedRequests: calls.length, checked: ['真实扩展加载', '微软免配置', '其他服务未配置拦截', '设置持久化', '连接测试', '自动方向', '即时输入', 'IME 去重', '旧请求取消', '错误处理', '长度校验', 'HTML 纯文本', '复制', 'Coding Plan 端点', '键盘关闭', '响应式布局'], note: '本轮供应商响应为受控测试数据，真实接口另行验证' };
}
