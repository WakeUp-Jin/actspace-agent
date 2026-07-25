# 2026-05-30 Context 缓存与 Usage 修复计划簇

## 目标

围绕「上下文的绝对控制 + DeepSeek 高缓存命中」这条产品主线，一次性收口三件互相关联的事：

1. 修复 Usage 统计里 Anthropic 风格 DeepSeek 的 token 语义错误（缓存 > 总计、命中+未命中 ≠ 输入）。
2. 给上下文管理引入缓存稳定性（cache stability）排序属性，让不易变内容稳定排在前面，提高 DeepSeek prefix-cache 命中率。
3. 把前端 Context 弹窗改成「配置驱动 + 可点击分段高亮」，新增一种上下文类型时只改配置不改组件代码。

三个子计划同属 context/usage 域，但可独立执行、独立验收。

## 入口关系

本目录是 `20260530-context-cache-and-usage` 的总索引，拆成 3 个子计划：

1. [`01-usage-anthropic-semantics-fix.md`](01-usage-anthropic-semantics-fix.md)：修 Anthropic usage 语义 + 去掉 Usage 页 4 张卡的英文副标题。
2. [`02-cache-first-stability-ordering.md`](02-cache-first-stability-ordering.md)：上下文缓存稳定性属性与系统提示词排序。
3. [`03-context-popover-config-driven.md`](03-context-popover-config-driven.md)：配置驱动、可点击分段高亮的 Context 弹窗。

## Required Reading

执行任一子计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`

按子计划补读：

- 任务 1：`docs/exec-plans/completed/20260529-deepseek-anthropic-service.md`、`docs/exec-plans/completed/actspace-usage-statistics-session-jsonl-plan.md`
- 任务 2：`/Users/wakeup-jin/Desktop/code-project/back-code/deepseek-reasonix-learing/docs/design-docs/reasonix-cache-first-architecture.md`、`docs/design-docs/agent-runtime/agent-current-module-map.md`（context 段）
- 任务 3：`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`docs/exec-plans/active/20260527-frontend-interaction-polish/03-context-readonly-popover.md`、`.agents/skills/frontend-design/SKILL.md`

## 总范围

包含：

- DeepSeek Anthropic usage 三段 token 合成，恢复 OpenAI 式不变量。
- Usage 页移除 `direct prompt / assistant reply / cache read / reasoning` 副标题。
- 上下文 `stability` 属性 + 系统提示词按稳定性排序 + 设计文档同步。
- Context 弹窗：单一 bucket 配置注册表、主题感知配色、点击分段高亮（bucket 级）。

不包含：

- 不回修已写入 `session.jsonl` 的历史 usage 事件（已决策只修源头）。
- 不在本计划簇生成 `ContextState.entries` 逐条预览（任务 3 v1 只做 bucket 级，不展示逐条内容）。
- 不改 DeepSeek OpenAI 格式 service 的 usage 语义（它本来就符合不变量）。
- 不实现 Context 条目增删改 / pin / remove。

## 并行边界

- 任务 1 owns `packages/agent-core/src/llm/anthropic-convert.ts` 的 `anthropicUsageToUsage` 与 `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx` 第 779-782 行。
- 任务 2 owns `packages/agent-core/src/context/types.ts`、`packages/agent-core/src/context/modules/system-prompt.ts`、`packages/agent-core/src/context/manager.ts` 的排序逻辑。
- 任务 3 owns 新增 `packages/shared/src/context-buckets.ts`、`packages/agent-core/src/context/token-estimator.ts` 的 bucket 构造、`packages/desktop/src/renderer/components/ContextPopup.tsx` 与对应 token CSS。
- 共享契约以 `packages/shared/src/session.ts`（`ContextUsageBucket` / `ContextUsageBucketName`）和新增的 `packages/shared/src/context-buckets.ts` 为准，任务 2、3 都不得各自发明 bucket key。

## 推荐推进顺序

1. 先做任务 1（纯 bug 修复，风险最低，单点改动 + 测试）。
2. 再做任务 2（后端上下文排序，影响缓存命中但不改前端契约）。
3. 最后做任务 3（依赖任务 2 的 bucket 语义已稳定，且需要先与用户对齐交互）。

## 总体验证方式

- 工程验证：`pnpm typecheck`、`pnpm --filter @actspace/agent-core test`、`pnpm --filter @actspace/desktop test`、`pnpm build`。
- 浏览器 mock：按 `docs/FRONTEND_VERIFICATION.md` 验证 Usage 页与 Context 弹窗的浅/深双主题与点击交互。
- 真实数据：用一次真实 DeepSeek（anthropic 格式）turn 验证 Usage 页「缓存 ≤ 总计」「命中 + 未命中 = 输入」恢复成立。

## 总进度记录

- [x] 完成 `01-usage-anthropic-semantics-fix.md`（三段 token 合成 + 4 卡副标题移除 + 测试）。
- [x] 完成 `02-cache-first-stability-ordering.md`（`CACHE_STABILITY` + 系统提示词/SystemPart 排序 + 测试 + 设计文档同步）。
- [x] 完成 `03-context-popover-config-driven.md`（共享 bucket 注册表 + 主题感知弹窗 + 点击交叉高亮 + 移除 footer + 测试 + 双主题截图验证）。
- [x] 三项完成后补 `docs/histories/` 记录（见 `docs/histories/2026-05/20260530-1057-context-cache-and-usage.md`）；本轮属 UI/语义打磨，未单独写 learnings。

## 决策记录

- 2026-05-30：任务 1 只修源头（`anthropicUsageToUsage`），不回修历史持久化 usage；旧统计仍会偏，接受。
- 2026-05-30：任务 2 新增独立 `stability` 字段（100 不变 ~ 10 常变），语义与既有 `priority` 分开，专门服务缓存前缀排序。
- 2026-05-30：任务 3 v1 只做 bucket 级 meter↔行双向交叉高亮（点击分段 → 高亮对应 bucket 行；反向亦然），不加汇总详情条（行旁已显示 token 数），并移除底部 footer（Total used / Compressed），默认不选中；逐条 entries 预览待后端补 `ContextState.entries` 后再做。
- 2026-05-30：任务 3 的 bucket 展示改为单一配置注册表驱动，新增上下文类型只改配置；本计划在「展示结构 / 配色 / 交互」上取代 `20260527-frontend-interaction-polish/03-context-readonly-popover.md` 的对应步骤。
- 2026-05-30：按用户明确要求，`ContextPopup` 改为**主题感知**浮层（浅色浅弹层 / 深色深弹层），并同步删除 `主题与配色规范.md` 里「ContextPopup 恒定深色」这条过期豁免；bucket 配色作为数据可视化色用 `--act-context-*`（浅/深各一套）。
