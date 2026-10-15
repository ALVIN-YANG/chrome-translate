# 安全问题 / Security

请在 [Security 页面](https://github.com/ALVIN-YANG/chrome-translate/security) 选择 **Report a vulnerability**，私下报告漏洞。若当前仓库未显示该入口，可以开一个仅请求私密联系方式的 Issue，不要公开漏洞复现、凭据或私人内容。

报告中说明受影响的版本、需要的权限、触发步骤、预期与实际数据流，以及最小的无敏感数据示例。可报告的问题包括凭据读取或泄露、非用户主动触发的外部调用、跨页面任务归属错误、模型内容执行、任意地址请求等。

不要上传真实 API Key、Authorization 请求头、Cookie、私人选中文字、完整浏览器配置或未经脱敏的 trace。若 Key 已泄露，请在对应服务商撤销或更换；仅删除 Git 提交中的文字不能让已泄露的凭据失效。

目前优先修复默认分支与最新 Release；旧版不承诺回补。服务商停机、额度不足、账号授权或翻译质量问题请使用普通 Issue，并附脱敏的错误文字。项目不提供响应时限、漏洞赏金或第三方服务可用性承诺。

关于正常的数据处理和权限，见 [隐私说明](docs/隐私说明.md)。

## English

Use **Report a vulnerability** on the repository's [Security page](https://github.com/ALVIN-YANG/chrome-translate/security). If the private report button is unavailable, open an Issue requesting a private contact without disclosing the vulnerability. Include the affected version, prerequisites, reproduction steps, expected and actual data flow, and a minimal non-sensitive example.

Never include real keys, authorization headers, cookies, private text, personal browser profiles, or unredacted traces. Revoke exposed keys at the provider. The default branch and latest release receive fixes first; backports, response deadlines, and bounties are not promised.
