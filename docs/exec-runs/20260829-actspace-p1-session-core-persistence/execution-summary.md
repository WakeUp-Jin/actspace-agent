# ActSpace P1/P2：Session、Service、Composition 与契约矩阵 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-p1-session-core-persistence/execution-process.md`
- **执行模式**：交互
- **执行结果**：P1-A、P1-B、P1-C、P2 contract slices 与 G2 自动化门禁完成；G1 CLI one-shot 及真实宿主外部门禁仍待执行

## 已完成内容

### P1-A：Session Core / Persistence 分离

- `SessionHandle` 只依赖 backend-neutral `SessionPersistenceDriver`。
- JSONL writer、lease、目录准备和 recovery 留在 Persistence Provider。
- `SessionStore` 负责把 Provider binding 组装为 live Session Core。
- Core 生产源码不再直接导入 `@actspace/session-jsonl`、`JsonlSessionWriter`、writer lease 或 `node:fs`。

### P1-B：Service Definition / Provider / Consumer

- 服务 Definition 固化 ABI、owner、scope、required、config schema、错误面和 public surface。
- Provider 通过 `ProviderHandle` 管理实例化与释放，Consumer 有稳定 consumer identity。
- 14 个核心服务拥有统一 role metadata，并有 definition、graph、manifest consistency 校验。

### P1-C：Profile / Bundle / Patch

- Resolved Composition 输出 service/codec admission、diagnostics、loaderConfig 和 startup requirements。
- 默认 Profile 使用不可变 trusted loader metadata；Boot 校验它与 `packages/runtime/cordis.yml` 的 transport parity。
- Profile/Bundle/Patch digest 纳入 loader、service、codec 和 startup facts，避免 composition 漂移后仍复用旧结果。

### P2：契约矩阵

- 新增显式 allowlist generator，生成 JSON 与 Markdown 双产物，并支持 `--check`。
- 当前矩阵包含 69 个事件、14 个服务、3 个 Session 层、7 个 capability、18 个 plugin、32 个 package、8 个 verification row。
- `goal/change` 与 `schedule/change` 保留为未来事件，producer status 明确为 `not-implemented`。
- 生成器已接入根测试脚本与 CI，禁止绝对路径、重复 ID、缺失 owner/sourceRefs、非法 service provider 和 notification veto。

## 验证结果

- `pnpm --filter @actspace/session-persistence typecheck`、测试：通过（34 tests）。
- Journal、JSONL、Cordis adapter、Composition、Boot、Runtime 定向 typecheck/test：全部通过。
- `pnpm test:contract-matrix`：通过（2 tests）。
- `pnpm run gen:contract-matrix --check`：通过，digest 稳定。
- `pnpm run check:packages`、`check:current-docs`、`check:docs`：通过。
- `pnpm run check:v2-legacy-removal -- --strict`：通过。
- `pnpm run check:package-cutover -- --strict`：通过（0 findings）。
- `pnpm test:agent-cli:process`：通过（2 SIGINT smoke tests）。
- `pnpm test:agent-cli:package`：通过（managed CLI package 的 `--persist` / `--resume` smoke，保持 Session identity）。
- `pnpm --filter @actspace/agent-cli typecheck && pnpm --filter @actspace/agent-cli test`：通过（14 tests）。
- `pnpm run typecheck`：通过（runtime dependency closure build + 全仓 typecheck）。
- `pnpm -r --if-present test`：通过（包括 Desktop 522 tests、CLI 14 tests 和各领域 package tests）。
- 根 `pnpm test`：通过。

## 人工验证与剩余边界

1. **G1 CLI 单次无头任务**：仍需独立验收完整 `boot → run → flush → dispose`，以及显式 persist/resume 和真实重启后的 replay；本轮 CLI chat 继续不在范围内。
2. **真实运行环境**：真实 LLM Provider、Browser Bridge、Electron、签名/公证、网络权限和发布制品仍需对应环境验收，不能由本地单元测试代替。
3. **Loader transport**：当前是 checked-in immutable metadata + parity check；面向任意外部插件 Bundle 的动态 transport 生成/装载仍属于后续边界。

## 交付文件

- 设计规范：`docs/design-docs/agent-plugin-runtime/agent-spec-*.md`
- 执行计划：`docs/exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/`
- 契约矩阵：`artifacts/agent-contract-matrix.json`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- 详细过程：`docs/exec-runs/20260829-actspace-p1-session-core-persistence/execution-process.md`

本轮未执行 `git clean`、`git reset`、stage、commit 或 push；已有 dirty worktree 内容均保留。
