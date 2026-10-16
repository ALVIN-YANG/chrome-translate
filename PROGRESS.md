# 项目目标与交付状态

当前目标：成为顶级开源项目。此目标仍在推进，不能由功能数量、文档或单次测试认定完成。

0.7.12 发布准备：按维护者要求，DeepSeek、Kimi、智谱、硅基流动和 Gemini 的模型翻译共用已有 AI SDK OpenAI Compatible provider，替代手写 HTTP 序列化和响应解码；微软和百度保留各自接口。没有新增依赖，保留短词词义、英文例句、专用翻译模板、取消、厂商结束原因及错误脱敏，不自动重试。控制器显式接收翻译函数，网页脚本不引入 SDK。87 项 Node 检查与构建、十七组隔离扩展场景共 171 项检查通过；新增默认回归入口复用原有免费服务场景。706,078 字节的 ZIP 与浏览器实际加载包一致，SHA-256 为 `03a3f094cac9f9fc05bf85332738a6fb3d7da22dfedec0956e9b96b44859ca7e`，Manifest、白名单、许可和测试凭据排除已检查。准备推送并等待远程 CI 后发布；未修改用户 Chrome。记录见 `docs/evidence/sdk-0.7.12.json`。

0.7.11：维护者认为悬浮入口仍丑，并选择小圆形图标。参考沉浸式翻译官方演示的紧凑圆形入口，沿用项目蓝色与现有 Lucide 图标：42px 文字方块改为 40px 圆形，常态弱化阴影，开启后显示蓝底“显示原文”图标；按下即时缩放，焦点与按下语义保留。只在开启状态改变时替换图标，避免逐段更新重复生成 SVG。87 项 Node 测试、十六组本机浏览器场景共 159 项检查通过；实际 ZIP 的十一种视觉状态已渲染核对，含窄窗口、深色页面、按下、焦点、恢复与错误提示。记录见 `docs/evidence/floating-button-0.7.11.json`。X 草稿已改为说明产品用途与制作原因，未发布；不再使用试用邀约文案。尚未增加拖动、贴边收起或悬停设置面板，产品完成度与广泛兼容性仍需继续改进。

[v0.7.11 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.11) 指向 `3e48fd1aec67ce3d320a7f6896fc323f5b95c261`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38860921527) 的 Node 22/24 与 Linux Chromium 全部通过，两平台十六组场景共 159 项检查一致。公开 ZIP 为 594,428 字节，SHA-256 `f5a97cb118a5325ecd3517dc26fc05cf7ffec0707c54a71c2d462b4906b3a39c`，与本机视觉检查及 Linux 产物逐字节一致。匿名下载、摘要、ZIP CRC、21 个白名单文件、Manifest、许可及测试凭据排除均已核对。用户日常 Chrome 安装未改动，需重新加载扩展并刷新网页；目标仍未完成。

0.7.10：公开 v0.7.9 安装包两次复现选中正文后按 Tab 进入输入框，旧划词条仍然显示。修复为网页焦点移出扩展控件时隐藏操作条；不关闭已有面板、不抢回焦点、不改写输入内容。原有键盘回归新增输入框、富文本编辑区与无额外请求三项检查，旧实现失败、修复后通过。87 项 Node 测试、十六组本机安装包浏览器场景共 159 项检查通过，原始复现脚本在新版 ZIP 上通过，见 `docs/evidence/selection-focus-0.7.10.json`。未增加权限、依赖或数据字段。X 试用邀请已在维护者账号的发帖框准备好，尚未获明确发布授权；未发送邀请，独立使用反馈仍缺证据。

[v0.7.10 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.10) 指向 `f378e90081843d6f31fafd834af9067edee45da6`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38858348286) 的 Node 22/24 与 Linux Chromium 全部通过，两平台十六组场景共 159 项检查一致。公开 ZIP 为 594,323 字节，SHA-256 `e5900f76154c7925c98c08b7e9aebc9aa2edc52199c0edb34ba7dec840977050`，与本机、Linux CI 和原始复现实际加载包一致。公开摘要、ZIP 完整性、Manifest、21 个白名单文件和 MIT 许可已核对；临时配置已清理。早先入口就绪超时与真实采用仍无新增结论，顶级开源目标未完成。

首次发布包文本路径验收：使用公开 v0.7.9 ZIP，在全新隔离 Chromium 中直接打开独立翻译页，确认默认微软服务和自动目标语言，初始不发送文本；输入 `Hello, world.` 后通过一次真实 HTTP 200 请求显示“你好，世界。”。存储无 Key，请求无 Authorization/Cookie，无其他服务请求，临时配置已清理。公开资产摘要已再次吻合，记录见 `docs/evidence/first-use-0.7.9.json`。这验证了隔离环境中的发布包首次流程，不代表用户日常 Chrome 已安装或独立试用。全量 Issue/PR 与贡献者核对仍未取得外部试用或独立贡献证据；对外邀请尚需维护者指定对象/渠道并明确授权。

首次使用与反馈入口：中文 README 的安装说明从功能/模型介绍之后移到首个章节，首屏说明默认微软翻译与系统朗读无需 Key；中英文增加同一个首次任务和使用体验入口。新增 `usage.yml` 表单，收集环境、实际结果、是否已再次使用和任务体验，仅任务描述必填。GitHub 实际渲染会在未设默认值时显示第一项，已改为明确默认“未说明”，不默认记作成功或再次使用，不收联系方式。YAML 结构、文档链接、安装锚点与既有图片保留检查通过；无 Key 的真实微软请求将 `Hello, world.` 返回为“你好，世界。”。这只证明该接口样本，不等于用户安装。运行时与安装包继续使用 v0.7.9；没有代填 Issue、外发邀请或新增遥测，真实采用及独立贡献仍待证据。

GitHub 的模板选择页与实际表单已核对：使用体验入口可见，结果与使用情况均默认“未说明”，仅任务描述必填；验证过程未提交 Issue。首次安装说明也补齐从 Chrome 扩展程序菜单打开/固定插件，以及刷新已有普通网页后启用划词或双语的步骤。

0.7.9 已交付：真实扩展两次复现切换 DeepSeek→OpenAI 后，安全设置快照与实际请求已使用 OpenAI，面板顶部及输入区却仍显示 DeepSeek。现同步现有聊天实例的公开配置、名称与配置状态，保留草稿和旧回答的服务标签；恢复配置时清理过期错误，仍不自动提问。87 项 Node 测试、十六组 macOS/Linux 浏览器场景共 156 项检查通过，新增十项覆盖真实设置页、两家 SDK 接口、清空/补回 Key 与前端连接计数。证据见 `docs/evidence/model-switch-0.7.9.json`。无新增权限、依赖或消息/存储字段；本轮未取得新增真实采用或独立贡献证据。

[v0.7.9 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.9) 指向 `5372244609327d1cab2684b4aaedb75bec91acd1`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38854110461) 的 Node 22/24 与 Chromium 检查全部通过。ZIP 与摘要匿名下载均 HTTP 200；ZIP 为 594,314 字节，SHA-256 `cad9b3478ff75aec70500f1145b5c0a78e79391aa940c3ed173e987e2d10382c`，与本机、Linux CI 和浏览器实际加载包一致。Manifest、MIT/第三方许可、ZIP 完整性、白名单文件和测试凭据排除已核对，临时配置已清理。真实网页/长文继续引用 v0.7.7，偶发入口超时仍未归因，顶级开源目标继续推进。

0.7.8 已交付：真实扩展三次复现修改语速会取消等待中的 AI 回答；不修改配置直接保存的对照保持请求运行，公开模型配置也未变化。现仅在 LLM 公开配置变化时取消对话，朗读偏好变化保留回答、对话和草稿。87 项 Node 测试、十五组 macOS/Linux 浏览器场景共 146 项检查通过，新增十项覆盖真实设置页、跨场景草稿、后续上下文、模型变化取消和迟到隔离；不新增权限、依赖或消息/存储字段。证据见 `docs/evidence/preferences-0.7.8.json`。本轮未取得新增真实采用或独立贡献证据。

[v0.7.8 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.8) 指向 `ab8701d5e9883b5b6707f479b1936476dc5211c3`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38852838364) 的 Node 22/24 与 Chromium 检查全部通过。ZIP 与摘要匿名下载均 HTTP 200；ZIP 为 594,267 字节，SHA-256 `8968df79f5c28846bc4a53b2ce1927de423b561e1040c0fd2d50c6fcb444ee79`，与本机、Linux CI 和浏览器实际加载包一致。Manifest、MIT/第三方许可、ZIP 完整性及测试凭据排除已核对，临时配置已清理。真实网页与长文仍引用 v0.7.7 证据；偶发入口超时仍未归因，顶级开源目标继续推进。

0.7.7 已交付：真实扩展连续两次复现慢请求后面的排队正文已删除、替换、隐藏或标为不翻译，却仍发送旧文本。现于 DOM 变更到达时撤下对应待发送分块，包含父容器排除和整棵子树移除；扫描对账再次清理。已有请求不撤回，稳定后的正文可重新排队。87 项 Node 测试、十四组 macOS/Linux 浏览器场景共 136 项检查、2,000 段长文及 MDN/Python 实测通过。新场景同时覆盖等待扫描完成和直接释放响应，后者在两平台实测均于下一次扫描前撤下旧内容。证据见 `docs/evidence/pending-0.7.7.json`。本次核查公开仓库无开放 Issue/PR，Star/Fork 均为 0；真实采用和社区贡献仍未取得证据。

[v0.7.7 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.7) 指向 `5baba43993941dab63fbe6a46274ad896c4a8af2`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38851458220) 的 Node 22/24 与 Chromium 检查全部通过。ZIP 与摘要匿名下载均 HTTP 200；ZIP 为 594,253 字节，SHA-256 `e809fa25f4840d9fed23d0baffc7e11b0edc263209206785e6458b9f84c5b2c2`，与本机、Linux CI 和浏览器实际加载包一致。Manifest、MIT/第三方许可和 ZIP 完整性已核对，临时浏览器配置已清理；偶发入口超时仍未归因，顶级开源目标继续推进。

0.7.6 已交付：真实扩展复现导航时钟、正文数字计数器和同页流式文字持续更新时，稳定新段落超过 1.2 秒没有发出请求，只有其他更新停止后才翻译。修复为按正文块分别等待稳定、批量扫描；变动中的块延后排队，停止时清理待处理状态。86 项 Node 测试、十三组 macOS/Linux 浏览器场景共 122 项检查、2,000 段合成样本和 MDN/Python 实测通过；正常包长文三组首次显示约 155/239/131ms，临时插桩未进入安装包。性能记录仅为本机样本，不代表所有网站。证据见 `docs/evidence/updates-0.7.6.json`。

[v0.7.6 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.6) 指向 `28ea5a4c15684862373bdee22fe58378ad9dee1b`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38850237407) 的 Node 22/24 与 Chromium 检查全部通过。ZIP 与摘要匿名公开下载均 HTTP 200；ZIP 为 594,130 字节，SHA-256 `9c904365709b85c2c573beace2bfd952659aec2464b7f7db9bff50e680f767e5`，与本机、Linux CI 和浏览器实际加载包一致。Manifest、MIT/第三方许可及 ZIP 完整性已核对，临时测试配置已清理。偶发入口超时及外部采用仍无新增结论，顶级开源目标继续推进。

0.7.5 已交付：真实扩展复现单页网站切换查询参数并替换文章后，未重新开启就额外发送新正文；仅处理路径的中间修复还漏掉哈希路由。最终以原生导航条目变化统一停止与清理，保留普通锚点、同 URL 状态更新及已授权的同页动态内容。86 项 Node 测试、十二组 macOS/Linux 安装包场景共 115 项检查和 MDN/Python 实测通过，覆盖路径、查询参数、哈希路由、前进后退、重新开启和划词浮层关闭。证据见 `docs/evidence/navigation-0.7.5.json`。早先偶发入口就绪超时仍未归因。

[v0.7.5 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.5) 指向 `385b089c554b076aeedd779f41a33ce99d1f8071`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38847047022) 的 Node 22/24 与 Chromium 检查全部通过。ZIP 和摘要匿名公开下载均 HTTP 200；ZIP 为 593,891 字节、SHA-256 `7f0fffd71219d824cd08711de5b1cbe240cc59385740b098b060e28f294c805b`，与本机、Linux CI 及浏览器实际加载包一致。Manifest、MIT/第三方许可、ZIP 完整性已核对，临时测试配置已清理。本阶段交付仍不代表顶级开源目标达成。

0.7.4 已交付：真实扩展复现快速同时修改目标语言和按钮开关时丢更新；两个设置页分别修改 Key/模型时，旧页面保存还会清空另一页的新 Key、还原模型与全局服务。修复为增量字段保存，并以同源 Web Lock 协调扩展页和后台的读取、合并与写入。保存凭据保留当前翻译标签页服务；存储格式、权限和依赖不变。86 项 Node 测试、十一组 macOS/Linux 安装包场景共 104 项检查、MDN/Python 的真实正文与滚动检查通过。证据见 `docs/evidence/settings-0.7.4.json`。早先入口就绪超时仍未归因。

[v0.7.4 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.4) 指向 `ff304eb928f9ab7eefa630b8965142806b52227c`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38845132321) 的 Node 22/24 与 Chromium 检查全部通过。ZIP 和摘要匿名公开下载均 HTTP 200；ZIP 为 593,617 字节、SHA-256 `542eddb0c78ba92a19cde80bd040c5a7003ebd737a16cf17befcef90a65ba3a5`，与本机、Linux CI 及浏览器实际加载包一致。Manifest、MIT/第三方许可、ZIP 完整性已核对，临时测试配置已清理。本阶段交付不代表顶级开源目标达成，仍需真实采用与独立社区贡献证据。

本轮补强正文验证工具：已用真实扩展复现“只有标题译文仍能通过”的漏检，新增负例拒绝该情况；正例还排除兼容性控件说明并模拟正文译文出现后上方内容增高。MDN 实测确认原节点和中文译文都存在时，新增排版可把所测译文推离视口；验证器改为等该段译文生成后重新定位，再检查实际可见。83 项 Node 测试、十组本机浏览器场景共 98 项检查通过；MDN/Python 的首屏与远处正文、原文/代码和关闭恢复均通过真实微软检查。此轮不改变运行时代码或安装包，仍使用 v0.7.3，SHA-256 与公开包一致；早先入口就绪超时仍未归因。记录见 `docs/evidence/article-validation-0.7.3.json`。

[本轮 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38843565132) 对提交 `9e1b9ae6c77dcb5eae217426c2b1a2ab3082c3af` 的 Node 22/24 与 Linux Chromium 检查全部通过；Linux 十组场景共 98 项检查、正文验证器七项边界均通过。Linux 产物与本机及公开 v0.7.3 ZIP 逐字节相同；临时配置与测试浏览器已清理。这里只完成验证可靠性的阶段改进，仍缺真实采用与独立贡献的证据。

0.7.3 已交付：修复划词浮层关闭后焦点退回 body、场景按钮缺少正确按下状态的问题。普通段落使用临时 `tabindex=-1`，焦点离开后清理；保留网页已有属性。Esc、关闭按钮、Tab 继续操作、外部点击和外部键盘焦点均已验证，场景切换不额外调用模型。83 项 Node 测试、macOS/Linux 九组 ZIP 浏览器场景共 91 项检查及 GitHub Node 22/24 检查通过。四个新配置的公共网页启动探针通过且未发翻译请求；启动波动仍未确认根因，未改动启动逻辑。证据见 `docs/evidence/keyboard-0.7.3.json`，不等于人工读屏或用户安装验收。

[v0.7.3 Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.3) 指向 `2de16554ccdedca5f01882ec20519159179d13fc`，[发布前 CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38840960510) 全部通过。ZIP 和摘要文件的匿名公开下载均 HTTP 200；ZIP 为 593,426 字节、SHA-256 `291bee81fe7c5393ce335448fcf93308f2c20b9007b8f21738019afdab6278c3`，与本机、Linux CI 和浏览器实际加载的包一致。MIT、第三方许可、Manifest 和 ZIP 完整性已核对，临时测试目录已清理。本阶段完成不代表“顶级开源项目”目标已达成。

产品核心用户的偏好已向维护者询问，尚未收到回答，当前仍按已有技术阅读用例推进独立修复。

0.7.2 已交付修复：网页换行拼词、同文重绘后译文不恢复，以及连续 DOM 冲突的恢复上限和主动重试。83 项 Node 测试及七组 ZIP 安装包回归通过；MDN 与 Python 官方文档分别完成真实微软、原段落/代码和关闭恢复验证。联网整组仍有就绪/等待超时波动，未宣称修复该问题；后续需继续定位。

0.7.2 已完成交付：[GitHub CI](https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38772350281) 的 Node 22/24 与七组 Chromium 回归通过；[Release](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.2) 指向 `c3fc46c5165fa512fa2fd224caf127bcc3862e88`。ZIP 和摘要的公开下载均 HTTP 200，ZIP 为 593,193 字节、SHA-256 `376f08eb9b92ddb5a1392d09edf44432551281726357b9f5cb40201cd3aa8531`，与 macOS、Linux CI 及浏览器实际加载包相同。测试临时配置和浏览器均已清理。证据为 `docs/evidence/compatibility-0.7.2.json`；这只是当前阶段交付，不代表“顶级开源项目”目标达成。

2026-10-15，本轮优先补齐许可、可复现回归、打包和贡献流程。维护者已明确选择 MIT；仓库、包元数据和安装包同步采用该许可，第三方许可单独保留。GitHub 私密漏洞报告已启用。

本轮已完成：无真实 Key 的五组隔离 Chromium MV3 回归、本机随机端口和生成测试音；构建清理旧文件与核对版本；白名单 ZIP 和 SHA-256；中英文入口、贡献指南、问题/PR 模板、隐私/安全说明、架构入口及发布说明。81 项 Node 测试、五组本机 Chromium 回归及构建通过；浏览器加载实际 ZIP 的解压结果。安装包完整性、旧文件清理和两次干净构建的摘要一致性通过；最终 GitHub Node 22/24 与 Linux Chromium CI 全部通过，其 ZIP 与 macOS 产物逐字节相同。

[v0.7.1 已公开发布](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.1)，指向 `81a41537cf9948e2ac4af9539392977c9a29edf4`。ZIP 与摘要文件均通过未认证公开下载 HTTP 200 验证；ZIP 为 592,865 字节，SHA-256 为 `c48ec7a10a99071ce2c2c199f4a2ce6985f3c0a42e7c076455fd0d8fb2ebe5ef`，与本机、CI 构建及浏览器实际加载的包一致。最终 CI：https://github.com/ALVIN-YANG/chrome-translate/actions/runs/38766164423。证据保存在 `docs/evidence/opensource-0.7.1.json`。

下一阶段仍需真实用户安装与长期使用反馈、持续兼容性验证和独立社区贡献。不要制造使用量、评价或推广消息，也不要为完成目标自行缩小“顶级开源项目”的含义。

## v0.7.0 已完成交付

此前目标：参考用户附图，将划词操作条做成“翻译、朗读、问问 AI”；用户可自定义主流 LLM/TTS 的 Key、地址、模型和音色，优先 MiniMax TTS/LLM 与 DeepSeek LLM。UI 使用现代图标和紧凑浮层，保留原有网页双语、独立翻译、多义词、例句、复制。

用户已授权实现，并提供本机已有的 MiniMax 凭据用于实测。凭据来源目录只读，不执行里面的脚本、构建或部署。Key 不进入源码、文档、安装包或命令输出。此项目可正常构建、测试。不要通过受限的 `chrome://extensions` 或其他途径绕过用户 Chrome 安装边界；测试使用专用 Chromium 配置。

## 已实施

- 独立 `selection-services-v1` 配置，11 个 LLM 预设与 6 个 TTS 预设；MiniMax 两项复用 Key，DeepSeek 等可沿用已有翻译 Key；自定义 OpenAI/Anthropic/Gemini 协议及 OpenAI/MiniMax/ElevenLabs 语音协议。
- 使用 AI SDK 7、官方兼容/Anthropic/Gemini/OpenAI/ElevenLabs provider。MiniMax SpeechModelV4 适配器；禁止自动重试和供应商 fallback。
- Lucide 图标、Floating UI 定位；三按钮划词操作条、AI 连续对话、Markdown 安全渲染、模型与声音设置页。
- offscreen Blob 音频播放器：取消隔离、最多预取下一段、暂停恢复、音频 URL 释放；独立翻译页也使用所选 TTS。系统声音默认可直接使用，MiniMax 位于云服务首选。
- Key 始终只在可信扩展上下文读取；内容脚本只见服务名称、是否配置及语速；普通网页只能发起受限文字操作。

## 已取得证据

- 真实 MiniMax M2.7 Anthropic SDK 回答成功。
- 真实 speech-2.8-turbo 生成中文 MP3，50,100 字节；结果在忽略的 `output/minimax-assistant-live.json` 与 `output/minimax-voice.mp3`。
- 官方账号音色查询：中文 ID 使用 `Chinese (Mandarin)_Gentleman`；旧猜测 `Chinese_CalmWoman` 返回 2054，已纠正。英文 `English_Trustworthy_Man` 存在。
- 78 项 Node 测试及构建通过（`output/assistant-check.log`）。包括真实 SDK 的 OpenAI/Anthropic/Gemini SSE、三类 TTS 请求、鉴权/截断安全错误、配置和 URL 限制、音频预取/取消/暂停。
- 真实 Chromium 中三按钮、AI 空态及后续完整交互与云音频播放均已验证，最终证据见下方验收状态。

## 验收状态

- 新功能受控浏览器验证通过：三入口、模型对话、多轮、取消、错误、Markdown、伪造提交防护、复制、语音实际播放/暂停/恢复/停止、配置保存与重载、320px/390px。
- MiniMax 已在真实扩展中完成真实 LLM 调用与真实 TTS 生成播放，媒体事件依次为 loading、speaking、paused、speaking、idle。没有人工听感评分。
- 原有独立页六组回归通过；网页双语、真实微软和真实 MDN 文档回归通过。
- 78 项 Node 测试及构建通过，依赖许可证已汇入构建包；临时凭据文件已删除，测试配置的真实凭据已清除。
- 证据已汇总到 docs/evidence/browser-0.7.0.json；生成包通过真实 Key 排除扫描；v0.7.0 已发布，公开下载 HTTP 200、字节数和 SHA-256 与本机构建一致。Node.js 22/24 的 GitHub Actions 全部通过。设置页测试连接与声音试听也已通过真实扩展验证。用户 Chrome 的安装/更新仍需手动重新加载，本机测试不代表用户已经安装。
