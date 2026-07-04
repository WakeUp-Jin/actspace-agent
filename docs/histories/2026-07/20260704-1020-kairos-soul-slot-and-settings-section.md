# Kairos soul 人格插槽 + 设置页「Kairos」独立分区

## 用户诉求

Kairos 的系统提示词希望开放给用户修改，并讨论两种形式：全量覆盖 vs 提供部分空间（插槽）。要求参考 Hermes 的 `/personality` 命令与 `config.yaml` 自定义人格（已 clone 源码分析），把 rule.md 和 briefs 也暴露给用户编辑，设置页增加 Kairos 专属配置入口；同时废弃「塞巴斯·蒂安执事」人设，换成 Kairos 本名的中性设定。确认插槽方案后要求：1）整理系统提示词设计规范文档；2）生成执行计划；3）执行。

## 主要改动

### 文档

- 新增 `docs/design-docs/agent-kairos-prompt-design.md`：Kairos 系统提示词分层设计（soul 插槽契约、预设人格、rule.md/briefs 分工与授权覆盖原则、机制段边界、设置页信息架构、被排除方案）。
- 新增执行计划 `docs/exec-plans/active/20260704-kairos-soul-and-config.md`（完成后归档至 completed/）。
- 同步 `agent-kairos-autonomous-mode.md`（[1] 段拆 {soul} 插槽、场景应对表授权覆盖原则、存储布局加 soul.md）、`front-设置页规范.md`（新增「Kairos」分区、智能体分区瘦身）、`core-storage-and-observability.md`（config 5 份 + briefs IPC）、`agent-index.md`（收录新设计文档）。

### M1 契约与内核（shared + agent-core）

- `packages/shared/src/kairos-soul-presets.ts`（新）：`KairosSoulPreset` + 4 个内置预设（时机之神默认/极简/技术流/温暖陪伴）+ `KAIROS_DEFAULT_SOUL`。
- `kairos-contracts.ts`：`KairosConfigName` 加 `"soul"`；新增 briefs IPC 契约类型与 `KairosBridgeApi` 四个方法。
- `agent-core/kairos/config/loader.ts`：读 `soul.md` → `KairosConfig.soulMd`（500 token 预算截尾，rule.md 读取逻辑合并为 `readMarkdownWithBudget`）。
- `kairos/prompt.ts`：身份段改为 `{soul}` 占位符（塞巴斯文案删除）；「产出契约」独立成机制段；场景应对表首加授权覆盖原则（rule.md 规则优先于默认动作）。
- `kairos/prompt-assembler.ts`：`{soul}` 替换（空白 fallback 默认人格）。
- `kairos/controller.ts`：上下文快照的「角色与节奏」段按同款规则替换 soul 并把 soul.md 列入 sourceFiles；新增 `reloadBriefs()`。

### M2 main IPC（desktop）

- `kairos-ipc-internals.ts`：`CONFIG_FILE_MAP` 加 soul 映射、`MARKDOWN_CONFIG_NAMES` 集合；新增 briefs 文件存取纯逻辑（list/read/write/delete，id 白名单防路径穿越，write 保护 created/lastRun/nextRun 系统字段，interval 触发校验正数间隔，tmp+rename 原子写）。
- `kairos-ipc.ts`：注册 `kairos:briefs-list/read/write/delete` 四条通道，写/删成功后 `reloadBriefs()`；markdown 配置跳过 JSON 校验改为按集合判断。
- `preload/index.ts`：`window.kairos` 桥接补齐四个 briefs 方法。

### M3 设置页（renderer）

- `SettingsNav.tsx` / `SettingsPage.tsx`：新增独立「Kairos」分区（Hourglass 图标），`KairosSettings` 从「智能体」分区整体迁出。
- `KairosSettings.tsx`：新增「人格」分组（预设下拉 + soul.md 文本框失焦保存；预设选中态按内容逐字节比对反推，覆盖自定义内容前 confirm）与「任务表」分组（briefs 列表 + 展开编辑器 + 新建/删除）。

### 测试

- agent-core：loader soul 读取/截尾、assembler soul 注入/fallback/机制段完整性（672 通过）。
- desktop：internals briefs 存取 7 个用例 + CONFIG_FILE_MAP/validateByName 更新、renderer 人格与任务表 6 个用例（359 通过）；shared/agent-core/desktop typecheck 全绿。

## 设计动机

- 插槽式（soul.md 单落点）而非全量覆盖：Kairos 机制段与宿主强耦合（sleep 收尾、读写边界、tick 契约），全量覆盖丢失任何一段都会直接损坏行为且难以自查。与 Hermes 的 SOUL.md 插槽结论同构，但不做 SOUL+personality 双层叠加（优先级对用户不透明）。
- 预设字典放 `@actspace/shared`：renderer 下拉与 agent-core fallback 共用同一数据源，「默认」预设永远一致。
- briefs 单独开 IPC 而不复用 write-config：brief 是多文件集合，需要 frontmatter 校验与系统字段（调度状态）保护。

## 关键文件

- `docs/design-docs/agent-kairos-prompt-design.md`
- `packages/shared/src/kairos-soul-presets.ts`、`kairos-contracts.ts`
- `packages/agent-core/src/kairos/prompt.ts`、`prompt-assembler.ts`、`config/loader.ts`、`controller.ts`
- `packages/desktop/src/main/kairos-ipc-internals.ts`、`kairos-ipc.ts`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`、`SettingsNav.tsx`、`SettingsPage.tsx`
