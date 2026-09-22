## [2026-09-22 12:56] | Task: 落库 LLM Core Pi 评审修订

### Execution Context

- Agent ID: /root
- Base Model: GPT-6
- Runtime: Codex desktop

### 用户诉求

评审 LLM 模块调整方案；用户确认后，将修订后的设计和计划纳入仓库。

### 变更

- 新增 LLM Core Pi 目标设计与五阶段执行计划，明确代码未实施。
- 补齐 Desktop/CLI、Runtime exports、异步 prepare lease、retry scope、连接与凭据分离、OpenRouter billing fallback 和 replay 持久兼容身份。
- 注册设计、架构和 active plan 导航，并从现有 LLM Adapter 文档链接到本次目标。

### 设计动机

避免只缩短 engine 调用链却保留快照与实际请求不一致；把实施前需要决策的生命周期、兼容和验收边界写成可测试任务。

### 主要文件

- docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md
- docs/exec-plans/active/20260922-llm-core-pi.md
- docs/design-docs/agent-plugin-runtime/agent-target-llm-adapter.md
- docs/design-docs/agent-plugin-runtime/README.md
- docs/design-docs/index.md
- docs/exec-plans/README.md
- docs/ARCHITECTURE.md

### 验证与边界

本轮仅修改文档；未修改运行时代码、安装依赖、调用真实 Provider 或启动 Electron。pnpm check:docs、pnpm check:secrets 与 git diff --check 通过；新增文档另行检查空白格式。尚未经过实施验证的设计不单独包装成学习成果，代码阶段再按学习规范评估。

## 实施收口

- M1 增加 request-bound `LlmAdapter.prepare`、prepared adapter call 和 generation lease；retry 复用已捕获配置，replacement 后新请求才进入新 generation。
- M2 将 Desktop/CLI Host 配置物化提前到 prepare，生产路径使用 `PiAiAdapter({ wire, legacyProxy })`，并为 reasoning replay 增加版本化 provider/protocol/model identity envelope。
- M3/M4 增加 direct/legacy backend policy、proxy/OpenRouter/DeepSeek image compatibility、cancel/dispose、replay identity filtering，以及对应 package/Host 回归。
- 后续清理移除 `PiAiWireEngine`/`PiAiEngine` 公开生产入口，将 direct stream 收进 Adapter 内部；service 增加 nested detached capture 与 async prepare lease 回归。
- 自动化结果：受影响 package、全 workspace typecheck、CLI build/process/package smoke、Desktop build、docs/secrets/current-docs/v2 legacy 和 diff checks 通过；既有 package-boundary、Desktop renderer、site generated `/eval` 残留和真实 Provider/packaged Electron 外部门禁见执行摘要。
