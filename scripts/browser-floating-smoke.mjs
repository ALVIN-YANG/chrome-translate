import assert from 'node:assert/strict';

export default async function floatingEntry(page) {
  const context = page.context(), worker = context.serviceWorkers()[0], calls = [];
  await context.route('https://edge.microsoft.com/translate/translatetext?*', route => {
    const texts = JSON.parse(route.request().postData()); calls.push(texts);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(texts.map(text => ({ detectedLanguage: { language: 'en' }, translations: [{ text: `中文译文：${text}` }] }))) });
  });
  const controls = page.locator('[data-ct-owned="controls"]'), button = controls.locator('.float');
  await button.waitFor();
  const geometry = await button.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, shadow: getComputedStyle(el).boxShadow, text: el.textContent, icons: el.querySelectorAll('svg').length }));
  assert.deepEqual(geometry, { width: 32, height: 32, shadow: 'none', text: '', icons: 1 }, '悬浮入口为 32px 无阴影图标，不显示“译”字');
  const translationIcon = await button.locator('svg').innerHTML();
  const outside = await button.boundingBox();
  assert.equal(await page.evaluate(({ x, y, height }) => Boolean(document.elementFromPoint(x - 3, y + height / 2)?.closest('[data-ct-owned="controls"]')), outside), false, '按钮外侧没有额外点击区域');
  assert.equal(calls.length, 0);
  const drag = async (dx, dy) => {
    const before = await button.boundingBox();
    const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, selection: getSelection().toString() }));
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + dx, before.y + before.height / 2 + dy, { steps: 8 }); await page.mouse.up();
    const after = await button.boundingBox(), viewport = page.viewportSize();
    assert(Math.abs(after.x - Math.max(8, Math.min(viewport.width - 8 - before.width, before.x + dx))) < 2);
    assert(Math.abs(after.y - Math.max(8, Math.min(viewport.height - 8 - before.height, before.y + dy))) < 2);
    assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY, selection: getSelection().toString() })), scroll, '拖动不滚动网页或选择正文');
    return { before, after };
  };
  const moved = await drag(-160, 90);
  assert(Math.abs(moved.after.x - moved.before.x + 160) < 2 && Math.abs(moved.after.y - moved.before.y - 90) < 2, '原生鼠标拖动改变位置');
  assert.equal(await button.getAttribute('aria-pressed'), 'false'); assert.equal(calls.length, 0, '拖动不会启动翻译');
  await worker.evaluate(async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await chrome.storage.local.get('floating-button-position-v1'))['floating-button-position-v1']) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('拖动位置没有保存');
  });
  await page.reload(); await button.waitFor();
  const restored = await button.boundingBox();
  assert(Math.abs(restored.x - moved.after.x) < 2 && Math.abs(restored.y - moved.after.y) < 2, '刷新保留拖动位置');
  await button.click(); await page.locator('#first [data-ct-owned="translation"]').waitFor();
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await button.locator('svg').innerHTML(), translationIcon, '开启翻译保留同一图标，不切换成眼睛');
  const activeCalls = calls.length;
  await drag(-40, -40);
  assert.equal(await button.getAttribute('aria-pressed'), 'true', '拖动开启状态不恢复原文');
  assert.equal(calls.length, activeCalls, '拖动已开启按钮不增加调用');
  await button.focus(); await page.keyboard.press('Enter');
  assert.equal(await button.getAttribute('aria-pressed'), 'false', '键盘仍可切换原文');
  const keyboardBefore = await button.boundingBox(); await page.keyboard.press('ArrowLeft');
  assert(Math.abs((await button.boundingBox()).x - keyboardBefore.x + 8) < 1, '聚焦后方向键可调整位置');
  for (const viewport of [{ width: 320, height: 480 }, { width: 1440, height: 980 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const rect = await button.boundingBox();
    assert(rect.x >= 8 && rect.y >= 8 && rect.x + rect.width <= viewport.width - 8 && rect.y + rect.height <= viewport.height - 8, '窗口变化后保持可见');
  }
  await drag(5000, 5000);
  const edge = await button.boundingBox(), viewport = page.viewportSize();
  assert(edge.x + edge.width <= viewport.width - 8 && edge.y + edge.height <= viewport.height - 8, '不能拖出屏幕');
  assert.equal(calls.length, activeCalls);
  await page.screenshot({ path: 'output/playwright/floating-drag.png' });

  const popupURL = await worker.evaluate(() => chrome.runtime.getURL('popup.html'));
  const indexURL = await worker.evaluate(() => chrome.runtime.getURL('index.html'));
  const popup = await context.newPage();
  try {
    await popup.goto(popupURL);
    const [articleTab] = await worker.evaluate(url => chrome.tabs.query({ url }), page.url());
    await worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), articleTab.id);
    await popup.reload();
    await popup.waitForFunction(() => !document.getElementById('translate').disabled);
    const open = popup.getByRole('button', { name: '打开翻译界面', exact: true });
    assert.equal(await popup.locator('main > button').first().getAttribute('id'), 'open', '独立翻译入口在菜单第一项');
    await open.waitFor();
    assert.equal(await open.locator('[data-icon="translate-entry"] svg').innerHTML(), translationIcon, '菜单与悬浮入口使用同一翻译标识');
    const beforePages = await worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['TAB'] })).filter(row => row.documentUrl.split(/[?#]/)[0] === chrome.runtime.getURL('index.html')).length);
    assert.equal(beforePages, 0);
    await popup.locator('body').screenshot({ path: 'output/playwright/floating-popup.png' });
    const created = context.waitForEvent('page'); await open.click();
    const workspace = await created; await workspace.waitForURL(indexURL);
    await workspace.getByRole('textbox', { name: '输入要翻译的文本' }).waitFor();
    const again = await context.newPage();
    try {
      await again.goto(popupURL);
      const closed = again.waitForEvent('close');
      await again.getByRole('button', { name: '打开翻译界面', exact: true }).click(); await closed;
      assert.equal(await worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['TAB'] })).filter(row => row.documentUrl.split(/[?#]/)[0] === chrome.runtime.getURL('index.html')).length), 1);
      assert.equal((await worker.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true })))[0].url, indexURL, '再次打开复用并激活已有翻译页');
    } finally { if (!again.isClosed()) await again.close(); }
    await workspace.close();
  } finally { if (!popup.isClosed()) await popup.close(); }
  return { status: 'passed', mode: 'native-pointer-keyboard-and-extension-popup', checks: ['32px无阴影纯图标', '启停保持同一翻译图标', '菜单与悬浮图标一致', '点击区域不外扩', '拖动改变位置', '拖动不翻译', '拖动不滚屏或选择正文', '刷新恢复位置', '普通点击仍翻译', '开启时拖动不关闭或重发', '键盘Enter切换', '方向键移动', '窄窗口保持可见', '屏幕边缘限制', '菜单首项打开独立页', '重复打开复用原页'] };
}
