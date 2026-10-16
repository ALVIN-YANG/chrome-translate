# Chrome Translate · 翻译

简体中文 · [English](README.en.md)

[![自动检查](https://img.shields.io/github/actions/workflow/status/ALVIN-YANG/chrome-translate/check.yml?branch=main&label=check)](https://github.com/ALVIN-YANG/chrome-translate/actions/workflows/check.yml)
[![最新版本](https://img.shields.io/github/v/release/ALVIN-YANG/chrome-translate)](https://github.com/ALVIN-YANG/chrome-translate/releases/latest)
[![MIT 许可证](https://img.shields.io/github/license/ALVIN-YANG/chrome-translate)](LICENSE)

划词后直接 **翻译、朗读原文或问问 AI** 的 Chrome 扩展。保留网页双语和独立文本翻译，支持 **15 种翻译语言**；模型、语音、Key 和接口可以自己选择。

**[下载最新插件包](https://github.com/ALVIN-YANG/chrome-translate/releases/latest)** · [安装](#安装) · [翻译服务](#翻译服务) · [参与贡献](CONTRIBUTING.md) · [反馈问题](https://github.com/ALVIN-YANG/chrome-translate/issues/new/choose)

## 划词后的三个入口

选中文字后，附近出现一条紧凑的操作条：**翻译｜朗读｜问问 AI**。只选中文字不会调用模型或语音服务。

- **翻译**：使用现有翻译服务，中文默认译英文，其他语言译中文。保留多义词、语境、例句、原生选中、复制和朗读。
- **朗读**：直接读所选原文；左下角播放条可暂停、继续和停止，Esc 也能停止。换选区取消旧朗读，长文字分段并只预取下一段。
- **问问 AI**：围绕所选内容提问，可解释、总结、润色或连续追问。回答流式显示，支持安全的 Markdown、复制和朗读；停止生成或关闭面板后，迟到的内容不再插入。对话只放在当前页面内存，关闭后清除；最多 7 轮，总文字过长时会提示重新开始。

工具栏或独立页里的 **「模型与声音」** 打开配置页。模型与语音独立选择，不改变原有翻译服务的选择；可修改 API Key、基础地址、模型、音色 ID、语速和回答偏好。MiniMax 模型与声音可共用一个 Key；DeepSeek、Gemini、智谱、硅基流动、Kimi 可沿用已有翻译 Key，也可单独填写。

LLM 预设包括 **MiniMax、DeepSeek、OpenAI、Claude、Gemini、智谱、通义千问、硅基流动、Kimi Coding Plan、Ollama**，另支持自定义 OpenAI Chat Completions、Anthropic Messages 和 Google Gemini 接口。MiniMax 默认 `MiniMax-M2.7`，使用 Anthropic 兼容协议；DeepSeek 默认 `deepseek-flash`。模型名与地址均可修改。

TTS 预设包括 **系统声音、MiniMax、OpenAI、ElevenLabs、硅基流动**，另支持自定义 OpenAI Audio Speech、MiniMax 和 ElevenLabs 协议。默认系统声音无需 Key；优先适配的 MiniMax 使用 `speech-2.8-turbo`，音色留空时按中英文选择已验证的系统音色，也可填平台自己的音色 ID。用户已有的克隆音色可通过 ID 使用，本插件不创建克隆音色。

自定义地址必须使用 HTTPS；Ollama 等本机服务可以用 `localhost`、`127.0.0.1` 或 `::1` 的 HTTP 地址。填基础地址即可，插件补全 API 路径；地址不能包含账户、查询参数或片段。服务费用、额度、地区和模型权限由对应账号决定，失败不自动换服务或重试。

[![实际划词操作条：翻译、朗读、问问 AI](docs/assets/selection-toolbar.png)](docs/assets/selection-toolbar.png)

[![MiniMax 在真实扩展中的回答](docs/assets/selection-ai.png)](docs/assets/selection-ai.png)

新功能基于 [AI SDK](https://ai-sdk.dev/docs/introduction) 及其官方 provider，MiniMax TTS 使用 SpeechModelV4 适配器；定位与图标使用 [Floating UI](https://floating-ui.com/) 和 [Lucide](https://lucide.dev/)。Markdown 使用 Marked 与 DOMPurify，禁用模型返回的图片、脚本和嵌入内容。依赖许可证保留在构建包的 `THIRD_PARTY_LICENSES.txt`。

## 网页双语与划词

点击工具栏图标，在菜单里选择 **「翻译当前网页」**，译文会显示在原文下方。也可以点击网页右侧的 **「译」**、使用右键菜单，或按 **Alt+A**。再次点击或按相同快捷键，恢复原文。开启方式参考[沉浸式翻译的使用文档](https://immersivetranslate.com/zh-Hans/docs/usage/)，本项目与该产品没有关联。

默认优先处理文章、正文区域，跳过导航和侧栏；先翻译视口附近的段落，滚动时继续，动态增加或修改的文字也会处理。需要扩大范围时，在工具栏选择 **「翻译整个页面」**，或按 **Alt+W**。整页模式仍跳过代码块、独立代码、表单、输入框、可编辑区域及标记为不翻译的内容。链接、原有格式和点击事件保留。

正文换行保留单词分界，内联格式不会拆散单词。网站重绘移除译文时，会从已完成结果恢复，不额外调用翻译服务；如果网站持续删除译文，页面会暂停并提供「重试」，避免反复插入。

动态变更按正文块分别等待稳定，其他位置的时钟、计数器或流式内容不会让稳定新段落一直等待。同一块仍在持续变化时暂缓请求，稳定后再处理；不使用固定间隔全页轮询来维持响应。

选中文字后，附近会出现 **「翻译｜朗读｜问问 AI」** 操作条，点击「翻译」打开译文浮层；也可右键选择 **「翻译选中文字」**。中文自动译英文，其他语言译中文。短词展示不同译法与语境，句段展示一份译文；每项译文可复制或朗读，例句带小喇叭。按 **Esc** 或点击浮层外关闭。仅选中文字不会发送翻译请求。

工具栏可选择服务、网页目标语言，以及开关划词按钮、网页右侧按钮。默认网页译为中文；更改服务或目标语言会恢复原文，需要再次主动开启翻译，不会自动把已打开的网页转发给另一家服务。刷新或跳转到新网页后，需要重新开启；当前页面的译文缓存只放在内存中，关闭后再次开启可复用。

单页网站切换路径、查询参数或非锚点哈希路由时，也会停止翻译、清理旧页面缓存并关闭划词浮层，等待再次主动开启。前进和后退同样处理。跳转到当前文档已有的目录锚点、或只修改同 URL 的历史状态时保留翻译；同 URL 内的动态正文仍会继续处理。

快捷键与其他扩展冲突时，可在 `chrome://extensions/shortcuts` 修改。macOS 的 Alt 对应 Option。此版本支持普通 HTTP/HTTPS 网页的文本；不包含 PDF、图片、视频字幕翻译，也不读取子框架或网站的 Shadow DOM。浏览器内置页、Chrome 插件市场和本地文件不能注入，工具栏会给出提示。

[![真实微软接口：英文正文下显示中文，保留代码和输入框](docs/assets/webpage.png)](docs/assets/webpage.png)

[![真实划词翻译：回溯的算法词义、例句、复制及朗读](docs/assets/selection.png)](docs/assets/selection.png)

## 独立文本翻译

[![Chrome Translate 实际界面：输入回溯，查看算法名词 backtracking、动词 backtrack 及例句朗读按钮](docs/assets/preview.png)](docs/assets/preview.png)

*截图来自实际运行的 v0.5.0，使用微软翻译和必应词典；点击图片可查看大图。*

- **翻译文本**：原文自动识别，词语与句段自动判断。默认中文译英文，其他语言译中文，也可以指定目标语言。
- **分清词义**：例如「回溯」可参考算法名词 `backtracking`、动词 `backtrack`，以及追溯来源的 `trace back`。词义按同一层级展示，有语境的候选优先；默认译法不再占据独立大标题。
- **听译文和例句**：译文、候选词、例句都能单独朗读。英文例句使用英文声音，翻译成中文后也一样。
- **直接复制**：结果是可选中的普通文本；每个词义可单独复制，多义词还可一键复制全部译法。完整句段可一次复制全文。

结果使用无框的连续阅读布局，长内容随页面展开。输入变化后立即翻译，中文输入法选字期间不发请求；新输入会取消旧请求，迟到的结果不会覆盖当前内容。更新或失败时保留上次结果，并标明旧结果的语言和状态，仍可选中、复制或朗读；新结果完成后一次替换。

工具栏菜单里的「打开独立翻译页」会优先激活已经打开的翻译页。当前标签页会暂存原文、服务选择、目标语言和已有结果，刷新可恢复；匹配的结果不重复请求接口。清空后有 8 秒可以点击「撤销清空」。

## 安装

适用于 **Chrome 120 或更新版本**。安装 Release 插件包不需要 Node.js，也不需要注册开发者账号。

1. 在 [Releases](https://github.com/ALVIN-YANG/chrome-translate/releases/latest) 下载 **`translate-chrome-*.zip`**。
2. 将安装包解压到一个固定文件夹。
3. 打开 `chrome://extensions`，开启右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择**直接包含 `manifest.json` 的那个文件夹**。
5. 点击工具栏里的「翻译 · 多语言」图标，选择「翻译当前网页」，或选择「打开独立翻译页」后粘贴文本。默认使用微软翻译，无需填写 Key。

> 「Code → Download ZIP」下载的是源码，需先构建。安装请使用 Releases 中的 `translate-chrome-*.zip`，不要选 `Source code`。

更新时，用新版安装包替换原文件夹内容，在扩展管理页面点击「重新加载」，再刷新翻译页及需要翻译的网页，使新版网页脚本生效。加载后保留该文件夹，避免移动或删除它。

## 翻译服务

在右上角「设置」填写凭据，可用「测试连接」检查配置。七个服务手动切换，失败时不会自动把文本转发给另一个服务。

| 服务 | 需要配置 | 提供什么 |
| --- | --- | --- |
| 微软翻译 | 无需 Key | 即时文本翻译；中英短词可补充必应词义 |
| 百度翻译 | APP ID、密钥 | 官方通用文本翻译，返回主译文 |
| 智谱 | 普通 API Key | 免费模型 `glm-4.7-flash`；文本翻译、词义候选及例句 |
| 硅基流动 | API Key | 免费模型 `tencent/Hunyuan-MT-7B`；专门翻译文本，返回主译文 |
| Gemini | Google AI Studio Key | `gemini-3.1-flash-lite` 有免费层；文本翻译、词义候选及例句 |
| DeepSeek | API Key、模型 | 文本翻译；短词可返回不同译法、语境及例句 |
| Kimi Coding Plan | Coding Plan Key、模型 | 文本翻译与词义候选；仅接入 Coding Plan |

DeepSeek 当前默认模型为 `deepseek-flash`，Kimi 当前默认模型为 `kimi-for-coding`，均可在设置中修改。服务额度、费用和账号权限由对应服务商决定，仓库与安装包不包含任何真实 Key。

新增的智谱、硅基流动、Gemini 固定使用表中模型，只需填写 Key。「免费模型」仍需注册账号，且可能限流；Gemini 免费层有地区与配额限制，付费项目使用同一模型可能收费。Gemini 免费层的内容可能用于改进 Google 产品，请勿输入敏感文本。免费政策核查于 2026-10-09，后续以厂商为准。选型依据、申请入口和来源见 [免费模型说明](docs/免费模型说明.md)。

微软使用 Edge 的免 Key 翻译接口，接口可能限流或变更，未公开承诺第三方使用的长期稳定性。Kimi Code 官方面向个人编程场景，通用翻译用途与账号许可是否匹配需按服务商规则确认；遇到权限拒绝会直接提示，不伪装客户端。

## 支持的语言

中文、英语、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、意大利语、阿拉伯语、印地语、泰语、越南语、印尼语。

原文始终由所选服务自动识别，只保留目标语言选择。短文本可能有歧义，可指定目标语言或补充上下文。阿拉伯语结果支持从右向左阅读。

## 词义与朗读

微软的额外词义来自必应中英词典，少量算法术语另有带来源的用法补充。其他语言不会混入中英词典结果；智谱、Gemini、DeepSeek、Kimi 的候选由模型生成，百度和硅基流动的混元翻译只返回主译文。完整句段通常显示一份译文，没有可靠候选时不强行凑数。

例句优先使用目标语言，中文释义另起一行；纯中文内容不会被当作英文例句展示。短词自动判断和模型输出都可能不准确，使用时结合上下文。

默认朗读使用设备已安装的系统声音，无需额外 Key；选择云端 TTS 后，译文和例句也使用该服务。点击小喇叭开始，再点停止；修改输入、切换服务或清空时停止旧朗读。**支持某种翻译语言，不代表设备已安装对应声音**，缺少声音时会提示，复制仍可使用。

## 数据与权限

完整数据流、保存位置与权限用途见 [隐私说明](docs/隐私说明.md)。安全漏洞请通过 [私密报告流程](SECURITY.md) 提交，不在公开 Issue 中粘贴凭据或私人原文。

- 原文发送给当前选择的翻译服务；微软中英短词查询还会访问必应词典。网页只有主动开启翻译后才发送待翻译段落，划词只有点击翻译按钮或右键翻译时才发送选中文字；不会把网页 URL、Cookie 或整份 HTML 发送给翻译服务。
- Key 和服务偏好保存在 `chrome.storage.local`，不通过浏览器同步到云端。存储仅允许扩展可信上下文读取，网页内容脚本只收到服务是否已配置及非敏感偏好，不能读取 Key；LLM 请求由后台发送，TTS 合成与播放在可信 offscreen 文档中进行，避免网页 CSP 阻止音频。
- 当前标签页的原文、服务选择、目标语言及结果暂存于 `sessionStorage`，不包含 Key，也不建立历史记录；会话由浏览器管理，浏览器的恢复标签页功能可能恢复该会话。
- 没有自建中转后端、统计 SDK 或远程脚本；各服务请求通过 HTTPS 发送。网页译文使用纯文本和隔离样式插入，不执行服务返回的 HTML。
- 请求本地存储、右键菜单、offscreen，以及普通 HTTP/HTTPS 网页的访问权限。网页权限用于显示划词按钮、读取待翻译文本和插入双语译文，也覆盖翻译服务的 HTTPS 请求；不请求 `tabs`、剪贴板读取或麦克风权限。系统朗读只选择设备本地声音；云端 TTS 则向所选服务发送待朗读文字。

源码可查看各项数据处理逻辑：[网页提取](src/page-segments.js)、[双语翻译](src/page-translation.js)、[后台消息与凭据](src/background.js)、[配置保存](src/settings.js)、[翻译请求](src/providers.js)、[词典查询](src/dictionary.js)、[系统朗读](src/speech.js)。

## 开发

需要 Node.js 22 或更新版本。

```sh
git clone https://github.com/ALVIN-YANG/chrome-translate.git
cd chrome-translate
npm ci
npm run check
```

检查通过后，将生成的 `dist/` 文件夹加载到 Chrome。

主分支更新和 Pull Request 会在 [GitHub Actions](https://github.com/ALVIN-YANG/chrome-translate/actions/workflows/check.yml) 检查 Node.js 22/24，以及隔离的真实 Chromium 扩展。浏览器检查使用受控供应商响应和本机测试音，无需真实 Key；失败保留截图和 trace。`translate-chrome-ci` 包含 ZIP 与 SHA-256，`browser-evidence` 保存浏览器证据，均保留 7 天；日常安装仍使用 Release。

```sh
npx playwright install --no-shell chromium
npm run test:browser
npm run package
```

浏览器测试加载实际 ZIP 解压后的扩展，覆盖独立页、网页双语、划词 AI、音频与严格 CSP；每组配置独立创建并清理。Linux 首次安装 Chromium 可加 `--with-deps`。打包输出位于 `output/release/`，清理旧构建、核对版本、按白名单打包，并生成校验摘要。详见 [贡献指南](CONTRIBUTING.md)、[代码入口](docs/架构说明.md) 和 [发布说明](docs/发布说明.md)。

```sh
npm run dev
```

打开 `http://127.0.0.1:4173` 预览界面。网页双语与划词功能需在已加载的真实扩展中使用，网页预览只展示独立文本翻译页。网页预览里的 Key 仅保留在当前页面，刷新即清除；本机 `/api/dictionary` 只解决预览时的词典跨域访问，安装后的扩展直接访问服务。

| 目录 | 内容 |
| --- | --- |
| `src/` | 独立页、工具栏、网页脚本、后台、翻译服务与朗读 |
| `public/` | Manifest、标签页复用模块、图标 |
| `tests/` | 语言、请求、并发与语音测试 |
| `scripts/` | 构建、预览及浏览器验证 |
| `docs/` | 使用截图与验证记录 |

[v0.7.6](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.6) 修复其他区域持续更新时，新正文一直等不到翻译的问题。86 项 Node 测试、十三组 macOS/Linux Chromium 安装包场景共 122 项检查及 GitHub Node 22/24 检查通过；另通过本机 2,000 段合成长文及 MDN/Python 实测。公开下载包与两平台产物逐字节一致，详见 [本版验证数据](docs/evidence/updates-0.7.6.json)。长文耗时是本机样本记录，不是所有网站的性能保证；自动检查也不等于用户安装或人工读屏验收。页面跳转边界见 [v0.7.5 验证](docs/evidence/navigation-0.7.5.json)，配置保存见 [v0.7.4 验证](docs/evidence/settings-0.7.4.json)。

当前版本的 MDN/Python 真实网络检查覆盖首屏正文、远处段落滚动加载、原文与代码保留、关闭恢复。验证工具排除标题和兼容性控件误判，并覆盖译文加载后的排版位移，设计与反例见 [正文验证数据](docs/evidence/article-validation-0.7.3.json)。划词键盘焦点与场景按钮见 [v0.7.3 验证](docs/evidence/keyboard-0.7.3.json)。联网整组曾出现就绪/等待超时，本轮仍未复现早先入口故障，尚未确认根因。

MiniMax LLM/TTS 的真实回答、音频播放和暂停恢复证据来自 v0.7.0；微软 15 种目标语言的真实接口证据来自 v0.3.0。其他服务由 SDK/协议及受控响应覆盖，真实账号权限与翻译质量需自行测试，不能把这些证据混用。历史过程见 [验证记录](docs/验证记录.md)。

单次上限为 10,000 个字符，百度另有 6,000 字节限制。即时调用可能计入服务额度，取消浏览器请求不保证服务端停止处理或计费。

第三方运行时依赖的许可证保留在构建包中。该项目不建立翻译历史，也没有账号系统。网页范围识别采用通用规则，特殊布局可尝试整页模式；服务失败会暂停当前页，保留已完成的译文，由用户主动重试，不自动换服务。

## 贡献与许可

欢迎中文或英文 Issue 和 Pull Request，见 [贡献指南](CONTRIBUTING.md)。优先处理真实安装与使用问题，后续方向及验收依据见 [路线图](docs/路线图.md)。界面目前为中文，英文文档不代表已经完成界面本地化。

项目源码与文档采用 [MIT 许可证](LICENSE)。第三方依赖保留各自许可，构建包同时包含 `LICENSE` 和 `THIRD_PARTY_LICENSES.txt`；服务商接口、账号和模型权限仍以对应条款为准。

## 参考

[必应词典](https://cn.bing.com/dict/) · [NIST：backtracking](https://xlinux.nist.gov/dads/HTML/backtrack.html) · [百度翻译 API](https://fanyi-api.baidu.com/doc_bd/21) · [DeepSeek 文档](https://api-docs.deepseek.com/) · [Kimi Code 使用范围](https://www.kimi.com/help/kimi-code/benefits)
