# 沙箱第一期：地基 + 工具沙箱 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-sandbox-v1-tool-sandbox.md`
- **执行过程**：`docs/exec-runs/20261025-sandbox-v1-tool-sandbox/execution-process.md`
- **执行模式**：交互
- **执行结果**：T0–T10 完成，分支 `feat/sandbox-refactor`，每个任务一个提交，未推送。Desktop 界面项未验证（见下文）。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 沙箱管理器插件 `sandbox` | `packages/sandbox/manager/**` | 执行契约、策略合并与指纹、按能力选后端（nono > Seatbelt）、执行生命周期（准备、运行、终止、清理）、结果状态、继承模式；都不合格时返回不可用，不给出不加沙箱的启动方式 |
| Seatbelt 后端 | `packages/sandbox/seatbelt/**` | 原 shell-tools 的 SBPL 规则搬入，路径来自策略，支持断网 |
| nono 后端 | `packages/sandbox/nono/**` | `nono wrap`；macOS profile 模式（`.git` 禁止写入、凭据禁止读取写成 Seatbelt 规则），Linux 权限清单模式（拆分覆盖）；去掉 `NONO_*`；Linux 报告 `filesystem.write-deny=unsupported` |
| nono 获取与打包 | `scripts/sandbox/*`、`scripts/release-package.sh`、`package.json` | 锁定 0.80.0 四个平台与 SHA256；`pnpm sandbox:fetch-nono`；打包进 `sandbox-components/bin/nono` 并校验签名与版本 |
| Cordis 可选依赖 | `packages/cordis-adapter/src/*`、`packages/{bundle,composition,boot}/src/*` | `optionalInjects`，须与 `optional: true` 的契约一致 |
| 注册进默认 Harness、Host 端口 | `packages/runtime/**`、`apps/desktop/src/main/**`、`packages/agent-host/**`、`apps/cli/src/runtime-v2/*` | 三个插件进默认组合；Desktop 打包版只认随包 nono，开发版 `ACTSPACE_NONO_PATH` → 仓库副本；启动时记 `SANDBOX_STATUS` 诊断 |
| shell-tools 接入 | `packages/tools/shell-tools/**` | 可选依赖 `sandbox`；沙箱不可用时进程资源 `noSandbox: true`（每次询问、无前缀授权）；执行端只认批准时的选择，需要沙箱但不可用时返回 `SANDBOX_PREPARE_FAILED`；删除 `sandboxSpawn` / `probeSandbox` |
| 审批卡执行环境 | `packages/shared/src/runtime-v2/permission.ts`、`packages/tools/runtime/src/prepared-execution.ts`、`apps/desktop/src/main/runtime-v2/approval-broker.ts`、`apps/desktop/src/main/remote-hosts/desktop-adapter.ts` | 审批资源摘要带 `noSandbox`，本机与远程 Host 审批填 `executionEnvironment`（沙箱 / 真实环境） |
| 生成物与文档 | `scripts/contract-matrix/source-registry.mjs`、契约矩阵、设计文档、`docs/SECURITY.md`、包 README | 矩阵登记三个包；文档改为当前行为 |

## 人工验证指引

### 必须验证

1. **Desktop 中沙箱内执行**
   - 验证方式：`pnpm sandbox:fetch-nono && pnpm dev:log`，新会话（`default` 模式）让 Agent 依次执行 `touch a.txt`、`touch ~/actspace-sandbox-probe.txt`、`ls ~/.ssh`、`git status`、`pnpm --version`。
   - 预期结果：审批卡显示“沙箱”；`git status` 的审批卡有前缀授权选项。第 1、4、5 条成功，工具结果摘要含 `sandboxed=true, sandbox=nono`；第 2、3 条失败，`~/actspace-sandbox-probe.txt` 不存在。注意 `echo hi > a.txt` 会被 bash 原有的重定向规则直接拒绝，与沙箱无关。

2. **启动日志里的沙箱状态**
   - 验证方式：上一步启动后查看 `logs/latest-dev.log`。
   - 预期结果：有 `sandbox nono resolved` 一行，`nonoPath` 指向 `dist/sandbox-components/darwin-arm64/nono`。沙箱可用状态记为运行时诊断 `SANDBOX_STATUS`（`Tool sandbox: nono 0.80.0.`），走 Runtime 诊断渠道，Agent 未确认它是否也出现在日志文件里；没有的话请记下，再决定要不要补一行文本日志。

3. **后台任务停止**
   - 验证方式：让 Agent 后台执行 `sleep 300`，再让它用 `task_stop` 停止；终端执行 `pgrep -f "^sleep 300$"`。
   - 预期结果：任务显示已停止，`pgrep` 没有输出。

### 建议验证

1. **无 nono 时用 Seatbelt**
   - 验证方式：临时把 `dist/sandbox-components/darwin-arm64/nono` 改名，不设 `ACTSPACE_NONO_PATH`，重启 `pnpm dev:log`，重复必须验证 1。完成后改回。
   - 预期结果：行为相同，摘要为 `sandbox=seatbelt`。

2. **沙箱不可用时的“真实环境”审批卡**
   - 验证方式：在测试组合中去掉 `sandbox`、`sandbox-nono`、`sandbox-seatbelt` 三个插件后让 Agent 执行任意 bash 命令。
   - 预期结果：审批卡显示“真实环境”，没有前缀授权选项；批准后执行，摘要为 `sandboxed=false, sandbox=none`。

3. **打包版**
   - 验证方式：打开 `../actspace-agent-sandbox-package/dist/` 下的 DMG（基于 `acc8483f` 的 ad-hoc 包），安装后执行必须验证 1。
   - 预期结果：同必须验证 1，使用包内 `Contents/Resources/app/sandbox-components/bin/nono`。

## Agent 已完成的验证

- 全仓：`pnpm check:packages`、`pnpm check:desktop-build-graph`、`pnpm test:contract-matrix`、`pnpm typecheck`、`pnpm test` 通过；`test:agent-host:process` 7 通过。
- 包测试：sandbox、sandbox-seatbelt、sandbox-nono（含 macOS 真实 nono 14 个）、shell-tools 109（含 Seatbelt 与 nono 真实执行）、tools-runtime 47、runtime 84、agent-host 58、Desktop 2028 通过 / 7 跳过。
- 真实 Host 端到端（`apps/cli host serve` + 假模型服务，逐个批准）：nono 与 Seatbelt 两轮，工作区写入、`git status`、`pnpm --version` 成功；`~` 下写入、`ls ~/.ssh` 失败；后台 `sleep 300` 经 `task_stop` 停止后无残留进程；6 次审批 `noSandbox` 均为 `false`。
- Linux（Docker Desktop `node:22` arm64，内核 6.12，Landlock V6）：nono 拦截工作区外写入、凭据读取与网络；`tool` 沙箱报告不可用（`filesystem.write-deny=unsupported`），bash 资源 `noSandbox: true` 且无前缀授权；按沙箱内批准的调用被拒绝执行，按沙箱外批准的调用以 `sandbox=none` 完成。
- 打包：`ACTSPACE_MAC_ADHOC_SIGN=true ./scripts/release-package.sh`（在独立 worktree），包内 nono 为 0.80.0，保留上游 Developer ID 签名，`codesign --verify --strict` 通过；App ad-hoc 签名有效。

## 已知风险和遗留事项

- **Linux 上每次 bash 都要审批**：Landlock 不能在可写目录里挖出只读子目录，`.git/hooks`、`.git/config` 保护无法实现，`tool` 沙箱在 Linux 不可用。这是 T0 后用户确认的取舍；`full-access` 不受影响。Windows 同理，直到第三期。
- **沙箱内 `git push`、`gh` 失败**：nono 拦截钥匙串，需要 Agent 申请沙箱外执行（用户已接受）。
- **环境变量不过滤**：子命令仍能读到完整进程环境，与改动前一致。
- **Web 客户端审批卡不显示执行环境**：只覆盖了 Desktop 本机与远程 Host 审批。
- **nono 升级**：版本锁定 0.80.0；升级需重跑 sandbox-nono 真实测试与端到端检查。nono 0.80.0 的权限清单 `deny` 不生效，实现没有依赖它。
- **打包 worktree**：`../actspace-agent-sandbox-package`（detached `acc8483f`）保留着 ad-hoc 包供人工验证，不需要时用 `git worktree remove ../actspace-agent-sandbox-package` 删除。

## 后续建议

- 第二期：`purpose: evaluation` 模板、CLI 继承外层沙箱的启动参数、`network: allowlist` 与 nono `run` 模式。
- 第三期：Windows 原生后端。
- 环境变量白名单，单独立项。
