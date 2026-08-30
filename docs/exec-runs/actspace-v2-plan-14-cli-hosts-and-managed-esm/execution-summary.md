# ActSpace v2 P14：CLI Hosts 与 Managed ESM - 执行摘要

## 结果

CLI run/chat 已接入 v2 RuntimeHandle，run 的 ephemeral 语义已落实为纯内存 Session。14 个 CLI tests、2 个真实进程 SIGINT smoke、direct persistent/resume、真实 PTY chat/approval、EOF、跨进程 writer conflict 和 Desktop/CLI Host DTO parity 已通过，生产源码不再依赖旧 Agent Core。managed artifact 逻辑已补齐 dependency inventory、third-party notice 与逐文件 SHA-256 evidence。

P14 仍处于执行中。managed ESM artifact、fresh 外部依赖和真实 Provider 未通过前，不能宣告制品可交付。

## 回退边界

- CLI 源码入口固定使用 v2-only Runtime；managed 制品通过前仍不宣告可发布。
- ephemeral run 不创建或删除持久 Session 数据。
