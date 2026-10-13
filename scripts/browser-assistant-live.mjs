// 仅在隔离配置执行。凭据从临时、权限为 0600 的本机文件经 File API 导入可信设置页，绝不打印。
async (page) => {
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  const context=page.context(),worker=context.serviceWorkers()[0];
  await context.unrouteAll({behavior:'ignoreErrors'});
  await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.session.clear();globalThis.__liveAudioEvents=[];chrome.runtime.onMessage.addListener(message=>{if(message.type==='ct:audio-event')globalThis.__liveAudioEvents.push({status:message.state.status,playId:message.state.playId})});});
  const settingsPage=await context.newPage();await settingsPage.goto(await worker.evaluate(()=>chrome.runtime.getURL('services.html')));
  await settingsPage.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='credential-fixture';input.hidden=true;document.body.append(input)});
  await settingsPage.locator('#credential-fixture').setInputFiles('output/.assistant-live-credential.json');
  await settingsPage.evaluate(async()=>{const input=document.getElementById('credential-fixture');const data=JSON.parse(await input.files[0].text());document.getElementById('service-key').value=data.minimax;input.remove();});
  await settingsPage.getByRole('button',{name:'保存设置'}).click();await settingsPage.getByText('设置已保存，下一次提问或朗读时生效。',{exact:true}).waitFor();
  await settingsPage.getByRole('tab',{name:'朗读声音'}).click();await settingsPage.getByRole('combobox',{name:'服务',exact:true}).selectOption('minimax');
  await settingsPage.getByRole('button',{name:'保存设置'}).click();await settingsPage.getByText('设置已保存，下一次提问或朗读时生效。',{exact:true}).waitFor();
  await settingsPage.close();
  await page.goto('http://127.0.0.1:4174/article.html');
  const select=async()=>{await page.locator('#term').evaluate(el=>{el.tabIndex=-1;el.focus();const node=el.firstChild,start=node.textContent.indexOf('回溯');const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+2);getSelection().removeAllRanges();getSelection().addRange(range)});await page.keyboard.press('Shift');await page.getByRole('toolbar',{name:'划词操作'}).waitFor();};
  await select();await page.screenshot({path:'docs/assets/selection-toolbar.png'});
  await page.getByRole('button',{name:'问问 AI',exact:true}).click();
  const chat=page.getByRole('dialog',{name:'问问 AI'});
  await chat.getByRole('textbox',{name:'向 AI 提问'}).fill('用不超过60字解释回溯算法，并给一个使用场景。');await chat.getByRole('button',{name:'发送问题'}).click();
  await chat.getByRole('button',{name:'复制 AI 回答'}).waitFor({timeout:90000});
  const answer=await chat.locator('.chat-message.assistant .message-body').textContent();
  assert(answer.trim().length>10,'MiniMax实际返回可读回答');
  await page.screenshot({path:'docs/assets/selection-ai.png'});
  await page.keyboard.press('Escape');await select();await page.getByRole('button',{name:'朗读选中文字'}).click();
  await page.waitForFunction(()=>{const host=document.querySelector('[data-ct-owned="controls"]');const chip=host.shadowRoot.querySelector('.speech-chip');return !chip.hidden&&chip.querySelector('.speech-caption').textContent.includes('正在朗读')},{},{timeout:30000});
  await page.getByRole('button',{name:'暂停朗读',exact:true}).click();await page.getByRole('button',{name:'继续朗读',exact:true}).waitFor();
  await page.getByRole('button',{name:'继续朗读',exact:true}).click();
  await page.locator('.speech-chip').waitFor({state:'hidden',timeout:30000});
  const audioEvents=await worker.evaluate(()=>globalThis.__liveAudioEvents);
  assert(audioEvents.some(event=>event.status==='speaking')&&audioEvents.some(event=>event.status==='paused')&&audioEvents.at(-1).status==='idle','真实MiniMax音频实际播放、暂停恢复并结束');
  const result={status:'passed',mode:'real-minimax-api-real-chromium-extension',llm:{model:'MiniMax-M2.7',answer},tts:{model:'speech-2.8-turbo',voice:'Chinese (Mandarin)_Gentleman',events:audioEvents.map(event=>event.status)},keyHandling:'temporary-0600-file-to-trusted-options-page-no-output',note:'记录实际HTMLAudio播放与结束事件；没有人工听感评分'};
  await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.session.clear();});
  return result;
}
