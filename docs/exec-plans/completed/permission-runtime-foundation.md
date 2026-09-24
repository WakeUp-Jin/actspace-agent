# Permission Runtime 基础切换

> 状态：completed
>
> 执行模式：交互模式
>
> 设计事实源：[`agent-tool-permission-model.md`](../../design-docs/execution-safety/agent-tool-permission-model.md)

## 目标

把当前 `default/trusted/yolo + continue/require-approval/deny + allow/deny` 权限路径直接替换为 `default/full-access + pass/ask/deny + once/deny`。完成结构化文件与进程资源、敏感分类、审批前全局边界、审批后重检、严格权限 Journal 事件以及 Desktop/CLI Host 适配。本计划完成后系统独立可用，但不提供 Session Grant。

## 范围

包含：

- `PermissionMode = default | full-access`；
- PermissionEngine、ModeResolver、GlobalBoundaryEvaluator 和 DecisionCombiner；
- `ToolPermissionContract` 与结构化 file/process resource；
- 文件 canonicalization、敏感分类和 syscall 前复验；
- OnceApproval、十分钟审批超时和防重放；
- `permission/mode-set`、`permission/asked`、`permission/decided`、`permission/scope-denied` strict codec；
- Desktop 与 CLI 的 `once/deny` 审批；
- 删除旧权限模式、类型、分支、事件 codec 和 UI 归一化；
- 文档、history、发布影响和源码/产物扫描。

不包含：

- Session Grant；
- project 或用户级 Grant；
- Bash command pattern、AST 扩展或 Session 授权；
- Browser/Network Grant；
- 跨平台 sandbox；
- 旧权限 API、旧事件或历史 Session 迁移。

## 背景

相关文档：

- `docs/design-docs/execution-safety/agent-tool-permission-model.md`
- `docs/design-docs/execution-safety/README.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-boundary.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`

相关代码路径：

- `packages/shared/src/runtime-v2/`
- `packages/tools/approval/src/`
- `packages/tools/runtime/src/`
- `packages/tools/core-tools/src/`
- `packages/session/journal/src/`
- `packages/session/projection/src/`
- `packages/runtime/src/runtime/`
- `apps/desktop/src/main/runtime-v2/`
- `apps/desktop/src/renderer/`
- `apps/cli/src/`

已知约束：

- 当前 policy 在结构化资源检查前进入审批，必须调整顺序；
- `resolveResourcePaths()` 只有字符串路径，不能表达 access、target kind 或 process resource；
- 当前 CLI `trusted/yolo` 会自动批准，必须直接删除；
- 当前 Desktop 把 `allow_similar` 归一化为普通 allow，必须直接删除；
- 旧 permission 事件不再兼容，受影响历史 Session 可以 browse-only；
- Tool executor 的成功/失败行为、artifact 和有序提交语义必须保持 parity。

## 风险

- 风险：调整 prepared execution 顺序可能改变工具是否进入 checkpoint。
  缓解：用 contract test 固定 denied/not-started、checkpoint 和 outcome-unknown 边界。
- 风险：路径规范化与 executor guard 漂移造成审批范围和真实写入范围不同。
  缓解：PermissionEngine 与 Host guard 复用同一 canonicalization 结果和 re-check 函数。
- 风险：直接删除旧事件后历史 Session 无法继续执行。
  缓解：明确接受 browse-only，不做隐式降级执行，并在 release/history 中记录。
- 风险：Desktop Renderer 改动违反主题规范。
  缓解：实施前重读主题文档，浅色、深色和跟随系统三态验收。
- 风险：回滚到旧二进制后，新权限事件不可执行恢复。
  缓解：保留 Journal 原文件；回滚版本仅允许浏览受影响 Session，新建 Session 执行。

## 任务

### P1：公共合同与直接切换

修改：

- `packages/shared/src/runtime-v2/`：新增 mode、资源摘要和 Host capability DTO；
- `packages/tools/approval/src/approval-port.ts`：替换为新版 request/decision；
- `apps/cli/src/types.ts`、`apps/cli/src/runtime-v2/types.ts`、`apps/cli/src/args.ts`：只接受 `default/full-access`，并区分显式 mode 与默认 mode。

验收：

- `trusted/yolo` 在类型、CLI help、parser 和构建产物中消失；
- 旧 `allow | deny` decision 无生产引用；
- CLI 对旧 mode 返回稳定 usage error，不做映射。

### P2：PermissionEngine 与 prepared execution 顺序

修改：

- 在 `packages/tools/runtime/src/permission/` 建立纯决策、模式解析、资源匹配、敏感分类和 OnceApproval；
- `registry.ts` 接收 `ToolPermissionContract`，删除 `resolveResourcePaths()`；
- `prepared-execution.ts` 按设计顺序完成资源提取、全局边界、工具策略、决策合并、审批和重检；
- 将现有 core guard 拆成审批前 admission 与 syscall 前 enforcement re-check，共享 canonicalizer。

验收：

- 完整决策矩阵单测通过；
- deny 不进入 ApprovalBroker；
- scope ask 与 tool ask 合并为一次请求；
- 迟到、重复、过期和 requestId 不匹配的 decision 都不能执行；
- approval 后 mode、路径、lease、Host ceiling 或 abort 变化都 fail-closed；
- checkpoint 前拒绝报告 not-started，checkpoint 后未知结果仍为 outcome-unknown。

### P3：核心文件工具和 Bash 接入

修改：

- `packages/tools/core-tools/src/plugin.ts` 为文件和 Bash 注册结构化 permission contract；
- 文件工具实现 exact resource、missing target、symlink 和非普通文件规则；
- 敏感分类覆盖 protected、once-only 和 normal；
- delete 与 Bash 只支持 once；
- Bash 保留当前 hard reject，不增加语法能力，也不让 `full-access` 改变 sandbox。

验收：

- workspace 内 read/write/edit 在 default 自动执行；
- workspace 外文件在 default 询问，在 full-access 只受工具风险和敏感规则约束；
- `.env` 等只提供 once；
- Host-only credential、SSH 私钥、浏览器凭据和文件工具写 `.git/**` hard deny；
- Bash 不生成 Session suggestion，不批准外部目录。

### P4：严格 Journal 事件与 Session mode

修改：

- `packages/session/journal/src/` 增加四个新权限事件的 strict codec；
- 删除旧 `approval/asked`、`approval/decided`、`approval/policy`、`permission/preset` 当前 codec；
- `packages/session/projection/src/` 投影最后一个有效 PermissionMode；
- `packages/runtime/src/runtime/` 把 Session mode、agent identity 和 Journal permission port 注入 Tool Environment。

验收：

- 新 Session 默认 `default`；
- resume 未显式指定 mode 时恢复 Journal mode；
- 显式 mode 产生 `permission/mode-set`；
- mode 切换使待审批和未消费 OnceApproval 失效；
- malformed 或 higher-version required permission event 使执行恢复 fail-closed；
- 旧权限事件没有生产 writer 或 codec。

### P5：Desktop 与 CLI Host 切换

修改：

- Desktop main approval broker、typed IPC 和 Renderer approval view 使用新版 DTO；
- 第一阶段隐藏/删除 `allow_similar`，只显示 once/deny；
- Desktop 增加 `default/full-access` 用户入口和 mode change IPC；
- CLI approval adapter 只显示 once/deny；非交互 ask 返回 `APPROVAL_REQUIRED`；
- CLI JSON/JSONL 输出使用新 mode 值。

验收：

- Renderer 不能提交路径、pattern、lifetime 或任意 decision code；
- Desktop/CLI 对同一 once 请求具有一致 Runtime 结果；
- `full-access` 不自动批准 Bash 或 delete；
- timeout、abort、broker unavailable 和 invalid decision 使用稳定 code；
- Desktop 浅色、深色和跟随系统模式没有重叠、溢出或非主题色。

### P6：全仓收口

修改：

- 删除旧类型、测试 fixture、帮助文案和死分支；
- 更新 execution-safety、CLI、Desktop 和 release-facing 文档；
- 新增一份 history；
- 扫描 `src`、`dist` 和 CLI help，确保旧符号不可达。

验收：

- `trusted`、`yolo`、`allow_similar`、旧 approval decision 和旧 permission event 无生产命中；
- 现有工具 executor parity tests 不因权限外壳切换发生无说明变化；
- 文档门禁通过。

## 验证方式

按依赖顺序执行：

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/tools-approval test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/tools-core-tools test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm check:docs
pnpm check:current-docs
```

真实进程检查：

- CLI default workspace 内文件成功；
- CLI default workspace 外 ask 在非交互模式稳定失败；
- CLI full-access 仍不自动批准 Bash；
- `--permission-mode trusted|yolo` 返回 usage error；
- JSON/JSONL stdout 不被审批提示污染。

Desktop 人工检查：

- default/full-access 切换；
- workspace 内外读写；
- delete/Bash once；
- protected 与 once-only 资源；
- reload、Session 切换、abort、timeout；
- 浅色、深色、跟随系统三态。

不在本计划宣称通过：Windows/Linux sandbox、真实 Browser、DMG、签名和 notarization。

## 回滚

- 代码可以回滚到计划实施前 revision；
- 不删除或重写已产生的 Session Journal；
- 含新 required permission event 的 Session 在旧版本只允许 browse-only；
- 不提供把新 permission event 降级为旧 approval event 的脚本；
- 回滚后需要执行任务时创建新 Session。

## 进度记录

- 2026-09-23 21:43 CST：开始交互模式执行；已复核设计、Tool Runtime、Session codec、Desktop/CLI Host 边界与测试规范。
- 2026-09-23 23:15 CST：P1-P6 实施与自动化验证完成；真实 Electron 主题矩阵、真实 Browser、跨平台 sandbox、DMG、签名和 notarization 保留为人工或独立计划边界。
- [x] P1 公共合同与直接切换。
- [x] P2 PermissionEngine 与执行顺序。
- [x] P3 核心文件工具和 Bash 接入。
- [x] P4 Journal 与 Session mode。
- [x] P5 Desktop/CLI Host 切换。
- [x] P6 全仓验证、文档与 history。

## 决策记录

- 2026-09-23：选择直接切换，不保留旧 mode、approval decision、事件 codec、alias 或迁移脚本。
- 2026-09-23：权限引擎属于 Tool Runtime 外壳，不新增 package 或第二个 Runtime Service。
- 2026-09-23：本计划只交付 once；Session Grant 由独立计划在基础切换完成后增加。

## 执行文档

执行开始时创建：

- `docs/exec-runs/permission-runtime-foundation/execution-process.md`
- `docs/exec-runs/permission-runtime-foundation/execution-summary.md`
