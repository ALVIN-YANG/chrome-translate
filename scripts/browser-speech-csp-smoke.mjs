export default async(page)=>{
 const context=page.context(),worker=context.serviceWorkers()[0];
 const origin = new URL(page.url()).origin;
 await worker.evaluate(origin=>chrome.storage.local.set({'selection-services-v1':{tts:{provider:'minimax',providers:{minimax:{key:'fixture-key',baseURL:`${origin}/v1`}}}}}), origin);
 await page.goto(`${origin}/strict.html`);
 await page.getByRole('button',{name:'翻译当前网页',exact:true}).waitFor();
 const rect=await page.locator('main p').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect().toJSON()});
 await page.mouse.move(rect.left+1,rect.top+rect.height/2);await page.mouse.down();await page.mouse.move(rect.right-1,rect.top+rect.height/2,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'朗读选中文字'}).click();
 await page.waitForFunction(()=>{const root=document.querySelector('[data-ct-owned="controls"]').shadowRoot;return !root.querySelector('.speech-chip').hidden&&root.querySelector('.speech-caption').textContent.includes('正在朗读')});
 await page.getByRole('button',{name:'停止当前朗读',exact:true}).click();await page.locator('.speech-chip').waitFor({state:'hidden'});
 return {status:'passed',mode:'real-extension-local-tts-server-real-audio',checks:['严格CSP仍可显示操作条','页面禁止media-src不阻止offscreen朗读','音频实际播放与停止']};
}
