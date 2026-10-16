import assert from 'node:assert/strict';

export default async function settingsPersistence(page) {
  const context = page.context(), worker = context.serviceWorkers()[0];
  const popup = await context.newPage();
  const opened = [popup];
  try {
    await popup.goto(await worker.evaluate(() => chrome.runtime.getURL('popup.html')));
    await popup.getByRole('combobox', { name: '网页目标语言' }).waitFor();
    for (let round = 0; round < 5; round++) {
      const result = await popup.evaluate(async () => {
        const baseline = await chrome.runtime.sendMessage({ type: 'ct:settings-update', page: { target: 'zh', floating: true, selection: true } });
        if (!baseline.ok) throw new Error('无法准备配置保存场景');
        const responses = await Promise.all([
          chrome.runtime.sendMessage({ type: 'ct:settings-update', page: { target: 'ja' } }),
          chrome.runtime.sendMessage({ type: 'ct:settings-update', page: { floating: false } }),
        ]);
        if (!responses.every(row => row.ok)) throw new Error('配置更新请求未完成');
        const { 'translation-settings-v1': settings } = await chrome.storage.local.get('translation-settings-v1');
        return settings.page;
      });
      assert.deepEqual(result, { target: 'ja', selection: true, floating: false }, `第 ${round + 1} 轮并发保存须同时保留两个改动`);
    }
    await popup.reload();
    await popup.waitForFunction(() => document.getElementById('target').value === 'ja');
    assert.equal(await popup.getByRole('combobox', { name: '网页目标语言' }).inputValue(), 'ja');
    assert.equal(await popup.getByRole('switch', { name: '网页右侧按钮' }).isChecked(), false);
    const first = await context.newPage(); opened.push(first);
    const settingsURL = await worker.evaluate(() => chrome.runtime.getURL('index.html#settings'));
    await first.goto(settingsURL);
    await first.locator('#settings-dialog').waitFor();
    await first.locator('#settings-provider').selectOption('deepseek');
    await first.locator('#field-key').fill('fixture-first-key');
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ct:settings-update', provider: 'zhipu', page: { target: 'fr', floating: true } }));
    const second = await context.newPage(); opened.push(second);
    await second.goto(settingsURL);
    await second.locator('#settings-dialog').waitFor();
    await second.locator('#field-key').fill('fixture-second-key');
    await second.locator('#settings-provider').selectOption('deepseek');
    await second.locator('#field-model').fill('fixture-custom-model');
    await second.locator('#save-settings').click();
    await second.locator('#settings-dialog').waitFor({ state: 'hidden' });
    await first.locator('#save-settings').click();
    await first.locator('#settings-dialog').waitFor({ state: 'hidden' });
    assert.equal(await first.locator('[data-provider="microsoft"]').getAttribute('aria-pressed'), 'true', '保存凭据不切换当前标签页的翻译服务');
    const final = await popup.evaluate(async () => {
      const { 'translation-settings-v1': settings } = await chrome.storage.local.get('translation-settings-v1');
      return { provider: settings.provider, page: settings.page, firstKeySaved: settings.providers.deepseek.key === 'fixture-first-key',
        secondKeySaved: settings.providers.zhipu.key === 'fixture-second-key', model: settings.providers.deepseek.model };
    });
    assert.deepEqual(final, { provider: 'zhipu', page: { target: 'fr', selection: true, floating: true },
      firstKeySaved: true, secondKeySaved: true, model: 'fixture-custom-model' }, '旧设置页只保存实际编辑的字段，保留另一页已保存的配置');
    return { status: 'passed', mode: 'real-extension-local-storage', checks: ['五轮并发网页偏好不丢更新', '重新打开保留配置', '跨页保存保留其他Key', '同服务独立字段不互相覆盖', '保留最新服务和网页偏好', '保存凭据不切换当前翻译服务'] };
  } finally { for (const openedPage of opened.reverse()) await openedPage.close(); }
}
