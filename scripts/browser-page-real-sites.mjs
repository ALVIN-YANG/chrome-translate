import assert from 'node:assert/strict';

// 公共网页检查使用真实网络；受控反例通过同一入口校验断言本身，单独标记其证据。
export default async function realSite(page, { translationTimeout = 30000 } = {}) {
  const responses = [];
  const context = page.context();
  const pageStatus = () => context.serviceWorkers()[0].evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    return chrome.tabs.sendMessage(tab.id, { type: 'ct:status' });
  }, page.url()).catch(() => null);
  const onResponse = response => {
    if (!response.url().startsWith('https://edge.microsoft.com/translate/translatetext?')) return;
    responses.push(response.request().allHeaders().then(headers => ({
      status: response.status(), credentialHeaders: Object.keys(headers).filter(name => /authorization|subscription-key|cookie/i.test(name)),
    })));
  };
  context.on('response', onResponse);
  try {
    const root = page.locator('main,[role="main"]').first();
    await root.waitFor();
    const originalCode = await root.locator('pre').evaluateAll(nodes => nodes.map(node => (node.querySelector('code') || node).textContent));
    const initial = await root.evaluate(element => {
      // 保留实际节点，防止标题、旁边段落或新插入的无关文本替代所测正文。
      window.__ctOriginalSource = [...element.querySelectorAll('p')].map(node => {
        const text = node.textContent;
        const eligible = text.trim().length >= 60 && /[a-z]/i.test(text) && !/[\u4e00-\u9fff]/u.test(text)
          && !node.closest('nav,header,footer,aside,form,pre,details,dialog,[popover],[role="navigation"],[role="banner"],[role="complementary"],[role="dialog"],[role="tooltip"],[hidden],[inert],[aria-hidden="true"],[translate="no"],[contenteditable]:not([contenteditable="false"])');
        return { node, text, eligible };
      });
      const bodyIndex = window.__ctOriginalSource.findIndex(({ node, eligible }) => {
        const rect = node.getBoundingClientRect();
        return eligible && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
          && getComputedStyle(node).visibility !== 'hidden';
      });
      return { paragraphs: window.__ctOriginalSource.length, bodyIndex };
    });
    assert.ok(initial.bodyIndex >= 0, '公共文档必须有首屏英文正文段落');
    const controls = page.locator('[data-ct-owned="controls"]');
    try { await controls.getByRole('button', { name: '翻译当前网页', exact: true }).click(); }
    catch {
      throw new Error(`真实网页没有可用入口；后台状态 ${JSON.stringify(await pageStatus())}；控件数量 ${await controls.count()}`);
    }
    const waitForParagraph = async (index, label) => {
      await page.evaluate(index => window.__ctOriginalSource[index].node.scrollIntoView({ block: 'center' }), index);
      try {
        const handle = await page.waitForFunction(index => {
          const source = window.__ctOriginalSource[index];
          if (!source.node.isConnected || source.node.textContent !== source.text) return false;
          const translated = source.node.querySelector(':scope > [data-ct-owned="translation"]')?.shadowRoot?.querySelector('[aria-label="译文"]');
          if (!translated) return false;
          const text = translated.textContent.trim(), rect = translated.getBoundingClientRect();
          if (text.length < 10 || !/[\u4e00-\u9fff]/u.test(text) || rect.width <= 0 || rect.height <= 0
              || getComputedStyle(translated).visibility === 'hidden') return false;
          return translated;
        }, index, { timeout: translationTimeout });
        try {
          // 前方译文会改变排版；等所测译文生成后，再把实际译文滚动进视口。
          await handle.asElement().scrollIntoViewIfNeeded({ timeout: translationTimeout });
          const result = await handle.evaluate((translated, index) => {
            const source = window.__ctOriginalSource[index], rect = translated.getBoundingClientRect();
            return { sourceCharacters: source.text.length, translationCharacters: translated.textContent.trim().length,
              inViewport: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
                && getComputedStyle(translated).visibility !== 'hidden' };
          }, index);
          assert.ok(result.inViewport, `${label}正文译文须实际进入视口`);
          return result;
        } finally { await handle.dispose(); }
      } catch {
        const paragraphState = await page.evaluate(index => {
          const source = window.__ctOriginalSource[index];
          const host = source.node.querySelector(':scope > [data-ct-owned="translation"]');
          const translated = host?.shadowRoot?.querySelector('[aria-label="译文"]');
          return { connected: source.node.isConnected, sourceMatches: source.node.textContent === source.text, sourceCharacters: source.text.length,
            sourceRect: source.node.getBoundingClientRect().toJSON(), host: Boolean(host),
            translationCharacters: translated?.textContent.length, chinese: /[\u4e00-\u9fff]/u.test(translated?.textContent || ''),
            translationRect: translated?.getBoundingClientRect().toJSON(), visibility: translated && getComputedStyle(translated).visibility, viewport: innerHeight };
        }, index);
        throw new Error(`${label}正文段落未显示中文译文；段落状态 ${JSON.stringify(paragraphState)}；页面状态 ${JSON.stringify(await pageStatus())}；微软响应 ${JSON.stringify(await Promise.all(responses))}`);
      }
    };
    const body = await waitForParagraph(initial.bodyIndex, '首屏');
    const belowFoldIndex = await page.evaluate(() => window.__ctOriginalSource.findIndex(({ node, eligible }) => {
      const rect = node.getBoundingClientRect();
      return eligible && node.isConnected && rect.width > 0 && rect.top > innerHeight * 2
        && !node.querySelector('[data-ct-owned="translation"]');
    }));
    assert.ok(belowFoldIndex >= 0, '公共长文必须实际覆盖尚未翻译的远处正文');
    const belowFold = await waitForParagraph(belowFoldIndex, '滚动后');
    const translatedCount = await page.locator('[data-ct-owned="translation"]').count();
    const screenshotCaptured = await page.screenshot({ path: `output/playwright/real-${new URL(page.url()).hostname}.png`, animations: 'disabled', timeout: 5000 }).then(() => true, () => false);
    await controls.locator('.float').click();
    assert.equal(await page.locator('[data-ct-owned="translation"]').count(), 0, '关闭移除全部译文');
    const source = await page.evaluate(() => ({ preserved: window.__ctOriginalSource.filter(row => row.node.isConnected && row.node.textContent === row.text).length }));
    assert.ok(initial.paragraphs > 0 && source.preserved === initial.paragraphs, '原有段落节点及内容均保留');
    // 校验工具读取高亮组件的开放 Shadow DOM；扩展本身仍不读取网站 Shadow DOM。
    const currentCode = await root.locator('pre').evaluateAll(nodes => nodes.map(node => ({ text: (node.querySelector('code') || node).textContent, shadow: node.getRootNode() !== document })));
    const counts = new Map();
    for (const row of currentCode) counts.set(row.text, (counts.get(row.text) || 0) + 1);
    let codePreserved = 0;
    for (const text of originalCode) if (counts.get(text)) { codePreserved++; counts.set(text, counts.get(text) - 1); }
    assert.ok(originalCode.length > 0, '公共技术文档必须实际验证代码块');
    assert.equal(codePreserved, originalCode.length, '原有代码文本均保留');
    const requests = await Promise.all(responses);
    assert.ok(requests.length > 0 && requests.every(row => row.status === 200 && row.credentialHeaders.length === 0), '真实微软调用成功且无凭据');
    return {
      status: 'passed', mode: 'real-public-site-real-microsoft-no-mocks', url: page.url(),
      sourceParagraphs: initial.paragraphs, sourceNodesPreserved: source.preserved, codeBlocksPreserved: codePreserved, codeBlocksInSiteShadowDOM: currentCode.filter(row => row.shadow).length,
      bodySourceCharacters: body.sourceCharacters, bodyTranslationCharacters: body.translationCharacters,
      belowFoldSourceCharacters: belowFold.sourceCharacters, belowFoldTranslationCharacters: belowFold.translationCharacters, belowFoldInitiallyUntranslated: true,
      translatedCount, screenshotCaptured, requests,
      checks: ['真实公共网页', '真实微软免Key调用', '首屏正文关联中文译文', '滚动后未翻译正文加载', '无认证或Cookie', '源段落和代码保留', '关闭恢复'],
    };
  } finally { context.off('response', onResponse); }
}
