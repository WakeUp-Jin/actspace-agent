## [2026-10-01 17:20] | Task: 修复 OpenRouter Claude Chat 请求 400

### Execution Context

- Agent ID: Codex /root
- Base Model: 未由运行环境提供具体版本
- Runtime: Codex desktop

### 用户诉求

排查 OpenRouter 会话显示 `unknown: 400 Provider returned error`；用户批准修复，并授权使用本机配置和供应商代理进行真实请求验证。

### 原因与改动

- Chat 的 `web` 工具 schema 在顶层使用 `allOf` 条件约束，Anthropic 上游在模型生成前拒绝该结构；经代理重放确认，同一请求仅去掉该结构即成功。
- `packages/tools/web-tools/src/plugin.ts` 使用普通 object schema，通过描述说明 action 对应必填项；现有 Node handler 继续在网络调用前校验 query/url。
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts` 修正 400 / 404 / 422 分类，并提取 OpenRouter 上游错误的 message/code 白名单字段，脱敏且限制长度；不持久化完整 metadata。
- 补齐两个包的 README、schema 回归测试、真实 SDK 错误解析测试，以及缺失参数不触网测试。

### 验证

- Red：旧代码上新增回归出现 4 项失败（schema 1 项、SDK 错误分类 3 项）；缺失参数验证通过。
- Green：`pnpm --filter @actspace/llm-pi-ai test` 54 项通过，`pnpm --filter @actspace/tools-web-tools test` 10 项通过。
- 两包 `build` 通过。
- `pnpm check:docs` 与本次改动的 `git diff --check` 通过。
- curl 对照：沿用同一配置、代理、模型、问题与推理设置，旧 schema HTTP 400；去掉顶层 allOf 后 HTTP 200 并正常停止。
- 编译后实际 PiAiAdapter + ProviderProxyPool 对照：旧 schema 返回带具体原因的 `invalid-request`；使用修复后的工具定义返回正文并以 stop 结束。
- 同形检查：packages 生产源码中该顶层组合 schema 仅发现 web 一处；直接 pi-ai 路径已有 400 分类，本次 OpenRouter completions 与代理请求走已修复的 SDK transport。直接 pi-ai 对上游细节的保留未扩展。
- 未进行 Electron 界面重启验收、安装包构建或发布。原会话 Journal 未修改；已落盘的旧错误不会被改写。

### 学习沉淀

本次涉及可迁移且容易踩坑的供应商 JSON Schema 子集兼容问题，见 [工具 Schema 与执行校验](../../learnings/2026-10/provider-tool-schema-validation.md)。
