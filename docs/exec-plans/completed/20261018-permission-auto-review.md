# 会话查询授权与替我审批

状态：实现与自动化验证完成。用户于 2026-10-18 授权先落计划再执行；真实 Electron 代表路线已通过，商业 Provider 未覆盖，详见执行摘要。
分支：`codex/permission-approval-experience`。执行者：主 Agent；真实界面验收委派 gpt-6.1-sol。

## 目标与设计契约

降低重复查询的审批次数，并提供「替我审批」模式。插件只判断，Runtime 仍负责准入、执行和持久化。复用工具结果事件，不增加事件类型、数据库或审批后台。沙箱增强不在本次范围内。

1. 会话授权增加 ls/pwd/du/stat/file/cat/head/tail/wc/rg/grep 查询形式；Git 增加 ls-files/rev-list/rev-parse/remote -v/remote get-url/branch --list/tag --list；node/python/python3 仅版本查询。git -C 校验真实目录。显式读取路径和符号链接必须在工作区内；无法静态识别的参数、复合命令、执行型或写入型选项仍只有单次审批。已有会话绑定、恢复和撤销机制保持。
2. 新权限值 `auto-review`：硬拒绝优先，其次规则/会话授权，只有原本需要询问的请求调用插件。插件返回 `{approved: boolean, reason?: string | null}`；true 只授权当前调用，false/超时/异常/格式错误回到人工。取消、模式变化、资源变化使旧判断失效。
3. 插件获得固定审批规则、真实工作区/执行限制、用户任务和后续补充、对应助手提议、近期调用参数与状态，以及完整当前操作。原始用户授权与助手描述分开；工具正文和推理不进入上下文；上下文不全不能凭摘要推断授权。审批模型不调用工具。设置默认跟随当前主模型，可以选择已连接模型；指定模型不可用直接回人工。
4. 既有 `tool/result` 增加可选 `approvalMode`（auto/manual/session）和 `approvalReason`（可空）。记录实际准入路径；自动失败后人工允许记 manual。失败/取消也保留字段；旧事件无字段合法；字段不作为恢复授权依据。

## 必读与代码边界

读 AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、PLANS_GUIDE、CODING_BEHAVIOR、HISTORY_GUIDE、QUALITY_SCORE。前端读新功能清单、主题规范和 FRONTEND_VERIFICATION；后端读 agent-testing。

跨包契约和 UI 接线预计超过 8 个文件，这是完整数据链路所需；不顺带重构。

## 实施顺序与验证

- [x] P1 查询授权：`packages/tools/shell-tools/src/command-prefix.ts`、新路径检查模块、`plugin.ts`、对应测试；必要时调整 `packages/tools/runtime/src/permission/grants.ts` 的 git -C 规范化匹配。验证普通查询、未知选项、外部路径、链接、复合命令、版本命令及撤销回归。命令：`pnpm --filter @actspace/tools-shell-tools test`、`pnpm --filter @actspace/tools-runtime test`。
- [x] P2 契约：`packages/shared/src/runtime-v2/permission.ts`、`packages/tools/runtime/src/result.ts`、`packages/session/journal/src/core-codecs.ts`、`packages/session/projection/src/facts.ts`、`packages/core/agent-loop/src/loop.ts` 及工具投影增加模式与两字段。验证旧 journal、失败结果、实际路径与恢复；无新事件。
- [x] P3 插件：新增 `packages/auto-review/`，版本化 prompt、严格输出解析、无工具 LLM 调用。由 `packages/runtime/src/harness/default-harness-definition.ts` 注册，`agent-factory-plugin.ts` 注入上下文，`packages/tools/runtime/src/prepared-execution.ts` 在人工询问前调用并复验。验证 true/false/坏 JSON/超时/缺少插件/取消/权限变化/硬拒绝不调用模型。
- [x] P4 模型设置与 UI：复用 `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts` 和 `model-port.ts`、`model-runtime-service.ts` 的模型解析；设置契约/默认值/清洗/迁移增加自动审批模型；`TaskModelDefaultsSection.tsx` 增加选择；`PermissionModeControl.tsx` 与 IPC 接受新模式。现有工具展示透传两字段。验证设置保存、跟随主模型、指定模型失效、模式切换、历史展示。
- [x] P5 集成：`pnpm --filter @actspace/runtime... --filter @actspace/client... build`；相关包测试、Desktop typecheck 与定向测试；`pnpm check:docs`、`pnpm check:packages`、`pnpm check:frontend-theme`、`pnpm check:frontend-tokens`。新包更新 lockfile/build graph（如生成器要求）。记录已有失败和真实 Provider 未覆盖边界。
- [x] P6 文档：同步 execution-safety 权限设计、shell-tools README；写 history。按学习文档指南判断是否沉淀。更新过程/摘要并把计划移到 completed。

## Computer Use 验收

验收点：U1 三个权限模式显示与切换；U2 默认跟随/指定已连接模型保存；U3 查询首次 session 授权后同类调用免重复审批；U4 自动允许的工具结果显示实际模式/原因；U5 自动不允许或不可用回人工，人工决定后结果正确；U6 重载历史兼容；U7 浅深主题和窄窗口可读。

操作分组：设置路线覆盖 U1/U2/U7，保留选项和保存后截图；隔离测试会话连续执行查询和自动审批覆盖 U3/U4/U5，保留关键卡片及对应 journal 事实；重载路线覆盖 U6/U7。按验收点报告通过/失败/未覆盖，mock 不代替真实交互。

## 风险与回退

误识别参数回退为单次审批；模型任何不确定性回人工。自动审批不保证沙箱隔离。禁用插件或切回 default 即停止自动判断。代码回退仅撤销本分支相关修改；新增字段可选，旧数据不需要迁移。不得删除用户会话或覆盖无关修改。

## 执行记录

见 `docs/exec-runs/20261018-permission-auto-review/`。
