import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, providerChanges, updateSettings } from '../src/settings.js';

beforeEach(() => updateSettings(defaultSettings()));

test('局部保存保留网页偏好、其他服务和同服务模型，允许明确清空Key', async () => {
  await updateSettings({ provider: 'zhipu', page: { target: 'ja', floating: false }, providers: {
    deepseek: { key: 'old-fixture', model: 'custom-model' }, zhipu: { key: 'other-fixture' },
  } });
  const saved = await updateSettings({ providers: { deepseek: { key: ' new-fixture ' } } });
  assert.equal(saved.provider, 'zhipu');
  assert.deepEqual(saved.page, { target: 'ja', floating: false, selection: true });
  assert.deepEqual(saved.providers.deepseek, { key: 'new-fixture', model: 'custom-model' });
  assert.equal(saved.providers.zhipu.key, 'other-fixture');
  assert.equal((await updateSettings({ providers: { deepseek: { key: '' } } })).providers.deepseek.key, '');
});

test('旧草稿只提交编辑字段，不带回旧模型或未编辑服务', async () => {
  const before = defaultSettings().providers;
  const after = structuredClone(before); after.deepseek.key = 'edited-fixture';
  after.deepseek.unrecognized = 'ignored';
  const patch = providerChanges(before, after);
  assert.deepEqual(patch, { deepseek: { key: 'edited-fixture' } });
  await updateSettings({ providers: { deepseek: { model: 'new-model' }, zhipu: { key: 'new-other-fixture' } } });
  const saved = await updateSettings({ providers: patch });
  assert.equal(saved.providers.deepseek.model, 'new-model');
  assert.equal(saved.providers.zhipu.key, 'new-other-fixture');
  assert.equal(saved.providers.deepseek.key, 'edited-fixture');
});

test('预览中并发局部更新互不覆盖，返回对象不暴露可改写的内部状态', async () => {
  const [returned] = await Promise.all([updateSettings({ page: { target: 'ja' } }), updateSettings({ page: { floating: false } })]);
  returned.page.target = 'ru'; returned.providers.deepseek.key = 'mutated-fixture';
  const saved = await loadSettings();
  assert.deepEqual(saved.page, { target: 'ja', selection: true, floating: false });
  assert.equal(saved.providers.deepseek.key, '');
});
