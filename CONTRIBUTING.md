# 参与贡献 / Contributing

欢迎用中文或英文提交问题、文档修正和 Pull Request。先搜索已有 Issue；较大的功能先说明使用场景、预期行为和范围，避免做完后才发现方向不符。

## 本机开发

需要 Node.js 22 或更新版本，推荐 24。安装后的扩展要求 Chrome 120+。

```sh
git clone https://github.com/ALVIN-YANG/chrome-translate.git
cd chrome-translate
npm ci
npm run check
```

`check` 运行 Node 测试并构建到 `dist/`，不需要真实 API Key。构建会清理 `dist/`，不要在其中保存个人文件。在 `chrome://extensions` 开启开发者模式后加载 `dist/`；修改代码后重新构建、重新加载扩展，并刷新测试网页。

`npm run dev` 提供独立翻译页的网页预览。网页预览不等于已安装扩展，不能验证网页双语、划词、后台消息或 offscreen 音频。

## 浏览器回归

```sh
npx playwright install --no-shell chromium
npm run test:browser
```

Linux 首次运行可使用 `npx playwright install --with-deps --no-shell chromium` 安装系统库。可用 `HEADED=1 npm run test:browser` 显示测试窗口（该环境变量写法适用于 macOS/Linux）。

测试使用 Playwright 自带 Chromium、临时浏览器配置和本机随机端口，不读取日常 Chrome 配置，不需要真实 Key，不调用付费模型。先生成实际 ZIP 并解压，再用每组独立的浏览器配置加载，验证独立页、网页双语、划词 AI、音频播放、严格 CSP、键盘关闭后的焦点与场景按钮状态。正文验证器另有受控反例：标题有中文、正文无译文时必须失败；正文和滚动加载成功时才通过。供应商响应受控，不能证明真实账号权限、翻译质量、真人听感或读屏体验。系统声音事件受控；云端播放链路使用生成的测试音。

结果 JSON、截图及失败时的 trace 放在 `output/playwright/`。这些文件只含测试数据；不要向公开 Issue 上传含真实 Key、私人网页、会话、原文或请求头的日志。真实服务验证脚本需额外授权凭据和费用，不属于默认 CI。

需要核对真实公共网页与微软免 Key 接口时，在构建后手动执行（macOS/Linux）：

```sh
npm run build
TRANSLATE_LIVE_MICROSOFT=1 node --test --test-name-pattern='real-mdn|real-python' tests/browser/extension.test.js
```

此模式只访问固定的 MDN 与 Python 官方文档，不读取用户页面，也不使用付费模型。它要求首屏英文正文节点内显示中文译文，再选择两个视口之外尚未翻译的正文、滚动并验证译文出现；中文标题不能替代正文证据。同时检查请求无凭据、原段落与代码文本、关闭恢复。结果受网络、免 Key 接口和网站自身更新影响，不证明整页翻译完成或人工翻译质量。为避免公共网站资源过多，不收集完整 trace；截图失败会单独记录，不替代功能断言。校验工具会读取高亮组件的开放 Shadow DOM 来核对代码文本，扩展自身仍不翻译网站 Shadow DOM。

只排查公共网页的扩展入口是否出现时，构建后运行 `node scripts/verify-page-startup.mjs`。它在四个新建配置中打开三次 MDN、一次 Python 文档，检查十秒内入口是否可操作及随后是否仍存在；不实际点击，不触发翻译，并拦截可能发出的微软/词典请求。记录保存到 `output/startup-probe.json`。该探针有网络路由干预，只提供这些样本的诊断记录，不作为性能基准，也不能凭通过就认定偶发启动问题已修复。

## 改动应该放在哪里

见 [架构说明](docs/架构说明.md)。新增适配优先复用现有协议和 AI SDK provider，避免每个厂商复制一套界面、请求或播放流程。新增依赖前，确认现有实现不能满足需要。

- 用户文本保持可选中、可复制。词义、例句与句段的展示约定要保留。
- 输入立即触发翻译，但输入法组合期间不发请求。取消后，旧响应不能更新当前任务。
- 只向用户选定的供应商发送必要文本；失败不自动换供应商，不静默重试可能计费的请求。
- Key 只在可信扩展上下文读取；内容脚本仅接收公开设置。不要把凭据放进 URL、日志、截图、测试快照或提交。
- 云端媒体由 offscreen 文档管理。暂停、恢复、停止、关页和迟到回调都要归属正确任务。
- 模型输出按纯文本或经过过滤的 Markdown 展示，禁止执行返回的 HTML 或加载模型图片。

## 提交 Pull Request

使用 `codex/` 或其他清楚的功能分支，保持一个 PR 解决一个问题，保留无关改动。提交信息默认用简洁中文；英文贡献也欢迎。

描述触发问题的场景、改动后的行为，以及实际跑过的验证。UI 改动附真实截图；影响网页范围、权限、服务数据流或费用时写清楚原因。只补有意义的测试，不为纯样式或文案堆叠测试。

提交前运行 `npm run check`。涉及 UI、消息、音频、网页提取或构建时再运行 `npm run test:browser`。CI 固定 Ubuntu 24.04，使用 Node 22/24 及 Chromium；测试通过、真实服务验证和用户安装验收是三种不同证据。

## English quick start

Use Node.js 22+ (24 recommended). Run `npm ci`, then `npm run check`. For the real MV3 browser suite, run `npx playwright install --no-shell chromium` and `npm run test:browser`. Linux may need `--with-deps` during installation. Test profiles and local fixture servers are created and removed automatically; no real API key is required. Results and failure traces are saved under `output/playwright/`.

Keep PRs focused. Explain the problem, resulting behavior, and checks actually run. Include actual screenshots for UI changes. Never submit credentials, private text, raw authorization headers, or personal browser profiles. Discuss substantial features in an Issue before implementing them. See the [English README](README.en.md) for installation and product limits.
