## [2026-10-25 13:13] | Task: 沙箱第一期：地基 + 工具沙箱

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

按[第一期计划](../../exec-plans/completed/20261025-sandbox-v1-tool-sandbox.md)实现工具沙箱：沙箱做成可替换的 Harness 插件，地基一次打牢；macOS / Linux 用随应用打包的 nono（`wrap`）；沙箱缺失或不可用时转审批，不静默改为不加沙箱执行。

### 变更与动机

- **管理器与后端插件**：新增 `@actspace/sandbox`（契约、策略合并、按能力选后端、执行生命周期、继承模式）、`@actspace/sandbox-nono`、`@actspace/sandbox-seatbelt`。后端都不合格时管理器返回不可用，没有“不加沙箱的启动方式”这条路，静默降级在结构上就无法发生。
- **nono 的两种模式**：T0 实测发现 nono 0.80.0 权限清单的 `deny` 被忽略，Landlock 也无法在可写目录里设只读子目录。macOS 用 profile 模式，把 `.git` 禁止写入与凭据禁止读取写成 Seatbelt 规则；Linux 用拆分覆盖表达读取限制，并如实报告 `filesystem.write-deny=unsupported`，所以第一期 Linux 的 bash 走审批。
- **nono 分发**：锁定 0.80.0 四个平台并校验 SHA256，`release-package.sh` 打包时直接获取并保留上游签名；打包版只认随包程序，开发版认 `ACTSPACE_NONO_PATH` 或仓库副本。
- **Cordis 可选依赖**：准入原本不支持，新增 `optionalInjects`，要求与 `optional: true` 的契约一致。shell-tools 借此可选依赖 `sandbox`。
- **shell-tools**：权限阶段按 `sandbox.status("tool")` 决定 `noSandbox`。执行阶段只认批准时的选择：批准时有沙箱、执行时没有，返回 `SANDBOX_PREPARE_FAILED`，参数里夹带 `no_sandbox` 也不能绕过批准结果。删除旧的 `sandboxSpawn` / `probeSandbox`。
- **审批卡**：审批资源摘要带上 `noSandbox`，Desktop 本机与远程 Host 审批据此显示“沙箱 / 真实环境”。
- **顺带修复**：agent-host 的 CommonJS 包里 `import.meta.url` 为空，改由 CLI 传入仓库根目录；harness-control 测试夹具补 `optionalInjects`。

### 验证与边界

- `pnpm check:packages`、`check:desktop-build-graph`、`test:contract-matrix`、`typecheck`、`test` 通过；sandbox 系列、shell-tools 109（含真实 nono / Seatbelt）、Desktop 2028 通过。
- 真实 Host 端到端（nono 与 Seatbelt 各一轮）、Linux Docker（Landlock V6）检查、ad-hoc 打包与包内 nono 签名均通过，详见[执行摘要](../../exec-runs/20261025-sandbox-v1-tool-sandbox/execution-summary.md)。
- 未验证：Desktop 界面（审批卡显示、摘要、`latest-dev.log`）与打包版实机运行，留人工验收。
- 已知取舍：Linux、Windows 上每次 bash 都需审批；沙箱内 `git push` / `gh` 因钥匙串被拦截需申请沙箱外执行；环境变量仍完整继承；Web 客户端审批卡不显示执行环境。
