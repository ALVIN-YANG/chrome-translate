async (page) => {
 const context=page.context();
 await context.unrouteAll({behavior:'ignoreErrors'});
 await context.route('https://edge.microsoft.com/translate/translatetext?*', route=>route.fulfill({contentType:'application/json',body:JSON.stringify(JSON.parse(route.request().postData()).map(text=>({detectedLanguage:{language:'en'},translations:[{text:'安全策略页面的中文译文。'}]})))}));
 const strict=await context.newPage();
 await strict.goto('http://127.0.0.1:4174/strict.html');
 const button=strict.getByRole('button',{name:'翻译当前网页',exact:true});
 await button.waitFor();
 const position=await button.evaluate(el=>getComputedStyle(el).position);
 if(position!=='fixed')throw new Error('严格CSP页面的控件样式未生效');
 await button.click();
 await strict.locator('main p [aria-label="译文"]').waitFor();
 const display=await strict.locator('main p [data-ct-owned="translation"]').evaluate(el=>getComputedStyle(el).display);
 if(display!=='block')throw new Error('严格CSP页面没有按双语段落排版');
 await strict.getByRole('button',{name:'显示原文',exact:true}).click();
 if(await strict.locator('[data-ct-owned="translation"]').count())throw new Error('未恢复CSP页面');
 await strict.close();
 return {status:'passed',mode:'controlled-response-strict-site-CSP',checks:['样式隔离','后台翻译不受网页connect-src限制','双语段落','关闭恢复']};
}
