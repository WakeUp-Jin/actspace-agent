# ActSpace v2 P14：CLI Hosts 与 Managed ESM - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-14-cli-hosts-and-managed-esm.md`
- **执行模式**：交互
- **开始时间**：2026-08-22
- **当前状态**：v2-only run/chat、TTY/双 SIGINT 与 Host DTO parity 已完成；managed 制品、真实 Provider 和依赖门禁未完成

## 已执行

1. 新增 v2 loader、Host adapter、approval、artifact、Tool/LLM ports、terminal renderer 和 run/chat 入口。
2. `run` 新增 `--persist` / `--resume`；默认使用真正的内存 Session，不创建临时目录或 `sessions-v2` Journal。
3. `chat` 和 persistent run 通过同一个 RuntimeHandle Session API；stdout/stderr 与 v2 Boot failure 维持独立边界。
4. 新增 managed packaging 与解包 smoke 脚本骨架；正式 CLI 源码入口固定为 v2-only，managed 制品仍待门禁。
5. legacy LLM 与具体 Tool executor 已迁入 CLI Host ports / Runtime 公共接口，生产源码不依赖 `@actspace/agent-core`。
6. CLI artifact 现在无损携带 RuntimeHandle 的 `turnId/reason/steps/snapshot`；managed package 脚本生成 dependency inventory、third-party notice 与逐文件 SHA-256 manifest。

## 已验证

- CLI v2 tests：6 files、14/14；另有 2 个真实进程 SIGINT smoke。
- ephemeral 测试确认不创建 `sessions-v2`，同时可在进程内 export snapshot。
- CLI core-tool ports 已改为从 `@actspace/agent-runtime` 创建 Node executor 和 Session-owned `inspect_image`，不再依赖旧 `@actspace/agent-core`。
- direct CLI persistent run 与 `--resume` 使用同一 Session ID 并追加 Journal；ephemeral run 不创建持久 Session。
- 真实 PTY chat 已覆盖消息、`/sessions`、`/exit` 与 EOF；第二进程 resume 同一 Session 时稳定拒绝并报告当前 owner runtime/pid。
- 真实 PTY approval 输入 `y` 后返回 `allow`；non-TTY broker 自动化保持 fail-closed。
- active run 第一次 SIGINT 生成结构化 `aborted` result 并退出 130，第二次 SIGINT 由 CLI 强制以 130 退出而非被 OS signal 终止。
- Desktop 的 `RuntimeV2RunTurnResponse` 与 CLI artifact 对 identity、termination、usage、Tool、Todo、delegation 和完整 Session snapshot 保持无损 parity。
- managed packaging 与 package-smoke 脚本通过 Node 语法检查；实际 deploy、notice/inventory/hash manifest 与解包运行仍需 fresh production dependency tree 验证。

## 尚未完成

- production dependency install、`pnpm deploy --prod`、tarball 解包和 workspace-independent smoke。
- 真实 Provider。
