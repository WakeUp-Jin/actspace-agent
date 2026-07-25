## [2026-07-04 00:10] | Task: Kairos 提示词二次迭代（执事骨架 + tick 固定提醒 + 任务表可见性）

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE

### 📥 User Query

> （承接同日「提示词重写 + 巡检退役」一轮的实测反馈）重置 short-term 后 Kairos 开始按例程读 fs-watch 日志了，但读到"用户创建了一篇笔记"之后只口头总结一句就 sleep——没有告诉它"读取之后，什么场景做什么事情"。系统提示词会被增长的历史稀释，稳定要强调的信息可以作为 tick message 的后缀补充。另外 Kairos 像管家一样应该有任务表（briefs），看看它的上下文有几种、任务表怎么加载。人设不要叫"管家"，用《Overlord》的塞巴斯·蒂安（执事）设定。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`（kairos）、`docs/`

**Key Actions:**

- **[执事版系统提示词]**: `KAIROS_SYSTEM_PROMPT` 三次结构升级——①身份段改为塞巴斯·蒂安式执事人设，行为契约"产出只有笔记 + 汇报两种，没留下就是白醒"；②新增「信息渠道」段，把 7 种上下文来源（任务表 / 观测增量 / 数据源 Skill / rule.md / 配置提示）写成渠道说明书；③新增「场景应对」表（新建文本文件→读内容记笔记、密集修改→记录后复盘、sessions 新对话→更新主题笔记等）替代抽象的"至少产出一件事"；④新增「笔记约定」固定落点（`notes/observations/<日期>.md` + `notes/<主题>.md`）；⑤First wake-up 与例程解除冲突（首次唤醒发现变化同样按场景应对，不得跳过）；⑥Pacing 补"quiet/off 时段例程照常执行"。
- **[tick message 固定后缀]**: 新增 `TICK_MESSAGE_REMINDER`（3 行，逐 tick 完全一致）拼在每条 tick 消息末尾，把"数据源要自己读 / 发现变化对照场景表 / 全安静才许睡"钉在决策点旁边，对抗系统提示词被长历史稀释。
- **[任务表可见性]**: tick 消息头部「活跃 briefs N 个」改为「任务表」行——渲染 active briefs 的 `id（下次 MM-DD HH:mm）` 清单（上限 8 项，空表输出「空」）；runner/controller 接口从 `activeBriefsCount` 改为 `activeBriefs`。
- **[briefs 只读授权]**: `briefs/` 目录并入 Kairos guard 的 `readOnlyRoots`，Kairos 可翻任务表原文但不能改（任务是用户定的）。
- **[first wake-up 修复]**: `controller.start()` 只在今天（当前分卷）无任何短期记忆时携带 `<tick first wake-up/>` 标记；此前无条件携带导致 settings 变更触发的 controller rebuild 让模型一天内收到多个"首次唤醒"并重复勘察。
- **[测试]**: prompt-assembler 测试补任务表行渲染 / 截断 / 固定后缀断言；runner / replay-fidelity mock 同步。agent-core 668 测试、desktop 346 测试、双包 typecheck 全部通过。
- **[文档]**: `agent-kairos-autonomous-mode.md` 同步（状态行、System Prompt 段表、tick message [B] 段、提示词章节重写、readOnlyRoots 组成、first wake-up 收紧说明）。

### 🧠 Design Intent (Why)

- **场景表补的是"读到之后做什么"**：实测重置后 Kairos 会执行例程读日志，但发现变化后止步于口头总结——例程给了流程、没给"场景→动作"映射。把每类观察对应的产出写死，弱模型才能落地。
- **固定后缀对抗上下文稀释**：系统提示词在 7k+ tokens 历史的最前端，注意力必然衰减；tick 消息是模型每次决策前最后读到的内容。固定短语不注入任何数据（与被否决的"fs-watch 事件注入 tick"有本质区别），也不破坏前缀缓存（tick message 本就是动态尾部）。
- **任务表从数字变清单**：管家/执事得看得到自己的排班簿。只投递到期正文的机制不变，头部清单让 Kairos 具备"知道今天有哪些活挂着"的全局感，成本每 tick 几十 token。
- **first wake-up 判定挂在记忆而非进程生命周期**：「首次唤醒」的语义是"我对今天没有记忆"，controller 对象的新旧是实现细节，不应泄漏给模型。

### 📁 Files Modified

- `packages/agent-core/src/kairos/prompt.ts`
- `packages/agent-core/src/kairos/prompt-assembler.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/index.ts`
- `packages/agent-core/src/kairos/test/prompt-assembler.test.ts`
- `packages/agent-core/src/kairos/test/runner.test.ts`
- `packages/agent-core/src/kairos/test/replay-fidelity.test.ts`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
