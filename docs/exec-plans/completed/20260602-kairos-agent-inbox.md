# Kairos Agent 文件收件箱执行计划

状态：已完成（2026-06-02）

## 目标

为 Kairos 增加一套极简 Agent 间文件通信机制：Main Agent 和 Lab Agent 分别把希望 Kairos 后台观察、归纳或提醒的内容追加到一份 Markdown 收件箱文件；Kairos 每次 tick 都读取这些文件，把它们作为主动运行时的输入信号。该计划先保持 V0 简洁，不引入消息总线、数据库、复杂状态机或跨 Agent 实时对话。

## 范围

- 包含：
  - 在 `<userData>/kairos/inbox/` 初始化两份 Markdown 文件：`main-agent.md` 和 `lab-agent.md`。
  - 在 Kairos prompt assembly 中读取这两份 inbox，并把精简内容注入 system prompt 的观测段。
  - 更新 `KAIROS_SYSTEM_PROMPT`，要求 Kairos 每次 tick 先查看 inbox，并只把 inbox 当作待观察信号，不把它当作用户直接命令。
  - 定义 Main Agent / Lab Agent 向 inbox 追加消息的 Markdown 格式和最小写入入口。
  - 为 inbox loader、prompt 拼接和空文件 / 长文件截断补单测。
  - 更新相关设计文档、history 和验收记录。
- 不包含：
  - 不实现双向实时通信、WebSocket、IPC 消息总线或跨 Agent 直接聊天。
  - 不让 Kairos 自动晋升 Lab 能力、不自动修改主 Agent 默认能力池。
  - 不在 V0 中实现 per-message 精确消费状态、锁文件、ack 回执或 inbox 索引数据库。
  - 不把 inbox 内容写入主 Agent session，也不让 Main Agent 每轮自动读取 Kairos 的短期记忆。
  - 不为 Main Agent / Lab Agent 新增复杂工具集；V0 只需要稳定的本地追加写入入口。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
  - `docs/design-docs/lab/lab-runtime-architecture.md`
  - `docs/design-docs/lab/lab-product-design.md`
  - `docs/design-docs/core-storage-and-observability.md`
- 相关代码路径：
  - `packages/desktop/src/main/kairos-bootstrap.ts`
  - `packages/desktop/src/main/agent-turn.ts`
  - `packages/agent-core/src/kairos/prompt.ts`
  - `packages/agent-core/src/kairos/prompt-assembler.ts`
  - `packages/agent-core/src/kairos/controller.ts`
  - `packages/agent-core/src/kairos/context/sessions-digest.ts`
  - `packages/agent-core/src/kairos/briefs/*`
  - `packages/agent-core/src/kairos/storage/*`
  - `packages/shared/src/kairos-contracts.ts`
- 已知约束：
  - Kairos 是主动运行的后台 Agent，Main Agent 和 Lab Agent 是 inbox 的写入方，Kairos 是主要消费者。
  - renderer 不能直接访问文件系统，所有写入都应由 main / agent-core 侧完成。
  - Kairos 默认只能读写 `<userData>/kairos/workspace/`，但 inbox 属于 Kairos 自身运行数据，应由 controller / prompt assembler 直接读，不通过 LLM 文件工具绕行。
  - inbox 是给 Kairos 的观察信号，不是短期记忆事实源；Kairos 的行动事实仍写入 `memory/short-term/*.jsonl`。

## 文件布局

目标目录：

```text
<userData>/kairos/
  inbox/
    main-agent.md
    lab-agent.md
```

默认文件内容由 bootstrap 幂等创建：

```markdown
# Main Agent -> Kairos Inbox

Main Agent can append observations, repeated failures, user preferences, or Lab candidates here for Kairos to inspect during future ticks.

## Pending
```

`lab-agent.md` 同理，只把标题和说明换成 Lab Agent。V0 文件只保留 `## Pending` 区，所有自动写入都追加到文件末尾；如果未来需要人工整理 `Processed` 区，应另开升级计划，避免 V0 的 append-only 写入和 read-modify-write 插入策略混在一起。

## 消息格式

写入方追加到文件末尾（也就是 `## Pending` 区下方），推荐格式：

```markdown
### 2026-06-02T11:50:00+08:00 | priority: normal | topic: 前端验证反复失败

- from: main-agent
- relatedSessionId: session_xxx
- relatedExperimentId: none
- workspaceRoot: /path/to/workspace

Main Agent 最近在桌面端前端验证时多次卡在浏览器 mock。
请 Kairos 后续观察是否这是重复能力缺口；如果是，可以建议创建 Lab 实验。
```

字段约定：

| 字段 | 必填 | 说明 |
|---|---|---|
| 时间戳 | 是 | 标题中的 ISO 时间，用于 Kairos 判断新近程度 |
| `priority` | 是 | `high` / `normal` / `low`，只作为 LLM 软提示 |
| `topic` | 是 | 单行主题，供摘要和检索 |
| `from` | 是 | `main-agent` 或 `lab-agent` |
| `relatedSessionId` | 否 | 与某个主会话相关时填写 |
| `relatedExperimentId` | 否 | 与某个 Lab 实验相关时填写 |
| `workspaceRoot` | 否 | 与某个 workspace 相关时填写 |
| 正文 | 是 | 说明希望 Kairos 观察、归纳、提醒或后续建议的内容 |

## 风险

- 风险：Markdown 文件长期累积导致 prompt 膨胀。
  - 缓解方式：inbox loader 每份文件最多注入最近 8 条消息，单文件预算 1800 字符；两份 inbox 合并后的总预算 3000 字符，并以截断说明结束。
- 风险：写入方把 inbox 当成强命令，导致 Kairos 误做高风险动作。
  - 缓解方式：system prompt 明确 inbox 是观察信号；涉及写代码、运行命令、修改能力池、晋升 Lab 产物时仍需遵守原权限和评审边界。
- 风险：两个 Agent 同时追加造成覆盖。
  - 缓解方式：V0 写入入口使用 append-only 文件追加，不做 `## Pending` 中间插入，也不自动移动消息到 `Processed`。出现并发或整理需求后，再引入原子追加、轻量锁或 JSONL。
- 风险：用户手工编辑 Markdown 后格式不完全规范。
  - 缓解方式：loader 不做严格结构解析，只提取最近标题块和正文片段；格式异常仍作为普通文本注入。
- 风险：Lab Runtime 尚未实现，`lab-agent.md` 暂时没有真实自动写入方。
  - 缓解方式：先完成文件初始化和 Kairos 读取，Lab 写入入口等 Lab Runtime / IPC 落地时接入。

## 里程碑

1. 存储初始化与 loader
   - 在 Kairos bootstrap 中幂等创建 `<kairosRoot>/inbox/main-agent.md` 和 `<kairosRoot>/inbox/lab-agent.md`。
   - 新增 `packages/agent-core/src/kairos/inbox.ts`，提供 `loadKairosInboxSummary()` 和 `appendKairosInboxMessage()`；loader 读取两份 Markdown，按最近 8 条 / 单文件 1800 字符 / 总计 3000 字符预算保留内容。
   - 验证：空文件、缺文件、长文件、格式异常都不会让 Kairos tick 崩溃；默认文件不包含 `## Processed`。

2. Prompt assembly 接入
   - 在 `prompt-assembler.ts` 中把 inbox 摘要并入观测输入。
   - System Prompt 段保持 6 段结构，优先把 inbox 归入 [5] 观测摘要段，避免新增一个大段造成上下文复杂度膨胀。
   - `OBSERVATION_TOKEN_BUDGET` 从 800 调整到 1200，内部再分配 watch diff、sessions digest 和 inbox 摘要预算，避免 inbox 把其它观测完全挤掉。
   - 验证：prompt assembler 单测断言 main/lab inbox 内容会出现，且长内容会截断；watch diff、sessions digest 仍保留占位或摘要。

3. Kairos 核心提示词更新
   - 在 `prompt.ts` 中补规则：每次 tick 先查看 Agent inbox；只处理与后台观察、提醒、Lab 候选、重复失败有关的高信号内容。
   - 明确 inbox 不等于用户当前输入；Kairos 不应因为 inbox 内容自动执行高风险动作。
   - 验证：prompt 快照或字符串单测覆盖 inbox 规则。

4. 写入入口
   - `appendKairosInboxMessage({ kairosRoot, source, priority, topic, body, relatedSessionId?, relatedExperimentId?, workspaceRoot?, now? })` 是唯一写入入口；`source: "main-agent"` 写 `main-agent.md`，`source: "lab-agent"` 写 `lab-agent.md`。
   - Main Agent V0 不做 LLM 自由自动写入；只在后端检测到明确的结构化触发点时调用：用户显式要求“让 Kairos 后续观察/提醒”、重复失败检测器产出稳定信号、或未来 Lab 候选入口显式提交。
   - Lab Agent / Lab Runtime V0 只预留同一函数入口；Lab Runtime 尚未落地前不新增自动写入链路。
   - 验证：写入函数单测覆盖字段转义、缺省字段、来源路由、append 顺序和并发下不覆盖已有内容。

5. 文档与收尾
   - 更新 `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`。
   - 更新 `docs/design-docs/core-storage-and-observability.md` 的 Kairos 目录树与存储边界，加入 `<userData>/kairos/inbox/`。
   - 根据实现结果补 `docs/design-docs/lab/lab-runtime-architecture.md` 中 Lab 与 Kairos 的通信说明。
   - 记录 history；如果行为对用户可见，再补对应 UI / 验收说明。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core exec vitest run src/kairos`
  - `pnpm --filter @actspace/desktop exec vitest run src/main/test`
  - `pnpm --filter @actspace/desktop typecheck`
- 手工检查：
  - 启动应用后确认 `<userData>/kairos/inbox/main-agent.md` 和 `lab-agent.md` 存在。
  - 手动向 `main-agent.md` 文件末尾追加一条 Pending 消息，wake Kairos 后确认本次 tick prompt 能看到 inbox 摘要。
  - 向 `lab-agent.md` 追加一条实验观察请求，确认 Kairos 不会自动晋升能力，只会整理建议或写入自己的短期记忆。
- 观测检查：
  - Kairos 行动事实仍出现在 `memory/short-term/<YYYY-MM>/<date>.jsonl`。
  - inbox 文件只作为输入信号存在，不出现被 Kairos 当作唯一事实日志的情况。

## 进度记录

- [x] 确认产品方向：Kairos 是主动运行者，Main Agent / Lab Agent 是文件 inbox 写入方。
- [x] 确认 V0 形态：两个 Markdown 文件，不引入复杂消息协议。
- [x] 更新 Kairos 长期设计文档，沉淀文件收件箱规范。
- [x] 完成存储初始化与 inbox loader。
- [x] 完成 prompt assembly 和核心提示词接入。
- [x] 完成 Main Agent / Lab Runtime 最小写入入口。
- [x] 完成测试、history 和本地验收。

## 实施结果

- 新增 `packages/agent-core/src/kairos/inbox.ts`，集中提供默认文件创建、append-only 写入和 prompt 摘要加载。
- `packages/desktop/src/main/kairos-bootstrap.ts` 启动时幂等创建 `<userData>/kairos/inbox/main-agent.md` 与 `lab-agent.md`，默认只保留 `## Pending`。
- `KairosRunner.processTick()` 和 `KairosController.getContextSnapshot()` 每次组装 prompt 时读取同一份 inbox summary，保证真实 tick 和上下文 Sheet 看到一致输入。
- `prompt-assembler.ts` 将 [5] 观测摘要预算提升到 1200 token，并把 watch diff、sessions digest、Agent inbox 分块截断，避免某类长内容完全挤掉其它观测信号。
- `KAIROS_SYSTEM_PROMPT` 明确 inbox 是后台观察信号，不是用户当前命令或高风险动作授权。

验证通过：

- `pnpm --filter @actspace/agent-core exec vitest run src/kairos`
- `pnpm --filter @actspace/desktop exec vitest run src/main/test`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `git diff --check`

## 决策记录

- 2026-06-02：采用 `<userData>/kairos/inbox/main-agent.md` 与 `<userData>/kairos/inbox/lab-agent.md` 两份 Markdown 文件作为 V0 通信机制。原因是 Kairos 本身是主动运行的 LLM Agent，可以直接理解自然语言信号；两个文件能清楚区分来源，又避免过早引入消息总线或复杂 schema。
- 2026-06-02：inbox 只进入 Kairos prompt 的观测摘要，不作为新的持久化事实源。原因是 Kairos 已有 `memory/short-term/*.jsonl` 作为唯一行动事实日志，重复引入 inbox 状态机会让排障边界变乱。
- 2026-06-02：V0 不做精确 ack / status / locking。原因是当前目标是简单、方便、可追溯；等消息量和并发问题真实出现后，再升级为 JSONL、索引或锁机制。
- 2026-06-02：V0 默认文件不保留 `## Processed`，自动写入只做文件末尾 append。原因是 `Pending` 中间插入需要 read-modify-write，容易和 append-only 并发策略冲突；处理状态留到后续升级。
