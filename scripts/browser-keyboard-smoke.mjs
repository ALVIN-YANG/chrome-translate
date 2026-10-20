import assert from 'node:assert/strict';

async function setup(page) {
  const calls = [];
  await page.context().route('https://edge.microsoft.com/translate/translatetext?*', route => {
    const texts = JSON.parse(route.request().postData()); calls.push(texts);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(texts.map(() => ({ detectedLanguage: { language: 'zh-Hans' }, translations: [{ text: 'backtracking' }] }))) });
  });
  await page.context().route('https://cn.bing.com/dict/search?*', route => route.fulfill({ contentType: 'text/html', body: '<div id="headword">回溯</div><div class="qdef"><ul><li><span class="pos">v.</span><span class="def">backtrack</span></li></ul></div>' }));
  await page.reload();
  const controls = page.locator('[data-ct-owned="controls"]');
  await controls.getByRole('button', { name: '翻译当前网页', exact: true }).waitFor();
  const select = async () => {
    await page.locator('#term').scrollIntoViewIfNeeded();
    // 每轮新建选区，避免在旧选区内拖动时变成浏览器原生文字拖放。
    await page.evaluate(() => getSelection().removeAllRanges());
    const rect = await page.locator('#term').evaluate(element => {
      const node = element.firstChild, start = node.textContent.indexOf('回溯'), range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + 2); return range.getBoundingClientRect().toJSON();
    });
    await page.mouse.move(rect.left + 1, rect.top + rect.height / 2); await page.mouse.down();
    await page.mouse.move(rect.right - 1, rect.top + rect.height / 2, { steps: 6 }); await page.mouse.up();
    assert.equal(await page.evaluate(() => getSelection().toString()), '回溯');
    await controls.getByRole('toolbar', { name: '划词操作' }).waitFor();
  };
  const open = async () => {
    await select();
    await controls.getByRole('button', { name: '翻译选中文字', exact: true }).focus();
    await page.keyboard.press('Enter');
    await controls.getByRole('dialog').getByText('backtracking', { exact: true }).waitFor();
  };
  return { controls, calls, open, select };
}

export async function focusReturn(page) {
  const { controls, calls, open, select } = await setup(page);
  assert.equal(await page.locator('#term').getAttribute('tabindex'), null, '原文默认不是交互控件');
  await open();
  await page.keyboard.press('Escape');
  await controls.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'term', 'Esc 后焦点返回原文位置');
  assert.equal(await page.locator('#term').getAttribute('tabindex'), '-1', '临时聚焦段落不插入 Tab 顺序');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'private', 'Tab 从原文继续到下一控件');
  assert.equal(await page.locator('#term').getAttribute('tabindex'), null, '离开原文后清理临时 tabindex');
  await open();
  await controls.getByRole('button', { name: '关闭划词翻译', exact: true }).press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'term', '关闭按钮也返回原文位置');
  await open();
  await page.locator('#private').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'private', '点击页面输入框不被焦点恢复打断');
  await controls.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.locator('#term').evaluate(element => element.setAttribute('tabindex', '0'));
  await open();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'term');
  assert.equal(await page.locator('#term').getAttribute('tabindex'), '0', '保留网页已有的 tabindex');
  await open();
  await page.locator('#private').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'private', '焦点已离开浮层时 Esc 不抢回原文');
  const requestCount = calls.length;
  const bar = controls.getByRole('toolbar', { name: '划词操作' });
  await select();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'private');
  assert.equal(await bar.isVisible(), false, '键盘进入输入框后隐藏旧划词条');
  await page.evaluate(() => {
    const editor = document.createElement('div');
    editor.id = 'writing'; editor.contentEditable = 'true'; editor.textContent = 'An unfinished draft.';
    document.querySelector('form').before(editor);
  });
  await select();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'writing');
  assert.equal(await bar.isVisible(), false, '键盘进入富文本编辑区后隐藏旧划词条');
  assert.equal(calls.length, requestCount, '焦点切换不发送翻译请求');
  assert.equal(await page.locator('#writing').textContent(), 'An unfinished draft.');
  return { status: 'passed', mode: 'real-keyboard-controlled-provider', checks: ['鼠标原生选区与Enter开启', 'Esc返回原文', '关闭按钮返回原文', 'Tab从原文继续', '离焦后清理临时tabindex', '保留网页原tabindex', '外部点击保留新焦点', '外部键盘焦点不被抢回', '键盘进入输入框隐藏旧划词条', '键盘进入富文本编辑区隐藏旧划词条', '焦点切换不请求或修改草稿'] };
}
