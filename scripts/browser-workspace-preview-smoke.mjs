// 仅在本地预览与专用测试浏览器中执行，使用假 Key 和受控响应。
async (page) => {
 const preview = await page.context().newPage();
 let modelCalls = 0, microsoftCalls = 0;
 await preview.route('https://api.deepseek.com/**', route => {
  modelCalls++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translation:'backtracking',context:'算法 · 名词',example:'Use backtracking to explore each path.',exampleTranslation:'使用回溯探索每条路径。',alternatives:[]})}}]})});
 });
 await preview.route('https://edge.microsoft.com/**', route => { microsoftCalls++; return route.abort(); });
 await preview.goto('http://127.0.0.1:4173/');
 await preview.getByRole('button',{name:'DeepSeek',exact:true}).click();
 await preview.getByRole('button',{name:'设置',exact:true}).click();
 await preview.getByLabel('API Key',{exact:true}).fill('fixture-preview-key');
 await preview.getByRole('button',{name:'保存配置',exact:true}).click();
 await preview.getByRole('textbox',{name:'输入要翻译的文本'}).fill('回溯');
 await preview.getByText('Use backtracking to explore each path.',{exact:false}).waitFor();
 await preview.reload();
 await preview.getByText('结果已恢复',{exact:true}).waitFor();
 if (modelCalls !== 1 || microsoftCalls !== 0) throw new Error('刷新后错误重发了原文');
 if (await preview.getByRole('button',{name:'DeepSeek',exact:true}).getAttribute('aria-pressed') !== 'true') throw new Error('刷新后未保留服务选择');
 await preview.getByRole('textbox',{name:'输入要翻译的文本'}).fill('新词');
 await preview.getByText('请先配置DeepSeek，再开始翻译。',{exact:true}).waitFor();
 if (microsoftCalls !== 0) throw new Error('预览 Key 丢失时不应改用微软');
 const safe = await preview.evaluate(() => !JSON.stringify(sessionStorage).includes('fixture-preview-key'));
 if (!safe) throw new Error('Key 不应进入会话记录');
 await preview.close();
 return {status:'passed',checks:['主词义保留语境和英文例句','预览刷新保留服务选择','恢复不重发原文','预览Key丢失不切换服务','会话不保存Key'],modelCalls,microsoftCalls,responseMode:'controlled-fixtures'};
}
