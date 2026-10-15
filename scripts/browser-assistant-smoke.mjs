// 仅在专用测试扩展中执行，所有凭据与模型响应为测试数据。
export default async (page) => {
  const assert=(condition,message)=>{if(!condition)throw new Error(message)};
  const context=page.context(),worker=context.serviceWorkers()[0];
  const origin = new URL(page.url()).origin;
  const calls=[];let failAI=false,holdAI=false;
  await worker.evaluate(async origin=>{
    await chrome.storage.local.clear();
    await chrome.storage.local.set({'selection-services-v1':{llm:{provider:'deepseek',providers:{deepseek:{key:'fixture-ai-key'}}},tts:{provider:'minimax',providers:{minimax:{key:'fixture-voice-key',baseURL:`${origin}/v1`}}}}});
    globalThis.__assistantAudioEvents=[];
    chrome.runtime.onMessage.addListener(message=>{if(message.type==='ct:audio-event')globalThis.__assistantAudioEvents.push({status:message.state.status,playId:message.state.playId})});
  }, origin);
  await context.route('https://edge.microsoft.com/translate/translatetext?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(JSON.parse(route.request().postData()).map(text=>({detectedLanguage:{language:text==='回溯'?'zh-Hans':'en'},translations:[{text:text==='回溯'?'Looking back':'中文译文：'+text}]})))}));
  await context.route('https://cn.bing.com/dict/search?*',route=>route.fulfill({contentType:'text/html',body:'<div id="headword">回溯</div><div class="qdef"><ul><li><span class="pos">v.</span><span class="def">backtrack</span></li></ul></div>'}));
  await context.route('https://api.deepseek.com/chat/completions',async route=>{
    const body=JSON.parse(route.request().postData());calls.push(body);
    if(failAI){await route.fulfill({status:401,body:JSON.stringify({error:{message:'fixture-ai-key'}})});return}
    if(holdAI)await new Promise(resolve=>setTimeout(resolve,1000));
    const text=body.messages.length>3?'这是第二轮回答，保留了上轮上下文。':'**回溯算法**会尝试不同路径，失败时返回上一步。\n\n<img src="https://invalid.example/track" onerror="alert(1)"><script>alert(1)</script>';
    const chunks=[{id:'test',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{content:text},finish_reason:null}]},{id:'test',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{},finish_reason:'stop'}]}];
    await route.fulfill({contentType:'text/event-stream',body:chunks.map(chunk=>'data: '+JSON.stringify(chunk)+'\n\n').join('')+'data: [DONE]\n\n'});
  });
  const controlTTS=delayMs=>worker.evaluate(({origin,delayMs})=>fetch(`${origin}/control`,{method:'POST',body:JSON.stringify({delayMs})}),{origin,delayMs});
  const ttsCalls=()=>worker.evaluate(async origin=>await(await fetch(`${origin}/calls`)).json(),origin);
  await worker.evaluate(origin=>fetch(`${origin}/reset`,{method:'POST'}),origin);
  await page.reload();await page.getByRole('button',{name:'翻译当前网页',exact:true}).waitFor();
  const select=async text=>{
    await page.locator('#term').evaluate((el,text)=>{el.tabIndex=-1;el.focus({preventScroll:true});const node=el.firstChild,start=node.textContent.indexOf(text);const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+text.length);getSelection().removeAllRanges();getSelection().addRange(range)},text);
    await page.keyboard.press('Shift');await page.getByRole('toolbar',{name:'划词操作'}).waitFor();
  };
  await select('回溯');
  const bar=page.getByRole('toolbar',{name:'划词操作'});
  assert(await bar.getByRole('button').count()===3,'操作条只有翻译、朗读、AI三个入口');
  assert(calls.length===0&&(await ttsCalls()).length===0,'划词不自动发送模型或语音请求');
  await bar.getByRole('button',{name:'翻译选中文字'}).click();
  const translation=page.getByRole('dialog',{name:'划词翻译'});
  await translation.getByText('backtracking',{exact:true}).waitFor();
  await translation.getByRole('button',{name:'问问 AI',exact:true}).click();
  const chat=page.getByRole('dialog',{name:'问问 AI'});
  assert(calls.length===0,'打开AI面板不自动提交问题');
  await chat.getByRole('textbox',{name:'向 AI 提问'}).fill('解释回溯');
  await chat.locator('.chat-composer').evaluate(el=>el.requestSubmit());await page.waitForTimeout(100);
  assert(calls.length===0,'网页伪造requestSubmit不能触发付费请求');
  await chat.getByRole('button',{name:'发送问题'}).click();
  await chat.getByRole('button',{name:'复制 AI 回答'}).waitFor();
  assert(await chat.locator('.message-body img,.message-body script').count()===0,'不执行模型HTML或加载追踪图片');
  assert((await chat.locator('.message-body strong').textContent())==='回溯算法','安全渲染Markdown');
  assert(calls[0].messages.some(message=>message.content.includes('回溯')),'只传所选文字和问题');
  assert(!calls[0].messages.some(message=>message.content.includes('Private note')||message.content.includes('secret draft')),'不传整页或私有输入内容');
  await chat.getByRole('textbox',{name:'向 AI 提问'}).fill('再举一个例子');await chat.getByRole('textbox',{name:'向 AI 提问'}).press('Enter');
  await chat.getByText('这是第二轮回答，保留了上轮上下文。',{exact:true}).waitFor();
  assert(calls[1].messages.some(message=>message.role==='assistant'&&message.content.includes('回溯算法')),'多轮保留上下文');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await chat.getByRole('button',{name:'复制 AI 回答'}).last().click();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('第二轮回答'),'AI回答可复制');
  await page.screenshot({path:'output/playwright/assistant-chat-0.7.png'});
  holdAI=true;await chat.getByRole('textbox',{name:'向 AI 提问'}).fill('生成一个长解释');await chat.getByRole('button',{name:'发送问题'}).click();await chat.getByRole('button',{name:'停止生成'}).click();await page.waitForTimeout(1200);
  assert(await chat.getByRole('button',{name:'复制 AI 回答'}).count()===2,'取消后迟到回答不能插入');holdAI=false;
  failAI=true;await chat.getByRole('button',{name:'发送问题'}).click();await chat.getByText('DeepSeek拒绝授权，请检查 Key 和账号权限。',{exact:true}).waitFor();assert(!(await chat.textContent()).includes('fixture-ai-key'),'错误不泄露Key');failAI=false;
  await chat.getByRole('button',{name:'翻译',exact:true}).click();await translation.getByText('backtracking',{exact:true}).waitFor();
  await page.keyboard.press('Escape');await select('回溯');
  await bar.getByRole('button',{name:'朗读选中文字'}).click();
  await page.getByRole('button',{name:'暂停朗读',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-ct-owned="controls"]').shadowRoot.querySelector('.speech-caption').textContent.includes('正在朗读'));
  const spokenCalls=await ttsCalls();
  assert(spokenCalls.at(-1).text==='回溯','朗读发送的是选中原文');
  await page.getByRole('button',{name:'暂停朗读',exact:true}).click();await page.getByRole('button',{name:'继续朗读',exact:true}).waitFor();
  await page.getByRole('button',{name:'继续朗读',exact:true}).click();await page.getByRole('button',{name:'暂停朗读',exact:true}).waitFor();
  await page.getByRole('button',{name:'停止当前朗读',exact:true}).click();await page.locator('.speech-chip').waitFor({state:'hidden'});
  await controlTTS(1000);await select('回溯');await bar.getByRole('button',{name:'朗读选中文字'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-ct-owned="controls"]').shadowRoot.querySelector('.speech-caption').textContent.includes('准备声音'));
  await page.keyboard.press('Escape');await page.waitForTimeout(1200);await controlTTS(0);
  assert(!await page.locator('.speech-chip').isVisible(),'取消合成后的音频不能晚到播放');
  const audioEvents=await worker.evaluate(()=>globalThis.__assistantAudioEvents);
  assert(audioEvents.some(event=>event.status==='speaking')&&audioEvents.some(event=>event.status==='paused'),'实际HTMLAudio播放和暂停事件可观察');
  const settingsPage=await context.newPage();await settingsPage.goto(await worker.evaluate(()=>chrome.runtime.getURL('services.html')));
  await settingsPage.getByRole('combobox',{name:'服务',exact:true}).selectOption('custom');
  await settingsPage.getByRole('textbox',{name:'API 基础地址'}).fill('http://localhost:11434/v1');await settingsPage.getByRole('textbox',{name:'模型',exact:true}).fill('custom-model');
  await settingsPage.getByRole('button',{name:'保存设置'}).click();await settingsPage.getByText('设置已保存，下一次提问或朗读时生效。',{exact:true}).waitFor();await settingsPage.reload();
  assert(await settingsPage.getByRole('combobox',{name:'服务',exact:true}).inputValue()==='custom','自定义服务保存并恢复');assert(await settingsPage.getByRole('textbox',{name:'模型',exact:true}).inputValue()==='custom-model','自定义模型保存');
  await settingsPage.getByRole('tab',{name:'朗读声音'}).click();
  assert(await settingsPage.getByRole('combobox',{name:'服务',exact:true}).inputValue()==='minimax','声音选择独立保存');
  await settingsPage.getByRole('combobox',{name:'音色 ID'}).fill('Chinese (Mandarin)_Warm_Bestie');await settingsPage.getByRole('button',{name:'保存设置'}).click();await settingsPage.getByText('设置已保存，下一次提问或朗读时生效。',{exact:true}).waitFor();
  await settingsPage.screenshot({path:'output/playwright/assistant-settings-0.7.png'});
  for(const width of [390,320]){
    await settingsPage.setViewportSize({width,height:850});assert(await settingsPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px配置页溢出`);
    await page.setViewportSize({width,height:850});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await select('回溯');const bounds=await bar.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width,`${width}px操作条溢出`);
    await bar.getByRole('button',{name:'问问 AI'}).click();const panel=await chat.boundingBox();assert(panel.x>=0&&panel.x+panel.width<=width&&panel.y+panel.height<=850,`${width}px AI浮层溢出`);await page.keyboard.press('Escape');
  }
  await settingsPage.close();
  return {status:'passed',mode:'controlled-provider-real-extension-and-audio-element',llmCalls:calls.length,ttsCalls:(await ttsCalls()).length,audioEvents:audioEvents.map(event=>event.status),checks:['三入口操作条','无自动API请求','保留翻译词义','真实SDK流式AI','多轮上下文','Enter发送','取消过期隔离','鉴权错误和Key排除','Markdown过滤','防伪造submit','复制AI回答','原文朗读','实际Audio播放暂停恢复停止','取消合成','独立服务配置','本地自定义接口','配置保存重载','320px390px']};
}
