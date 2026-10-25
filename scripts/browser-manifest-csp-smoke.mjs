import assert from 'node:assert/strict';

export default async function manifestCSP(page) {
  const context = page.context(), worker = context.serviceWorkers()[0];
  const origin = new URL(page.url()).origin;
  const localhost = origin.replace('127.0.0.1', 'localhost');
  const settingsURL = await worker.evaluate(() => chrome.runtime.getURL('services.html'));
  const probe = await context.newPage();
  const messages = [];
  probe.on('console', message => messages.push(message.text()));
  const logs = await context.newCDPSession(probe);
  await logs.send('Log.enable');
  logs.on('Log.entryAdded', ({ entry }) => messages.push(entry.text));
  await probe.goto(settingsURL);
  await probe.locator('#service-provider option[value="system"]').waitFor({ state: 'attached' });
  const invalid = messages.filter(text => /invalid source/i.test(text));
  assert.deepEqual(invalid, [], '扩展页面不能出现 CSP invalid source 警告');
  await context.route(`${localhost}/**`, route => route.continue());
  await context.route('https://api.minimaxi.com/v1/csp-probe', route => route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
  let nonLocalRequested = false;
  await context.route('http://nonlocal.invalid/**', route => { nonLocalRequested = true; return route.abort(); });
  const allowed = await probe.evaluate(async ({ origin, localhost }) => {
    const ipv4 = await fetch(`${origin}/article.html`);
    const hostname = await fetch(`${localhost}/article.html`);
    const cloud = await fetch('https://api.minimaxi.com/v1/csp-probe');
    return { ipv4: ipv4.ok && (await ipv4.text()).includes('A readable article'), localhost: hostname.ok && (await hostname.text()).includes('A readable article'), https: cloud.ok && (await cloud.json()).ok };
  }, { origin, localhost });
  assert.deepEqual(allowed, { ipv4: true, localhost: true, https: true });
  const blocked = await probe.evaluate(async () => {
    try { await fetch('http://nonlocal.invalid/probe'); return false; } catch { return true; }
  });
  assert.equal(blocked, true);
  assert.equal(nonLocalRequested, false, '非本机 HTTP 在发出请求前被 CSP 拦截');
  await logs.detach();
  await probe.close();
  return { status: 'passed', mode: 'real-extension-browser-csp-parser-and-fetch', checks: ['扩展页 CSP 无无效源警告', '扩展脚本正常加载', '127.0.0.1接口允许', 'localhost接口允许', 'HTTPS接口允许', '非本机HTTP在网络前拦截'] };
}
