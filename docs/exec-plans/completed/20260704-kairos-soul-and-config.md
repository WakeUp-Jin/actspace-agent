# Kairos soul 插槽 + 设置页「Kairos」分区

## 目标

按 `docs/design-docs/agent-kairos-prompt-design.md` 落地：Kairos 系统提示词拆出用户可改的 soul 插槽（soul.md + 4 个内置预设），身份段替换塞巴斯设定为中性「时机之神」默认 soul；机制段补授权覆盖原则；设置页新增独立「Kairos」分区，归拢人格 / 规则 / 任务表（briefs 编辑，新 IPC）/ 现有 Kairos 控件。

## 范围

- 包含：shared 预设字典与契约扩展、agent-core loader/prompt/assembler、desktop main IPC（soul 走 write-config，briefs 走新通道）、设置页新分区 UI、测试、文档同步。
- 不包含：tick message 结构变更、短期记忆/压缩变更、fs-watch 插件变更、KairosPage（监控页）变更、brief 的 cron 表达式支持（沿用 intervalSec）。

## 背景

- 必读：`AGENTS.md`、`docs/design-docs/agent-kairos-prompt-design.md`（本 plan 的设计事实来源）、`docs/design-docs/agent-kairos-prompt-cache-optimization.md`（缓存约束）、`docs/design-docs/front-设置页规范.md`（设置页交互约定）。
- 相关代码：
  - `packages/shared/src/kairos-contracts.ts`（`KairosConfigName`）、`packages/shared/src/index.ts`
  - `packages/agent-core/src/kairos/prompt.ts`、`prompt-assembler.ts`、`config/loader.ts`、`controller.ts`、`briefs/index-manager.ts`、`briefs/parser.ts`
  - `packages/desktop/src/main/kairos-ipc.ts`、`kairos-ipc-internals.ts`（`CONFIG_FILE_MAP`、`validateByName`）
  - `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`、`SettingsPage.tsx`、`KairosSettings.tsx`
- 已知约束：
  - soul.md 属低频段，变更走 `kairos:write-config` → `controller.reloadConfig()`；不得把每 tick 变化内容引入模板。
  - soul 预算 500 token（1500 字符，`TOKEN_CHARS_PER_UNIT = 3`），超出截尾记 warning（与 rule.md 同款处理）。
  - briefs 的 `lastRun`/`nextRun`/`created` 由系统维护，UI 不允许编辑。
  - renderer 不 import agent-core；预设字典必须放 shared。

## 风险

- 风险：soul 插槽替换身份段后，Kairos 行为回归（产出契约原来写在身份段）。缓解：把「产出契约」移入机制段例程（设计 §3/§5），replay-fidelity 与 prompt-assembler 测试锁住模板结构。
- 风险：briefs 写 IPC 与 controller 运行中 dispatcher 读 index 竞争。缓解：写盘后统一走 `reloadBriefs()`（内部 `rebuildFromDisk()`，与现有 markRun 相同的单实例串行模型）；UI 写入只在 main 进程完成。
- 风险：设置页大搬家（989 行 KairosSettings + 1262 行 SettingsPage）改坏现有表单。缓解：控件平移不改内部实现，只动挂载点；现有 `kairos-config-files.test.tsx` 回归。

## 里程碑

1. **M1 契约与内核**（shared + agent-core）：
   - `packages/shared/src/kairos-soul-presets.ts`（新）：`KairosSoulPreset` 接口 + `KAIROS_SOUL_PRESETS`（default/concise/technical/warm，文案按设计 §4）+ `KAIROS_DEFAULT_SOUL`（= default preset content）；`index.ts` 导出。
   - `kairos-contracts.ts`：`KairosConfigName` 加 `"soul"`；新增 briefs IPC 请求/响应类型（`KairosBriefSummary`、`KairosBriefsListResponse`、`KairosBriefReadRequest/Response`、`KairosBriefWriteRequest`、`KairosBriefDeleteRequest`），brief 可编辑字段限 `id/status/trigger/intervalSec/priority/body`。
   - `config/loader.ts`：读 `soul.md` → `KairosConfig.soulMd`（500 token 截尾，缺失=空串）。
   - `prompt.ts`：模板身份段改为 `{soul}` 占位符；机制段场景应对表首补授权覆盖原则一句（rule.md 场景规则优先于本表默认动作）；删除塞巴斯文案。
   - `prompt-assembler.ts`：`{soul}` 替换逻辑——`soulMd` 非空白用之，否则 `KAIROS_DEFAULT_SOUL`。
   - 验证：`prompt-assembler.test.ts` 新增（自定义 soul 注入 / 空 soul fallback / 超预算截尾在 loader 测）；`pnpm --filter @actspace/agent-core test` 通过。
2. **M2 main IPC**（desktop main）：
   - `kairos-ipc-internals.ts`：`CONFIG_FILE_MAP` 加 `soul: "soul.md"`；`validateByName` 对 `soul` 跳过校验。
   - `controller.ts`：暴露 `reloadBriefs(): Promise<void>`（调 `briefsIndex.rebuildFromDisk()`）。
   - `kairos-ipc.ts`（+internals 纯逻辑）：注册 `kairos:briefs-list` / `kairos:briefs-read` / `kairos:briefs-write` / `kairos:briefs-delete`；write 走 `parseBriefFile` 校验 frontmatter 后原子写 `<root>/briefs/tasks/<id>.md`（新建时 `created` 置当前时间、`lastRun/nextRun` 置 null；编辑时保留系统字段）；write/delete 成功后调 `reloadBriefs()`。preload 桥接同步补齐（`window.kairos`）。
   - 验证：main 侧新增 briefs IPC 单测（临时目录 fixture：list/写入新建/编辑保留 lastRun/delete）；`pnpm --filter @actspace/desktop test` 通过。
3. **M3 设置页**（desktop renderer）：
   - `SettingsNav.tsx`：`SettingsSectionId` 加 `"kairos"`，导航项「Kairos」（icon 用 lucide `Moon` 或 `Hourglass`，插在「智能体」之后）。
   - 新建 `components/settings/KairosSection.tsx`：按设计 §7 分组（模型与运行 / 人格 / 用户规则 / 任务表 / 运行偏好 / 可读写路径 / 屏蔽规则）；「模型与运行」「运行偏好」「路径」「屏蔽」「规则」控件从 `KairosSettings.tsx` 平移（组件搬运不改逻辑）；人格分组 = 预设下拉（逐字节比对反推选中态，不匹配显示「自定义」；覆盖已自定义 soul 前弹确认）+ soul.md 文本框（失焦保存，走 `writeConfig("soul")`）；任务表分组 = brief 列表（id/status 开关/trigger/intervalSec/priority）+ 正文编辑 + 新建/删除（走 M2 IPC）。
   - `SettingsPage.tsx`：`case "kairos"` 渲染新分区；「智能体」分区移除 Kairos 内容。
   - 验证：`kairos-config-files.test.tsx` 回归 + 新增（预设选择写 soul / 自定义态识别 / briefs 列表渲染与保存调用）；`pnpm --filter @actspace/desktop test`、两包 `typecheck` 通过。
4. **M4 收尾**：
   - 文档同步：`front-设置页规范.md`（新分区 + 智能体分区瘦身）、`agent-kairos-autonomous-mode.md`（soul 插槽引用设计文档）、`core-storage-and-observability.md`（config 目录加 soul.md）、`agent-index.md` 收录新设计文档。
   - `docs/histories/2026-07/` 记 history；检查学习沉淀条件；本 plan 移至 `completed/`。

## 验证方式

- 命令：`pnpm --filter @actspace/agent-core test`、`pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/agent-core typecheck`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/shared test`（如有）。
- 手工检查：设置页出现「Kairos」分区；选「极简」预设后 `<userData>/actspace/kairos/config/soul.md` 内容变为预设文案；上下文 Sheet 的系统提示词预览身份段随之更新；新建 brief 后 `briefs/tasks/<id>.md` 落盘且 tick 消息任务表出现该 id。
- 观测检查：改 soul 后下一 tick 的 system prompt 前缀变化（memory 运行记录可见），无 loader warning。

## 进度记录

- [x] M1 契约与内核（shared + agent-core + 测试）——2026-07-04，agent-core 672 测试通过
- [x] M2 main IPC（soul 映射 + briefs 通道 + 测试）——2026-07-04，internals briefs 存取 7 用例
- [x] M3 设置页「Kairos」分区（UI + 测试）——2026-07-04，desktop 359 测试 + 三包 typecheck 全绿
- [x] M4 文档同步 + history + 归档 plan——2026-07-04，history 见 `docs/histories/2026-07/20260704-1020-kairos-soul-slot-and-settings-section.md`

## 决策记录

- 2026-07-04：采用插槽式（soul.md 单落点）而非全量覆盖 / 双层 overlay，理由与被排除方案见设计文档 §2、§8。
- 2026-07-04：预设字典放 `@actspace/shared`（renderer 不 import agent-core，agent-core fallback 与 UI 下拉共用同一数据源）。
- 2026-07-04：briefs 编辑不复用 write-config 通道（brief 是多文件集合且需 frontmatter 校验与系统字段保护），单独开 4 条 IPC。
