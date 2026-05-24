# actspace Bash 工具开发计划

## 目标

为 `actspace` 增加 Bash 工具本体：definition、权限检查、命令执行器、结果结构化和测试。Bash 工具应消费统一工具权限调度流程，但不直接实现审核 UI。

## 范围

- 包含：
  - Bash 工具 definition 和 description。
  - Bash 参数 schema：`command`、`cwd`、`timeoutMs` 等。
  - Bash `checkPermissions`：硬拒绝、只读识别、可审核风险识别、参数清洗。
  - Bash executor：非交互式执行、timeout、stdout/stderr/exitCode/duration/cwd。
  - Bash render result：给 LLM 的可读结果。
  - agent-core 单测。
- 不包含：
  - 前端 Bash 组件。
  - 审核面板样式。
  - approve/deny IPC。
  - 交互式 shell、pty、后台长任务。
  - 远程沙箱或容器隔离。

## 设计来源

- `docs/design-docs/agent-core/权限设计规则和原则.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-permission-scheduler-plan.md`
- `.agents/skills/llm-agent-dev/references/tools/bash-tool.md`
- `.agents/skills/llm-agent-dev/examples/bash-tool.ts`

## 相关代码路径

- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/tools/bash/definition.ts`（拟新增）
- `packages/agent-core/src/tools/tools/bash/executor.ts`（拟新增）
- `packages/agent-core/src/tools/tools/bash/permissions.ts`（拟新增）
- `packages/agent-core/src/tools/tools/bash/render-result.ts`（拟新增）
- `packages/agent-core/src/tools/test/` 或相邻测试目录
- `packages/shared/src/session.ts`

## Bash definition 规则

description 必须明确：

- Bash 用于执行开发验证、脚本和必要 shell 命令。
- 读文件优先用 Read。
- 搜索优先用 Search/Grep/Glob。
- 编辑优先用 Edit/Write。
- shell 状态不跨调用持久化，工作目录由 `cwd` 或调度上下文决定。
- 命令中带空格的路径必须引用。

## 权限检查规则

### 硬拒绝

- 空命令。
- 控制字符。
- Unicode 伪空白。
- 危险 `rm/rmdir`。
- 系统关键路径删除。
- 通配符删除。
- `eval/source/exec/builtin/fc/trap` 等 eval-like 调用。
- 不可安全解析的多段命令。

### 可直接执行

首版允许一组明确低风险开发命令：

- `pwd`
- `ls`
- `git status`
- `git diff`
- `node --version`
- `pnpm --version`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

具体 allowlist 需要按命令解析结果，而不是简单字符串包含。

### 需要审核

当统一调度流程支持 `ask` 后，以下命令可以进入审核：

- 安装依赖，例如 `pnpm install`。
- 运行未知脚本，例如 `pnpm run <script>`。
- 写入工作区的命令。
- 删除非关键路径但有副作用的命令。
- 网络访问命令。

在审核流程未接通前，`ask` 可以临时转为拒绝，并返回“需要权限审核模块”的结构化原因。

## executor 规则

- executor 只在权限通过后启动。
- 使用非交互式 shell。
- 不支持 stdin 交互。
- timeout 默认较短，最大值受权限检查清洗。
- 捕获 stdout、stderr 和 exitCode。
- 区分超时、非零退出码和 spawn 失败。
- 输出有 maxBuffer 限制。
- 不记录密钥和完整环境变量。

## 结果结构

Bash 结果至少包含：

- `command`
- `cwd`
- `stdout`
- `stderr`
- `exitCode`
- `durationMs`
- `timedOut`
- `permissionStatus`
- `riskReason`
- `truncated`

## 重点问题

1. 命令解析到什么程度？
   - 首版采用保守解析：能明确解析才 allow/ask，不能解析就 deny。
2. `cwd` 如何确定？
   - 默认 workspace root；允许工作区内 cwd；工作区外 cwd 拒绝。
3. `pnpm test` 这类命令是否可能有副作用？
   - 有可能，但作为开发验证命令首版可直接执行；后续可用配置调整。
4. 多段命令如何处理？
   - 每段都必须通过检查，任何一段不可判定则整体 deny 或 ask。

## 里程碑

1. 收敛参数和结果类型。
   - 验证：shared/agent-core 类型能表达 Bash 状态。
2. 实现 Bash definition。
   - 验证：工具注册后 LLM 可见 description。
3. 实现 `checkPermissions`。
   - 验证：单测覆盖硬拒绝、allow、ask、timeout 清洗。
4. 实现 executor。
   - 验证：单测覆盖成功、非零退出、timeout、maxBuffer。
5. 实现 render result。
   - 验证：LLM 上下文结果包含命令、cwd、exit code 和裁剪标记。
6. 注册工具并更新文档。
   - 验证：`createToolManager()` 注册 Bash，现有工具不回归。

## 验证方式

- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`
- 手动验证：
  - `pwd` 成功。
  - `pnpm typecheck` 可执行。
  - `rm -rf /` 硬拒绝。
  - 未知副作用命令在审核未接通前拒绝或 ask。
  - 超时命令返回 timedOut。

## 与其他计划关系

- 依赖 `actspace-tool-permission-scheduler-plan.md` 的权限结果和调度入口。
- 被 `actspace-bash-approval-ui-plan.md` 消费结果字段。
- 受 `actspace-tool-pause-session-boundary-plan.md` 约束：executor 只能在 approve 后启动。

## 进度记录

- [x] 定义 Bash 参数和结果结构。
- [x] 实现 Bash definition。
- [x] 实现 Bash permissions。
- [x] 实现 Bash executor。
- [x] 实现 Bash render result。
- [x] 注册工具并完成测试。

## 决策记录

- 2026-05-24：Bash 工具从 Bash UI 计划中拆出。原因是后端工具能力、权限检查和前端展示可以独立推进。
- 2026-05-24：Bash 权限检查保持在单个 `permissions.ts` 文件内，用私有函数分区组织。原因是权限逻辑较多但 Agent 读取单文件更直接。
- 2026-05-24：Bash 首版支持 `allow` 低风险开发命令、`deny` 硬拒绝危险命令、`ask` 返回结构化待审核结果；真实审核面板和恢复流程留给后续计划。
