# 工具沙箱的出沙箱与回退

## 目标

bash 的沙箱行为和主流做法对齐，Agent 用得明白：
- `full-access` 下不进沙箱；
- 其他模式下每条命令默认进沙箱，Agent 用 `sandbox_permissions: "require_escalated"` 加 `justification` 申请出沙箱，每次都要批准，审批卡上显示理由；
- 命令被沙箱拦了，工具结果末尾告诉 Agent 可以申请；
- 评估沙箱里的候选仍标为 `inherited`。

设计见[沙箱设计](../../design-docs/execution-safety/agent-沙箱设计.md)第 9 节。

## 范围

- 包含：
  - `@actspace/tools-runtime`：提取资源的上下文加 `mode`。
  - `@actspace/sandbox`：继承模式下优先报告 `inherited`。
  - `@actspace/tools-shell-tools`：
    - 参数改为 `sandbox_permissions` 加 `justification`，删除 `requiredPermissions`；
    - 是否进沙箱的判断加上 `full-access`；
    - 工具描述与参数描述；
    - 被拦识别与提示，前台结果和后台任务通知都要；
    - 出沙箱申请的审批原因用 `justification`。
  - 审批卡显示理由：
    - `packages/client` 的 bash 卡片读出 `justification`；
    - `packages/shared` 的消息类型加字段；
    - Desktop `BashRunBlock` 的审批卡显示理由。
  - 文档：执行安全入口的“Bash 当前边界”、`docs/SECURITY.md` 的 Bash 边界、`packages/tools/shell-tools/README.md`、沙箱设计的状态。
- 不包含：
  - 出沙箱的批准记住（会话内同一条命令、前缀规则），S4 选了只对这一次有效。
  - 自动弹窗“失败了，要不要沙箱外重跑”。
  - 系统写入组（S5 不动）。
  - 文件读写工具进沙箱。
  - Linux、Windows 的工具沙箱可用性：Linux 仍因 `filesystem.write-deny` 不支持而走审批。
  - Web 客户端审批卡显示理由：Web 审批卡本来就不显示执行环境，属于同一笔欠账，不在这轮做。
  - 系统提示词：只改工具描述与参数描述，和现有 bash 指引的位置一致。

## 背景

- 相关文档：
  - [沙箱设计](../../design-docs/execution-safety/agent-沙箱设计.md)第 9 节（本计划的依据）、4.5、4.6。
  - [权限模型](../../design-docs/execution-safety/agent-tool-permission-model.md)、[执行安全入口](../../design-docs/execution-safety/README.md)“Bash 当前边界”。
  - 第一期、第二期执行摘要：`docs/exec-runs/20261025-sandbox-v1-tool-sandbox/`、`docs/exec-runs/20261025-sandbox-v2-evaluation-sandbox/`。
- 相关代码路径：
  - `packages/tools/shell-tools/src/plugin.ts`：工具定义 `TOOL_DEFINITIONS`；`permissionContract`，其中 `extractResources` 算 `noSandbox`，`evaluate` 返回 deny / ask / allow，`suggestGrants` 只对沙箱内命令给前缀授权。
  - `packages/tools/shell-tools/src/node-ports.ts`：
    - `admittedNoSandbox`：执行端只认批准时的 `noSandbox`，没有批准记录时回落到参数；
    - `sandboxedRequest`：工具沙箱的可写路径；
    - `foreground`：前台结果与摘要 `sandboxed=…, sandbox=…`；
    - 后台任务的 `terminal()`：结束通知。
  - `packages/tools/runtime/src/permission/types.ts`（`ResourceExtractionContext`）、`packages/tools/runtime/src/prepared-execution.ts`：两处 `extractResources` 调用，`mode` 在两处都能拿到；审批等待期间模式变化会以 `PERMISSION_STATE_CHANGED` 结束。
  - `packages/sandbox/manager/src/execution.ts`：`isolation` 的计算。现在请求为 `none` 时优先报 `none`。
  - `packages/client/src/sessions/tool-card.ts`：bash 卡片从参数读 `intent`、`command`。`packages/shared/src/session.ts` 是 bash 消息类型。`apps/desktop/src/renderer/components/messages/BashRunBlock.tsx` 的 `BashApprovalBlock`、`BashApprovalEnvironment` 是审批卡。
  - 测试：
    - `packages/tools/shell-tools/src/test/{lifecycle,node-ports}.test.ts` 里有 `requiredPermissions: ["no_sandbox"]` 的用例；
    - `apps/cli/src/test/sandbox-inherited.test.ts` 要求 `full-access` 加继承模式时标 `inherited`。
- 调研结论（2026-10-25，源码在 `tmp/reference-checkouts/{codex,opencode}` 与 `tmp/deepseek-harness`，Cursor 只看了官方文档与员工帖子）：

  | | Codex | Cursor | DSH | OpenCode |
  |---|---|---|---|---|
  | 进沙箱 | 受限模式下每条命令都进；完全放开时不进 | 默认模式下 shell 尽量进；白名单命令不进；“全部放行”不进 | 每条 bash 加文件写入都进；完全放开时不进 | 没有系统级沙箱，只有按命令的允许/询问/拒绝规则 |
  | 出沙箱参数 | `sandbox_permissions: "require_escalated"` + `justification`（+ `prefix_rule`） | `required_permissions: ["all"]` | `sandbox_permissions`（模式名）+ 必填 `justification` | 无 |
  | 识别被拦 | 排除退出码 2/126/127，扫关键词 | 结果里写出是哪条沙箱限制 | 按后端的 stderr 特征串，单独区分沙箱没启动 | — |
  | 回退 | 默认交给模型重试，最严模式才自动弹窗 | 提示模型申请，模型重试，分类器或用户审批 | 结果末尾加提示，模型重试一次，必须批准 | — |
  | 记住批准 | 会话内同一条命令；跨会话前缀规则 | 命令白名单 | 不记住 | 前缀“总是允许” |

- 已知约束：
  - 执行端只认批准时的 `noSandbox`（第一期的约束），这次不改。
  - 工具沙箱网络不限，所以被拦的主要是写入与钥匙串。
  - 改工具定义会改变 definition digest；没有持久授权依赖它，前缀授权按 `grantAudience` 走。

## 任务

### T0 实测拦截特征

- 在 `tmp/sandbox-escape-spike/` 用第一期的策略生成（`resolvePolicy` + 后端 `prepare`）分别跑 nono 与 Seatbelt，记录退出码、stdout、stderr。场景：
  1. 写工作区外：`touch ~/x`；
  2. 写 `.git/hooks/x`；
  3. 包缓存写在工作区外：`npm cache add`，或 `pnpm` 的 store 指向 `~`；
  4. 钥匙串：`git credential-osxkeychain get`、`security find-generic-password`；
  5. 对照组：命令自己的 `permission denied`，比如 `cat` 一个 `chmod 000` 的工作区文件；
  6. 对照组：找不到命令，以及用法错误。
- 产出特征串清单与退出码规律，写进执行过程，决定 T3 的匹配规则。钥匙串如果没有稳定的特征，就只在提示文案里提到它，不做专门匹配。

### T1 tools-runtime 与管理器

- `ResourceExtractionContext` 加 `mode: PermissionMode`，`prepared-execution.ts` 两处调用都传入。
- `execution.ts`：继承模式下 `isolation` 优先为 `inherited`，请求为 `none` 时也一样。
- 测试：
  - tools-runtime：`mode` 传到 `extractResources`；
  - 管理器：继承模式加 `isolation: "none"` 时报告 `inherited`。

### T2 shell-tools 参数与进沙箱判断

- schema 删除 `requiredPermissions`，加入：
  - `sandbox_permissions`：enum `["require_escalated"]`；
  - `justification`：字符串，1–200 字；
  - 两个参数的描述按设计第 9 节写。
- bash 工具描述补一句沙箱的范围。
- `extractResources` 中 `noSandbox = mode === "full-access" || 申请了出沙箱 || 沙箱不可用`。
- `evaluate`：
  - 只给 `sandbox_permissions`、没给 `justification`，或者反过来，都返回 `deny`，错误码 `BASH_ESCALATION_INVALID`；
  - 申请出沙箱时，ask 的原因用 `justification`；
  - `full-access` 仍然直接放行。
- `admittedNoSandbox` 的参数回落改读 `sandbox_permissions`。
- `node-ports.ts:69` 的提示文案改为新参数名。
- 测试：
  - `full-access` 时 `noSandbox: true`；
  - 申请出沙箱时 `noSandbox: true`，并且没有前缀授权建议；
  - 只给一个参数时 deny；
  - 审批原因是 `justification`；
  - 旧参数被 schema 拒绝；
  - 继承模式加 `full-access` 时，摘要为 `sandbox=inherited`（CLI 测试原样通过）。

### T3 被拦识别与提示

- `node-ports.ts` 加 `sandboxDenial(status, output)`。判定条件：
  - `isolation === "sandboxed"`；
  - 退出码不为 0、不为 null，不在 2、126、127 之中；
  - 输出（前台用输出文件末尾，后台用通知末尾）小写后命中特征串。特征串放在 shell-tools 里，按 T0 的结果写，不区分后端。
- 前台：命中时，在 `modelOutput` 的摘要之后追加一行提示。摘要本身不变，界面上的退出码和环境标记也不变。
- 后台：`terminal()` 命中时，在 `summary` 后追加同一行提示。
- 提示文案（英文，给模型看），大意：“这条命令在沙箱里运行，输出像是被沙箱拦了；如果它确实需要写工作区外或用钥匙串，就用同一条命令带 `sandbox_permissions: "require_escalated"` 和一句 `justification` 重试一次，会请求用户批准；不该需要这些权限就换做法。”
- 测试：
  - 假沙箱：命中、退出码 2/126/127 不命中、`sandboxed=false` 不命中、退出码 0 不命中、后台通知命中；
  - 真实执行：macOS 上 nono 与 Seatbelt 各写一次工作区外，结果带提示。

### T4 审批卡显示理由

- `packages/shared/src/session.ts` 的 bash 消息加 `justification?: string`。`tool-card.ts` 从参数读出它；`stream-blocks.ts`、`session-selectors.ts` 透传。
- `BashApprovalBlock`：有 `justification` 时，在命令下面显示一行理由，样式沿用卡片里的次要文字，不加新组件。执行后的 `BashExecutionBlock` 不显示。
- 测试：client 的卡片投影；renderer 审批卡有理由时显示、没有时不显示。

### T5 生成物、检查与文档

- 执行安全入口“Bash 当前边界”、`docs/SECURITY.md`、`packages/tools/shell-tools/README.md` 改为新行为。沙箱设计状态改为“已实施”，第 8 节补 T0 的实测结论。
- `pnpm test:contract-matrix`。工具定义变了，如有 snapshot 一并更新。
- history、执行摘要、计划移到 `completed/`。

### T6 端到端

- 第一期的 Host 端到端脚本（`tmp/sandbox-v1-e2e/host-e2e.mjs`）加三项：
  1. `default` 模式下模型先在沙箱里写 `~` 被拦，结果带提示；再带参数重试，审批的进程资源 `noSandbox: true`，原因是 `justification`；批准后成功，摘要 `sandbox=none`。
  2. `full-access` 下同一条命令直接成功，摘要 `sandbox=none`。
  3. 只给一个参数时被拒绝，并且没有弹审批。
- 第二期 harness-evaluation 集成测试复跑：候选 Bash 仍为 `inherited`。

## 依赖与顺序

T0 → T1 → T2 → T3 → T4 → T5 → T6。T4 只依赖 T2 的参数名，可以和 T3 并行。

## 风险

- **误判**：命令自己报 `permission denied` 也会带上提示，模型可能多申请一次出沙箱。缓解：只在沙箱内、退出码不在排除列表时匹配；提示里写明“不该需要这些权限就换做法”；每次都要用户批准。
- **模型一上来就申请出沙箱**（Cursor 的已知问题）：缓解：参数描述写明先在沙箱里跑。T6 之后观察实际申请频率，必要时收紧描述。
- **`full-access` 不进沙箱，保护变弱**：这是 S1 的取舍。`full-access` 本来就自动批准出沙箱，原来的保护主要来自“先失败一次”。
- **钥匙串没有稳定的特征串**：T0 决定。没有的话只在提示与描述里点名 `git push` / `gh`。

## 回退

每个任务单独提交。
- T1 只做加法。
- T2 是行为变化：回退时恢复 `requiredPermissions` 与原来的 `noSandbox` 计算。
- T3、T4 只是追加提示和显示，回退不影响执行。

## 验证方式

- 命令：
  - 包测试：`pnpm --filter @actspace/tools-runtime test`、`pnpm --filter @actspace/sandbox test`、`pnpm --filter @actspace/tools-shell-tools test`（设 `ACTSPACE_NONO_PATH` 跑真实用例）、`pnpm --filter @actspace/client test`、`pnpm --filter @actspace/agent-cli test`、`pnpm --filter @actspace/harness-evaluation test`、Desktop renderer 相关测试；
  - 全仓：`pnpm check:packages`、`pnpm test:contract-matrix`、`pnpm typecheck`、`pnpm test`。
- 手工检查：T6 的端到端；Desktop 审批卡显示理由与“真实环境”，留给用户在 Electron 里看。
- 观测检查：工具结果摘要的 `sandboxed=…, sandbox=…`；审批请求的进程资源 `noSandbox` 与原因。

## 进度记录

- [x] T0 实测拦截特征（结论见执行过程步骤 1）
- [x] T1 tools-runtime 与管理器
- [x] T2 shell-tools 参数与进沙箱判断
- [ ] T3 被拦识别与提示
- [ ] T4 审批卡显示理由
- [ ] T5 生成物、检查与文档
- [ ] T6 端到端

## 决策记录

- 2026-10-25：调研 Codex、Cursor、DSH、OpenCode 后用户确认：
  - S1：`full-access` 下 bash 不进沙箱。
  - S2：出沙箱参数照 DSH、Codex 改写，带 `justification`。
  - S3：被沙箱拦了在结果里提示。
  - S4：批准只对这一次有效。
  - S5：系统写入组不动。
- 2026-10-25：实现细节按建议确认：
  - 参数名 `sandbox_permissions: "require_escalated"`，删除旧参数，不保留兼容；
  - `full-access` 或沙箱不可用时参数不起作用、不报错；
  - 特征串先实测再定，后台通知同样提示；
  - 继承模式标记优先；
  - 切换模式从下一条命令起生效。

- 2026-10-25：T0 后确定匹配规则：特征串 `operation not permitted`、`eperm`（不含 `permission denied`，它是命令自己的权限错误）；钥匙串不做匹配，在描述里点名 `git push`（HTTPS）与 `gh`。

## 执行模式

- **交互模式**：改动权限判断与工具定义，T0 的结论会决定 T3 的匹配规则。

## 执行文档

执行开始时创建 `docs/exec-runs/20261025-sandbox-escape-fallback/`（从 `docs/exec-runs/templates/` 复制）：
- `execution-process.md`；
- `execution-summary.md`。
