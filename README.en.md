# Chrome Translate

[简体中文](README.md) · English

[![Checks](https://img.shields.io/github/actions/workflow/status/ALVIN-YANG/chrome-translate/check.yml?branch=main&label=checks)](https://github.com/ALVIN-YANG/chrome-translate/actions/workflows/check.yml)
[![Latest release](https://img.shields.io/github/v/release/ALVIN-YANG/chrome-translate)](https://github.com/ALVIN-YANG/chrome-translate/releases/latest)
[![MIT license](https://img.shields.io/github/license/ALVIN-YANG/chrome-translate)](LICENSE)

A Chrome extension for **selection translation, speech, contextual AI, and bilingual webpages**. Bring your own model and voice, or start with keyless Microsoft translation and local system speech. The interface currently uses Chinese; English interface localization is not yet implemented.

**[Download](https://github.com/ALVIN-YANG/chrome-translate/releases/latest)** · [Contribute](CONTRIBUTING.md) · [Report a problem](https://github.com/ALVIN-YANG/chrome-translate/issues/new/choose) · [Security](SECURITY.md)

![Actual selection toolbar: Translate, Read aloud, Ask AI](docs/assets/selection-toolbar.png)

## Install

Requires Chrome 120+. Release installation does not require Node.js or a developer account.

1. Download **`translate-chrome-*.zip`** from [Releases](https://github.com/ALVIN-YANG/chrome-translate/releases/latest). The **Source code** archives are not installable builds.
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Choose **Load unpacked**, then select the folder directly containing `manifest.json`.
5. Open Chrome's **Extensions** menu (puzzle icon), choose **翻译 · 多语言**, then **打开独立翻译页** to open the text workspace. You can pin the extension to the toolbar if desired.

To update, replace the files in the same folder, reload the extension, and refresh open translation pages and webpages. Keep that folder in place. The project is not currently published on the Chrome Web Store.

For a first try, keep the default Microsoft service and paste `Hello, world.` to see a Chinese translation. Refresh an already-open HTTP/HTTPS webpage before trying selection translation or **翻译当前网页**. AI and cloud speech setup can wait. Whether you complete your task or get stuck during installation, [share your usage experience](https://github.com/ALVIN-YANG/chrome-translate/issues/new?template=usage.yml); no development setup is needed.

## Use

| Action | Behavior |
| --- | --- |
| **翻译 — Translate** | Show word meanings and examples, or a single sentence/paragraph translation. Chinese defaults to English; other source languages default to Chinese. Text remains selectable and copyable. |
| **朗读 — Read aloud** | Read the selected original. Pause, resume, stop, or press Esc. Translation results, examples, and AI answers also have speech controls. |
| **问问 AI — Ask AI** | Ask about the selected passage, explain, summarize, or rewrite it. Streamed answers support sanitized Markdown, follow-up questions, copy, and speech. |
| **翻译当前网页 — Bilingual webpage** | Insert translations below source paragraphs. Use the toolbar, right-click menu, floating **译** button, or **Alt+A**. Repeat to restore originals. **Alt+W** expands the scope to the whole page. |
| **打开独立翻译页 — Text workspace** | Paste text for immediate translation. Keeps the previous result available during updates and failures, supports session recovery, and offers an 8-second undo after clearing. |

Selecting text alone does not send API requests. Opening the AI panel alone does not submit a question. Webpage translation starts only when enabled and must be re-enabled after refresh/navigation. On macOS, Alt means Option; conflicts can be changed at `chrome://extensions/shortcuts`.

Webpage translation prioritizes article content, loads paragraphs near the viewport, and handles dynamic text. It preserves original links, formatting, and events. Code blocks, forms, editable fields, and `translate="no"` content are skipped. PDF, images, subtitles, browser pages, local files, iframes, and website Shadow DOM are outside the current support boundary. This project is independent of Immersive Translate.

Queued paragraphs are withdrawn before sending if they are removed, replaced, or excluded via attributes such as `hidden` or `translate="no"`, including exclusions on ancestor containers. Requests already sent upstream cannot be recalled.

Line breaks preserve word boundaries without splitting words across inline formatting. If a site redraw removes a completed paragraph's translation, it is restored from memory without another provider call. Repeated removals pause the page and offer Retry, avoiding continuous DOM insertion.

![Actual bilingual reading interface](docs/assets/webpage.png)

## Models and voices

Open **模型与声音 — Models and voices** from the menu or text workspace. Translation, AI chat, and speech are configured independently. You can edit API keys, base URLs, model IDs, voice IDs, speech rate, and response preferences.

Changing speech preferences alone keeps AI generation running. Switching voice services also preserves the existing conversation and an unsent follow-up draft.

Switching AI services updates the open panel and composer labels immediately. Existing answers retain their original service names, new answers use the new name, and the unsent draft is preserved. Missing credentials block submission locally; restoring them allows another manual submission. Saving settings never submits a question.

- **Text translation:** Microsoft, Baidu, Zhipu, SiliconFlow, Gemini, DeepSeek, and Kimi Coding Plan.
- **Selection AI:** MiniMax, DeepSeek, OpenAI, Claude, Gemini, Zhipu, Qwen, SiliconFlow, Kimi Coding Plan, Ollama, or a custom OpenAI Chat Completions / Anthropic Messages / Google Gemini endpoint.
- **Speech:** local system voices, MiniMax, OpenAI, ElevenLabs, SiliconFlow, or custom compatible speech endpoints.

MiniMax chat and speech can share one key. Some AI presets can reuse the corresponding translation key. Local system speech is the default and needs no key; cloud services use your own account and its quotas/billing. Kimi supports the Coding Plan endpoint only; check the provider's permitted uses. The repository and installation package contain no real credentials.

Microsoft uses a keyless Edge consumer endpoint, whose availability for third-party use is not guaranteed. Other services require credentials; free model availability, quotas, regions, data use, and billing depend on the provider. The [Chinese provider notes](docs/免费模型说明.md) link the official sources. No automatic provider fallback occurs on failure.

Remote custom endpoints require HTTPS. Loopback services may use HTTP on `localhost`, `127.0.0.1`, or `::1`. Enter a base URL without credentials, query parameters, or fragments. The extension appends the API path and rejects redirects.

Translation supports Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Italian, Arabic, Hindi, Thai, Vietnamese, and Indonesian. Source detection is automatic. Device voice availability is independent of translation language support. Short ambiguous text may need more context or an explicit target language.

## Privacy

Text goes directly to the selected provider. Microsoft short-word enrichment also queries Bing Dictionary. Cloud speech receives the text being read; local system speech selects device-local voices. The extension does not send page URLs, cookies, or full HTML to translation providers and has no analytics SDK, advertising, account system, or relay backend.

API keys and preferences stay in trusted extension-local storage, not browser cloud sync. This storage is **not an encrypted password vault**. Content scripts receive only public settings. Text workspace state uses tab `sessionStorage`; browser session restoration may restore it. Webpage caches and AI conversation context remain in page memory. Closing the AI panel clears its conversation.

Permissions are `storage`, `contextMenus`, `offscreen`, and access to normal HTTP/HTTPS pages. There is no microphone, clipboard-read, `tabs`, or browsing-history permission. Cloud audio plays in a trusted offscreen document. More detail and source pointers are in the [data and permissions explanation](docs/隐私说明.md); report vulnerabilities through [SECURITY.md](SECURITY.md).

## Develop and verify

```sh
git clone https://github.com/ALVIN-YANG/chrome-translate.git
cd chrome-translate
npm ci
npm run check
npx playwright install --no-shell chromium
npm run test:browser
```

Use Node.js 22+; 24 is recommended. Linux may need `npx playwright install --with-deps --no-shell chromium`. The browser suite creates and extracts the actual release ZIP, loads that MV3 extension in fresh profiles, serves local fixtures on random ports, and uses controlled provider responses plus a generated test tone. It requires no real API keys. Failure traces, screenshots, and result JSON go to `output/playwright/`.

CI uses Ubuntu 24.04 with Node 22/24 and Chromium. `npm run package` runs Node checks and builds a ZIP plus SHA-256 in `output/release/`; browser checks remain a separate release gate. Only allowlisted extension files are packaged, and the build clears `dist/` first. See [CONTRIBUTING.md](CONTRIBUTING.md) for development boundaries and [release instructions](docs/发布说明.md) for packaging details.

[Version 0.7.12](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.12) uses the existing AI SDK for DeepSeek, Kimi, Zhipu, SiliconFlow, and Gemini translation. It preserves meanings, English examples, and provider settings without new dependencies. Webpage scripts no longer include the model client. Existing free-provider connection, meanings, settings, and error scenarios now run in the default browser suite. See [SDK validation](docs/evidence/sdk-0.7.12.json).

The circular shortcut and eleven visual states from [v0.7.11](https://github.com/ALVIN-YANG/chrome-translate/releases/tag/v0.7.11) are recorded in [the validation data](docs/evidence/floating-button-0.7.11.json); AI service switching is recorded in [v0.7.9 validation](docs/evidence/model-switch-0.7.9.json). These checks do not prove installation in your browser, manual screen-reader acceptance, or compatibility with every website. Voice/chat independence is recorded in [v0.7.8 validation](docs/evidence/preferences-0.7.8.json), pending paragraphs, large articles and live MDN/Python checks in [v0.7.7 validation](docs/evidence/pending-0.7.7.json), continuous updates in [v0.7.6 validation](docs/evidence/updates-0.7.6.json), navigation boundaries in [v0.7.5 validation](docs/evidence/navigation-0.7.5.json), and settings concurrency in [v0.7.4 validation](docs/evidence/settings-0.7.4.json).

Live MDN and Python checks require visible translations inside actual source paragraphs, including a distant paragraph loaded after scrolling. They also verify original paragraphs, code text, and cleanup on stop. Controlled cases reject heading-only translation, exclude interface widgets, and cover layout changes after translations arrive; see [the article validation data](docs/evidence/article-validation-0.7.3.json). Keyboard and button-state checks are recorded in [v0.7.3 validation](docs/evidence/keyboard-0.7.3.json). These samples do not prove whole-page completion, translation quality, or a fix for the earlier intermittent readiness issue.

MiniMax chat/audio and Microsoft translation have prior live verification recorded in [validation notes](docs/验证记录.md). Controlled tests do not prove other providers' account permissions, translation quality, human listening quality, or installation in your own browser. Inputs are limited to 10,000 characters (Baidu also has a 6,000-byte limit). Cancelling a request does not guarantee that server computation or billing stops.

## License

Project source and documentation are available under the [MIT License](LICENSE). Bundled dependencies retain their own licenses in `THIRD_PARTY_LICENSES.txt`. Provider APIs, accounts, and model access remain subject to their own terms. See the [roadmap](docs/路线图.md) for the current priorities and limits.
