# Chrome Translate · 翻译

简体中文 · [English](README.en.md)

[![自动检查](https://img.shields.io/github/actions/workflow/status/ALVIN-YANG/chrome-translate/check.yml?branch=main&label=check)](https://github.com/ALVIN-YANG/chrome-translate/actions/workflows/check.yml)
[![最新版本](https://img.shields.io/github/v/release/ALVIN-YANG/chrome-translate)](https://github.com/ALVIN-YANG/chrome-translate/releases/latest)
[![MIT 许可证](https://img.shields.io/github/license/ALVIN-YANG/chrome-translate)](LICENSE)

划词后直接**翻译或朗读**的 Chrome 扩展。支持网页双语、独立文本翻译和 **15 种翻译语言**；翻译服务、声音、Key 和接口可以自己选择。

默认的**微软翻译和系统朗读无需 Key**。云端声音按需配置，首次翻译不用先申请模型账号。

**[下载最新插件包](https://github.com/ALVIN-YANG/chrome-translate/releases/latest)** · [安装](#安装) · [朗读声音](#朗读声音) · [翻译服务](#翻译服务) · [反馈问题](https://github.com/ALVIN-YANG/chrome-translate/issues/new/choose)

## 安装

适用于 **Chrome 120 或更新版本**。安装 Release 插件包不需要 Node.js，也不需要注册开发者账号。

1. 在 [Releases](https://github.com/ALVIN-YANG/chrome-translate/releases/latest) 下载 **`translate-chrome-*.zip`**，解压到一个固定文件夹。
2. 打开 `chrome://extensions`，开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择**直接包含 `manifest.json` 的那个文件夹**。
4. 从 Chrome 的扩展程序菜单打开「翻译 · 多语言」，点击菜单第一项 **「打开翻译界面」**，粘贴 `Hello, world.` 即可使用。
5. 刷新已打开的普通网页后，即可划词翻译、朗读或开启网页双语。插件可按需固定到工具栏。

> 「Code → Download ZIP」下载的是源码，需先构建。直接安装请使用 Release 中的插件包，不要选 `Source code`。

更新时，用新版安装包覆盖原文件夹，在扩展管理页点击「重新加载」，再刷新翻译页及需要翻译的网页。保留安装文件夹，不要移动或删除它。

## 划词翻译与朗读

选中文字后，附近出现一条紧凑的操作条：**翻译｜朗读**。只选中文字不会发送请求。

- **翻译**：中文默认译英文，其他语言译中文。短词展示不同译法、语境和例句；句子与段落通常展示一份译文。结果可以自由选中和复制。
- **朗读**：直接读所选原文。左下角播放条可暂停、继续和停止，Esc 也能停止。换选区取消旧朗读，长文字分段处理。

[![划词操作条：翻译与朗读](docs/assets/selection-toolbar.png)](docs/assets/selection-toolbar.png)

例如，查询「回溯」时，可以同时参考算法名词 `backtracking`、动词 `backtrack`，以及追溯来源的 `trace back`。每项译法和例句都可单独朗读，例句优先使用目标语言。

[![划词翻译：回溯的算法词义、例句、复制与朗读](docs/assets/selection.png)](docs/assets/selection.png)

点击浮层外或按 Esc 关闭；也可以使用右键菜单「翻译选中文字」。支持系统选中复制、单项复制和复制全部译法。

## 朗读声音

从工具栏菜单、独立翻译页或划词译文浮层打开 **「朗读声音设置」**。声音与翻译服务独立选择，可修改 API Key、基础地址、模型、音色 ID 和语速，并直接试听。

支持**系统声音、MiniMax、OpenAI、ElevenLabs、硅基流动**，以及使用 OpenAI Audio Speech、MiniMax 或 ElevenLabs 协议的自定义语音服务。默认系统声音无需 Key。硅基流动语音可沿用翻译设置中的同平台 Key，也可单独填写。

使用 MiniMax 温润男声：选择 **MiniMax**，填写 API Key，模型使用 `speech-2.8-turbo`，音色 ID 填 `Chinese (Mandarin)_Gentleman`。点击「试听声音」确认后保存。所选原文、译文和例句都会使用这个声音。音色留空时按中英文自动选择，也可填写平台上自己的音色 ID。

[![朗读声音设置：MiniMax 温润男声、模型与语速](docs/assets/voice-settings.png)](docs/assets/voice-settings.png)

*以上截图来自实际扩展运行，使用测试凭据、受控翻译响应与本机测试音；点击图片可查看大图。*

自定义远程地址必须使用 HTTPS；本机服务可使用 `localhost` 或 `127.0.0.1` 的 HTTP 地址。填写基础地址即可，插件补全 API 路径；地址不能包含账户、查询参数或片段。

系统朗读只选择设备本地声音。**支持某种翻译语言，不代表设备已安装对应声音**；缺少声音时会提示，复制仍可使用。云端服务的费用、额度、语言和音色权限由对应账号决定。

## 网页双语

点击工具栏菜单中的 **「翻译当前网页」**、网页右侧的圆形图标、右键菜单，或按 **Alt+A**，译文会显示在原文下方。再次点击或按相同快捷键，恢复原文。macOS 的 Alt 对应 Option。

默认优先翻译文章正文，跳过导航和侧栏；先处理视口附近的段落，滚动时继续。工具栏的 **「翻译整个页面」** 或 **Alt+W** 可扩大范围，仍跳过代码、表单、输入框、可编辑区域和标记为不翻译的内容。链接、原有格式和点击事件保留。

[![网页双语：英文正文下显示中文，保留代码和输入框](docs/assets/webpage.png)](docs/assets/webpage.png)

右侧按钮为 **32px 圆形图标**，无阴影，支持拖动、位置记忆和方向键微调。工具栏可选择翻译服务、网页目标语言，以及开关划词和悬浮按钮。

- 动态增加或修改的正文稳定后继续翻译。网站重绘时优先复用已完成结果；持续冲突时暂停并提供重试。
- 更换服务或目标语言会恢复原文，需再次主动开启翻译。刷新或跳转到新页面后同样需要重新开启；当前文档内的目录锚点跳转保留翻译。
- 网页译文缓存只保存在当前页面内存中。关闭后重新开启可复用，页面刷新或路由切换后清理。

支持普通 HTTP/HTTPS 网页的文字。不包含 PDF、图片和视频字幕翻译，也不读取子框架或网站的 Shadow DOM；浏览器内置页、插件市场及本地文件不支持注入。快捷键冲突可在 `chrome://extensions/shortcuts` 修改。

## 独立文本翻译

[![独立文本翻译：回溯的候选词义与例句](docs/assets/preview.png)](docs/assets/preview.png)

*独立页截图来自 v0.5.0，使用微软翻译和必应词典。*

粘贴或修改文本后立即翻译，输入法选字期间不发请求。原文默认自动识别，也可在输入区左上角手动选择 15 种语言；目标默认中文译英文，其他语言译中文，也可自行指定。

输入区左下角的「朗读」可直接读原文，无需等待译文；再次点击停止。原文、译文和例句沿用同一份朗读声音设置，修改原文或切换语言会停止当前朗读。

结果采用无框阅读布局，支持自由选中、复制、单项朗读和例句朗读。新输入会取消旧请求，迟到结果不会覆盖当前内容；失败时保留并标明上次译文，仍可复制和朗读。

菜单第一项「打开翻译界面」会优先激活已有翻译页。当前标签页暂存原文、服务、原文及目标语言和结果，刷新可恢复；清空后有 8 秒可点击「撤销清空」。单次最多 10,000 个字符，百度还受 6,000 字节限制。

## 翻译服务

在独立页右上角「设置」填写凭据，使用「测试连接」检查。服务手动切换，失败时不会自动转发给另一家服务，也不自动重试。

| 服务 | 配置 | 用途 |
| --- | --- | --- |
| 微软翻译 | 无需 Key | 文本翻译，中英短词可补充必应词义 |
| 百度翻译 | APP ID、密钥 | 官方通用文本翻译，返回主译文 |
| 智谱 | API Key | `glm-4.7-flash`，支持词义候选和例句 |
| 硅基流动 | API Key | `tencent/Hunyuan-MT-7B`，专门翻译文本 |
| Gemini | Google AI Studio Key | `gemini-3.1-flash-lite`，支持词义候选和例句 |
| DeepSeek | API Key、模型 | 默认 `deepseek-flash`，支持词义候选和例句 |
| Kimi Coding Plan | Coding Plan Key、模型 | 默认 `kimi-for-coding`，支持词义候选 |

智谱、硅基流动和 Gemini 的免费模型仍需注册账号，可能有地区、额度和限流限制。免费政策核查于 2026-10-09，后续以厂商为准；申请入口及来源见 [免费模型说明](docs/免费模型说明.md)。Gemini 免费层内容可能用于改进 Google 产品，请勿输入敏感文本。

微软使用 Edge 的免 Key 接口，其长期稳定性没有第三方使用承诺。Kimi Code 面向个人编程场景，翻译用途需符合账号规则；权限拒绝时直接提示，不伪装客户端。

支持中文、英语、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、意大利语、阿拉伯语、印地语、泰语、越南语和印尼语。短文本可能有歧义，可补充上下文；阿拉伯语支持从右向左阅读。词义候选和模型生成的例句也可能不准确，没有可靠候选时不强行凑数。

## 数据与权限

- 文字直接发送给当前选择的翻译或语音服务；微软中英短词补充还会查询必应。不会向翻译服务发送网页 URL、Cookie 或整份 HTML。
- Key 和偏好保存在本机 `chrome.storage.local`，不进行浏览器云端同步。普通网页脚本只收到服务名称、是否已配置及非敏感偏好，不能读取 Key。
- 独立页内容保存在标签页 `sessionStorage`，不含 Key；浏览器恢复标签页时可能恢复。项目不建立翻译历史库。
- 云端音频在可信 offscreen 文档合成和播放。请求 `storage`、`contextMenus`、`offscreen` 及普通网页访问权限，不请求麦克风、剪贴板读取或浏览记录权限。
- 没有自建中转后端、统计 SDK、广告或远程脚本。取消请求不保证服务商停止计算或计费。

更多说明见 [数据与权限](docs/隐私说明.md)。安全漏洞请通过 [SECURITY.md](SECURITY.md) 私密报告，公开 Issue 中不要粘贴凭据或私人原文。

## 开发与验证

需要 Node.js 22 或更新版本。

```sh
git clone https://github.com/ALVIN-YANG/chrome-translate.git
cd chrome-translate
npm ci
npm run check
npx playwright install --no-shell chromium
npm run test:browser
npm run package
```

`npm run check` 执行 Node 测试并构建 `dist/`。浏览器检查使用 Playwright 自带 Chromium，在隔离配置中加载实际 ZIP，覆盖翻译、复制、声音配置兼容、音频控制、严格 CSP、键盘和动态正文；只使用受控响应与本机测试音，不需要真实 Key。Linux 可加 `--with-deps` 安装浏览器依赖。

[GitHub Actions](https://github.com/ALVIN-YANG/chrome-translate/actions/workflows/check.yml) 检查 Node.js 22/24 和 Chromium。失败保留截图与 trace，构建包包含第三方许可证。ZIP 与 SHA-256 输出在 `output/release/`。受控检查不代表真实账号权限、翻译质量或人工听感验收，历史证据见 [验证记录](docs/验证记录.md)。

```sh
npm run dev
```

打开 `http://127.0.0.1:4173` 可预览独立页；划词和网页翻译需要加载真实扩展。网页预览中的 Key 只保留在当前页面内存，刷新即清除。

模型翻译与云端语音使用 [AI SDK](https://ai-sdk.dev/docs/introduction) 及其官方 provider，MiniMax TTS 使用 SpeechModelV4 适配器；微软与百度使用各自协议。定位使用 [Floating UI](https://floating-ui.com/)，图标使用 [Lucide](https://lucide.dev/)。

## 贡献与许可

源码和文档采用 [MIT License](LICENSE)，依赖保留各自许可证。服务商 API、账号与模型权限遵循各自条款。

[贡献指南](CONTRIBUTING.md) · [代码入口](docs/架构说明.md) · [发布说明](docs/发布说明.md) · [路线图](docs/路线图.md)
