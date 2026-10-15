# 项目目标与交付状态

当前目标：成为顶级开源项目。此目标仍在推进，不能由功能数量、文档或单次测试认定完成。

0.7.2 当前进展：已复现并修复网页换行拼词、同文重绘后译文不恢复；补上连续 DOM 冲突的恢复上限和主动重试。83 项 Node 测试及七组 ZIP 安装包回归通过；MDN 与 Python 官方文档分别完成真实微软、原段落/代码和关闭恢复验证。联网整组仍有就绪/等待超时波动，未宣称修复该问题；后续需继续定位。产品核心用户的偏好已向维护者询问，尚未收到回答，当前仍按已有技术阅读用例推进独立修复。

本轮未完成的是最终 GitHub CI、公开发布与下载核验；检查完成后再记录相应结论。0.7.2 证据文件为 `docs/evidence/compatibility-0.7.2.json`。

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
