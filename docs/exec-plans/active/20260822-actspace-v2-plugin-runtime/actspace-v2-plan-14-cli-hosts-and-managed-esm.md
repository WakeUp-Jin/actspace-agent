# P14：CLI run / chat Host 与 managed ESM 制品

状态：执行中（run/chat、TTY/EOF/SIGINT、writer conflict 与 Host DTO parity 已验证；managed package、真实 Provider 和依赖门禁未完成）

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P07、P12

消费方：P15

Exec-run slug：`actspace-v2-plan-14-cli-hosts-and-managed-esm`

## 1. 目标

让 CLI run 与 CLI chat 通过同一个 v2 RuntimeHandle 执行，并建立包含生产 ESM dependencies 的 managed directory / tarball 制品。run 默认 ephemeral，只有显式 `--persist` 才创建 `sessions-v2` Journal；chat 默认 persistent。CLI 只拥有 argv/stdin/TTY/stdout/stderr/exit code/signal/approval Host 语义，不实现第二套 Loop、Session 或 policy。

P14 不保留 SEA 或 v1 CLI fallback；v2 的发布形态是 managed ESM runtime directory。

## 2. 必读与基线

- [Runtime 与 Composition 目标设计](../../../design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md)
- [Runtime Projection](../../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)
- `apps/cli/src/`
- `scripts/package-agent-cli.mjs`
- `scripts/test-agent-cli-package.mjs`
- `.github/workflows/agent-cli-binaries.yml`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`

## 3. CLI 固定语义

### run

- 缺省 ephemeral：不创建 Session 目录、writer lease 或伪 durable facts。
- `--persist`：创建新的 persistent Session，并在 JSON/text result 返回 sessionId。
- `--resume <session-id>`：只用于 persistent run，隐含 `--persist`；与 `--input` / stdin 组合为下一 Turn。
- 支持 text、`--json`、`--jsonl`；stdout 只放协议输出，diagnostics 只走 stderr。
- non-TTY 默认审批不能等待 UI，返回 `APPROVAL_REQUIRED` 和现有稳定 exit code 4。

### chat

- persistent，使用 `sessions-v2/`；保留 `/new`、`/sessions`、`/resume` 和 TTY approval。
- 与 Desktop/第二 CLI 竞争同一 Session 时只有 writer lease holder 可以 resume。
- EOF graceful flush/dispose；第一次 SIGINT abort active run 并等待关闭，第二次才允许强制 130。

## 4. 文件与制品

新增 `apps/cli/src/runtime-v2/`：loader、Host adapter、terminal approval、projection renderer、artifact export 和 errors。v2-only CLI 直接从生产 package export 加载 ESM runtime。

新增 managed packaging：

- `scripts/package-agent-cli.mjs` 使用 `pnpm --filter @actspace/agent-cli deploy --prod` 生成自包含目录；
- artifact 固定为 `artifacts/agent-cli-managed/<platform>-<arch>/actspace-agent/` 和同名 `.tar.gz`；
- `bin/actspace-agent` 要求 Node `>=22.19.0`，从 production package export 加载 ESM runtime；
- `scripts/test-agent-cli-package.mjs` 从临时解包目录运行 smoke，禁止依赖 workspace `node_modules`；
- P15 用 managed workflow 替换 SEA workflow。

## 5. 任务

### 14.1 Host adapter

- 通过 CJS loader boot one RuntimeHandle，提供 cwd/workspace、env credential resolver、TTY/headless approval、signals、artifact output 和 stderr diagnostics。
- CLI 不导入 Cordis、Session writer、AgentLoop、ToolRuntime 或 Desktop code。
- v2 Boot failure 使用稳定 `BOOT_FAILED` / `RUNTIME_ERROR`，并保证 dispose。

### 14.2 run

- `args.ts` CLI contract 增加 `--persist` 和 `--resume`，互斥/缺值测试完整。
- ephemeral run 的 event collector 只保留进程内 projection；`--out` artifact 不伪装成 Session。
- persistent run 写真实 Journal；SIGINT、approval required、checkpoint failure 和 provider failure 均有稳定 result / exit code。

### 14.3 chat

- `/new` / `/resume` 委托 RuntimeHandle，不直接调用旧 session store 或维护 `cli.lock`。
- snapshot/cursor 驱动 terminal renderer；重复 delta、gap 和 resume 都不会重复打印 durable message。
- writer conflict、approval timeout、EOF、两次 SIGINT 和 corrupted/browse-only Session 给出明确错误。

### 14.4 managed ESM package

- runtime、Cordis family、pi-ai、optional legacy transport 和 native dependencies 全部进入 production deploy。
- smoke 在空 HOME 替代目录和隔离 data dir 下运行 `--help`、`--version`、mock run、persistent run / resume 和 chat process fixture。
- 生成 dependency inventory、license notice 和 integrity evidence；不存在 `src/*` deep import。

### 14.5 Host parity

- 用与 P13 相同 Journal fixture 比较 normalized Desktop/CLI run/chat DTO。
- CLI-specific text formatting 可不同，但 identity、status、usage、failure、Tool result 和 Session facts必须一致。

## 6. 允许修改

- `apps/cli/src/runtime-v2/**`
- v2 所需的 `args.ts`、`run.ts`、`chat.ts`、`cli.ts`、types/tests
- `scripts/package-agent-cli.mjs`、`scripts/test-agent-cli-package.mjs`
- package manifests、managed package CI job、docs/history/exec-run

P14 不新增 SEA、v1 adapter 或第二套运行入口；旧路线已由 P15 清理。

## 7. 失败与回滚

- managed artifact 只能从 workspace 路径启动时视为失败，不能退回 SEA 作为 v2 产品方案。
- run ephemeral 产生 Journal 是阻断性回归。
- 回滚只移除尚未发布的 managed artifact；不恢复第二套 CLI engine。

## 8. 验证

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/agent-runtime build
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/agent-cli typecheck
pnpm --filter @actspace/agent-cli build
pnpm test:agent-cli:process
pnpm package:agent-cli
node scripts/test-agent-cli-package.mjs
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 9. 完成标准

- run/chat 共享 RuntimeHandle 语义，无第二套 engine 或 persistence。
- ephemeral/persistent、stdout/stderr、TTY approval、signals 和 writer lease 有真实进程测试。
- managed artifact 在解包后的独立目录可运行，不依赖 SEA 或 workspace node_modules。

## 10. 当前进度

- [x] v2 Host adapter、run/chat v2-only selector、`--persist` / `--resume` 参数和稳定输出边界。
- [x] run 默认使用真正的内存 Session，不创建临时或持久 `sessions-v2` Journal。
- [x] CLI v2 mock 行为测试覆盖 ephemeral、persistent、resume、chat 与参数解析。
- [x] 从 `@actspace/agent-core` 抽离 legacy LLM 与具体 Tool executor；CLI 只消费 `@actspace/agent-runtime` 公共接口。
- [ ] 完成 `pnpm deploy --prod` managed artifact、解包 smoke、dependency inventory 与 notice。
- [x] 完成 direct mock run、persistent/resume、真实 TTY chat、`/sessions`、`/exit`、EOF 和跨进程 writer conflict。
- [x] 完成真实 TTY approval、active run 第一次/第二次 SIGINT 与 Desktop/CLI Host DTO parity 验收。
- [ ] 完成真实 Provider 验收。
