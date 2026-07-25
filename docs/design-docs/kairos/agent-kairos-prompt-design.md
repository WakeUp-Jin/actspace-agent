# Kairos 系统提示词设计规范

状态：已上线（2026-07-04）。实施计划见 `docs/exec-plans/completed/20260704-kairos-soul-and-config.md`。

本文档回答：Kairos 的系统提示词由哪几层组成、每层归谁维护、用户能改哪些、怎么改、为什么这样切。
提示词的**缓存形态**约束（静态前缀 + 动态尾部）见 `docs/design-docs/kairos/agent-kairos-prompt-cache-optimization.md`，本文不重复。

## 1. Kairos 的定位

Kairos（希腊语 καιρός，「恰当的时机」）是 actspace 内长期驻留的自主智能体：
按 tick 周期性醒来，**观察**（sessions 活动、inbox、持续数据源型 Skill）、**判断**（对照场景应对与用户规则）、**行动**（执行任务、读取分析、写笔记、给用户汇报），然后 sleep。

定位上它不是「只会整理笔记的观察者」，而是「在正确的时机做正确的事的执行者」：

- 用户交办的任务（briefs、rule.md 场景规则）到点/触发即执行，产出具体成果；
- 观察到值得处理的变化时按场景应对行动；
- 全部安静时做闲时工作或直接 sleep，不为存在感而行动。

## 2. 提示词分层总览

系统提示词 = 固定模板（`packages/agent-core/src/kairos/prompt.ts`）+ 低频插槽。
每 tick 必变的内容（时间、phase、任务表、观测增量）永远走 tick message，不进本模板。

| 层 | 内容 | 来源 | 谁可改 | 变更生效 |
|---|---|---|---|---|
| soul 插槽 `{soul}` | 身份、气质、语气、价值观 | `<root>/config/soul.md` | **用户**（设置页人格编辑 / 预设） | write-config → reloadConfig，下一 tick 生效 |
| 机制段 | 信息渠道、唤醒例程、场景应对、笔记约定、闲时工作、Pacing、读写边界、tick 契约 | `prompt.ts` 硬编码 | 仅代码（随版本演进） | 发版 |
| 上下文插槽 `{config_tips_block}` | 可读写路径、免打扰、禁用工具 | 3 份 config JSON | 用户（设置页表单） | 同 soul |
| 上下文插槽 `{skill_catalog}` | 已启用 Skill 清单 | settings 白名单 | 用户（Skills 分区） | controller 重建 |
| 上下文插槽 `{user_rules}` | 长期约束 + 场景规则 | `<root>/config/rule.md` | **用户**（设置页规则编辑） | 同 soul |
| 上下文插槽 `{history_summary}` | 压缩摘要 | short-term 压缩产物 | 系统 | 压缩时 |

### 为什么是插槽而不是全量覆盖

被排除的方案：**用户自定义提示词全量覆盖内置模板**。
Kairos 的机制段与宿主代码强耦合——每 tick 必须以 `sleep` 工具收尾（scheduler 依赖）、观测增量的语义、读写授权边界、tick message 契约。全量覆盖一旦丢失这些段落，Kairos 直接行为损坏（不睡、越权写、不读数据源），且用户很难自行诊断。

参照 Hermes（`~/Desktop/code-project/side-project/hermes-agent`）的同款结论：

- `agent/system_prompt.py` 三层组装（stable/context/volatile），用户可改的只有 `SOUL.md`（身份插槽，读不到时 fallback 到 `DEFAULT_SOUL_MD`）；工具指导、skills 索引等机制段全部代码维护。
- `/personality pirate` 的实现只是把 `agent.personalities` 字典里的一段文本写进 config 的附加提示词字段——预设人格本质是「往插槽里填预写好的文案」。

Kairos 采用同构设计，且只保留**一个**人格落点（soul.md）：预设选择 = 把预设文案写入 soul.md，不做「SOUL + personality overlay」双层叠加（Hermes 的双插槽是 CLI 历史包袱，两层叠加时的优先级用户难以理解）。

## 3. soul 插槽

### 契约

- 位置：`<kairosRoot>/config/soul.md`，与 rule.md 同目录。
- 读取：`loadKairosConfig` 读入 `KairosConfig.soulMd`；**预算 500 token（约 1500 字符）**，超出截尾并记 warning。
- fallback：文件缺失或内容为空白 → 使用内置 `KAIROS_DEFAULT_SOUL`（即「默认」预设全文）。保证任何情况下身份段非空。
- 写入：复用 `kairos:write-config` IPC，逻辑名 `soul`（`KairosConfigName` 增枚举、`CONFIG_FILE_MAP` 增映射、schema 校验跳过 markdown）。
- 生效：write-config 成功后 `controller.reloadConfig()`，下一 tick 的 system prompt 使用新 soul。soul 变更导致前缀缓存整体失效，属可接受的低频事件（与 rule.md 同级）。

### soul 承载什么、不承载什么

- **承载**：我是谁、什么气质、用什么语气说话、行动风格的价值观。
- **不承载**：产出契约（笔记/汇报/任务成果）、例程步骤、场景应对、边界约束——这些在机制段兜底，用户把 soul 改成海盗腔也不会破坏行为骨架。

### 默认 soul（KAIROS_DEFAULT_SOUL）

```
# 你是 Kairos —— 这座 actspace 的时机之神
名字取自希腊语 καιρός：「恰当的时机」。你的天职是在正确的时刻做正确的事——
平时安静地观察与整理，不为存在感而行动；时机到来时（用户交办的任务、
观察到值得处理的变化）果断出手，做完即退回幕后。
汇报简洁、克制、不带情绪噪音。「安静」是指不打扰用户，而不是什么都不做。
```

原「塞巴斯·蒂安执事」设定随本设计废弃（用户反馈：具体角色借用不合适，改用 Kairos 本名的中性设定）。
原身份段里的「产出只有两种」契约移入机制段的例程与场景应对（见 §5）。

## 4. 预设人格（presets）

定义在 `@actspace/shared`（`kairos-soul-presets.ts`），renderer 下拉与 agent-core fallback 共用同一份数据：

```ts
export interface KairosSoulPreset {
  id: string;        // "default" | "concise" | "technical" | "warm"
  label: string;     // 设置页展示名
  content: string;   // 写入 soul.md 的全文
}
```

内置 4 个预设：

| id | label | 调性 |
|---|---|---|
| `default` | 时机之神（默认） | §3 的默认 soul |
| `concise` | 极简 | 每次汇报一句话说清；笔记只留要点；能不说就不说 |
| `technical` | 技术流 | 术语精确、结构化输出、汇报带数据和路径 |
| `warm` | 温暖陪伴 | 语气亲和，汇报像朋友间的留言，关注用户状态 |

交互约定：设置页下拉选中预设 = 将 `content` 写入 soul.md（覆盖现有内容，写前若当前 soul 与所有预设都不同——即用户自定义过——需确认弹层）；文本框直接编辑 = 自定义人格。UI 通过「当前 soul 内容与哪个 preset 逐字节相等」反推选中态，都不等则显示「自定义」。

## 5. rule.md 与 briefs 的分工（授权覆盖原则）

用户让 Kairos「做事」的两个入口，职责不同：

- **rule.md = 条件响应规则**。「遇到 X 就做 Y」类长期授权，例：
  「监听目录出现新的 .csv 文件时，读取并做基础统计，写入观察笔记并向我汇报要点」。
- **briefs = 定时/例行任务**。「每天 18:00 汇总今日文件变动」这类有调度语义的任务，
  frontmatter（trigger/intervalSec/priority/status）由宿主调度，正文到期投递进 tick。

机制段写明**授权覆盖原则**：rule.md 中的场景规则**优先于**内置场景应对表的默认动作——内置表只是无用户规则时的兜底行为。这样新场景（分析 CSV、翻译文档、归档图片……）都通过改 rule.md 扩展，不需要动提示词模板。

## 6. 机制段设计原则

- 机制段描述「怎么工作」，与人格解耦；修改属于版本演进，走代码评审。
- 场景应对表给「变化类型 → 默认动作」的具体映射，避免「留下点什么」这类抽象指令；
  表首注明授权覆盖原则（§5）。
- 每 tick 关键约束由 `TICK_MESSAGE_REMINDER` 钉在 tick message 尾部（贴近决策点，抗历史稀释），
  与机制段内容保持一致、保持简短、逐 tick 逐字节相同。

## 7. 设置页「Kairos 配置」分区

设置页新增独立分区 `kairos`（从「智能体」分区拆出，导航文案「Kairos」），信息架构：

| 分组 | 内容 | 来源 |
|---|---|---|
| 模型与运行 | 模型下拉、思考链、额度限制 | 现有控件自「智能体」平移 |
| 人格 | 预设下拉 + soul.md 编辑框（失焦保存） | 新增 |
| 用户规则 | rule.md 编辑框 | 现有控件平移 |
| 任务表 | briefs 列表（id/状态/调度/优先级）+ 正文编辑 + 新建/删除 | 新增 |
| 运行偏好 | preferences 表单（节奏、sleep 区间等） | 现有控件平移 |
| 可读写路径 | paths.json 列表 | 现有控件平移 |
| 屏蔽规则 | blocklist 路径 + 禁用工具 | 现有控件平移 |

briefs 编辑走新 IPC（`kairos:briefs-list` / `kairos:briefs-read` / `kairos:briefs-write` / `kairos:briefs-delete`），
main 直接读写 `<root>/briefs/tasks/*.md`，写后调用 controller 新暴露的 `reloadBriefs()`（内部 `BriefsIndexManager.rebuildFromDisk()`），
使 dispatcher 下一 tick 看到新任务。frontmatter 中 `lastRun`/`nextRun`/`created` 由系统维护，UI 只暴露
`id`（新建时定，文件名 = id）、`status`（active/paused）、`trigger`、`intervalSec`、`priority` 和正文。

「智能体」分区保留主 Agent 相关设置（主 Agent 系统提示词等），不再含 Kairos 内容。

## 8. 被排除的方案

- **全量覆盖内置提示词**：机制段丢失即行为损坏，见 §2。
- **SOUL + personality 双插槽叠加**：两层文本的优先级对用户不透明，Kairos 只留 soul.md 单落点。
- **每 tick 注入人格提醒**：人格属于低频稳定内容，进 tick message 会浪费每 tick 预算并破坏
  「reminder 只钉机制约束」的单一职责。
- **人格预设存 config JSON**：预设是静态产品文案不是用户数据，硬编码在 shared 里随版本升级，
  用户数据只有 soul.md 一份。

## 9. 参考

- Hermes 源码（已 clone 到 `~/Desktop/code-project/side-project/hermes-agent`）：
  `agent/system_prompt.py`（三层组装 + SOUL.md 插槽）、`hermes_cli/default_soul.py`（DEFAULT_SOUL_MD fallback）、
  `gateway/slash_commands.py::_handle_personality_command`（预设人格 = 写配置字段）、
  `cli.py` 默认配置中的 `agent.personalities` 字典。
- 本仓库：`docs/design-docs/kairos/agent-kairos-autonomous-mode.md`（Kairos 总体设计）、
  `docs/design-docs/kairos/agent-kairos-prompt-cache-optimization.md`（缓存形态约束）、`docs/design-docs/frontend/front-设置页规范.md`（设置页交互约定）。
