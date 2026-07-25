# Plan 02：actspace 侧插件集成（设置页 / 进程管理 / Kairos Skill 白名单）

## 目标

在 actspace 内完成 fs-watch 插件的全部集成（设计文档 V0+V1）：settings 契约扩展、main 进程安装/spawn/守护/退出、设置页「插件」「Skills」两个新分区、主 Agent Skill 黑名单、Kairos Skill 白名单 catalog + allowedRoots 联动。

## 范围

- 包含：`packages/shared`、`packages/desktop`（main / preload / renderer）、`packages/agent-core`（kairos 三个文件级改动）。
- 不包含：插件二进制实现（Plan 01）；Kairos 观测管道（watch-scanner / watch-diff **零改动**）；插件打包进 extraResources。

## 必读文档与代码

- `docs/design-docs/agent-plugins-fs-watch.md`（契约事实来源）。
- `docs/design-docs/tool-system/agent-skill-loading.md`（Skill 目录生态与 catalog 格式）。
- 代码：`packages/shared/src/settings.ts`、`packages/desktop/src/main/settings-service.ts`、`packages/desktop/src/main/agent-runtime-context.ts`、`packages/agent-core/src/skills/{registry,catalog}.ts`、`packages/agent-core/src/kairos/{controller,prompt,prompt-assembler}.ts`、`packages/desktop/src/main/index.ts`（`ensureKairosController` / `rebuildKairosController`）、`packages/desktop/src/renderer/components/settings/*`。

## 关键设计落点（与现状代码对齐）

1. **settings 契约**（`packages/shared/src/settings.ts`）：
   - 新增 `PluginsSettings { fsWatch: { enabled: boolean } }`、`SkillsSettings { disabled: string[] }`；`KairosSettings` 追加 `enabledSkills: string[]`。
   - `AppSettings` 加 `plugins` / `skills` 分区；`SettingsUpdateInput` 对应扩展。
   - `settings-service.ts`：`PersistedSettings` 加两分区，`sanitizePlugins` / `sanitizeSkills` / `sanitizeKairos`（enabledSkills 过滤为 string[] 去重）；老 settings.json 缺分区时回默认（fsWatch.enabled=false、disabled=[]、enabledSkills=[]）并 needsWrite。
2. **共享插件契约**（新文件 `packages/shared/src/plugins.ts`，从 shared index 导出）：
   - `FsWatchRunState = "running" | "stopped" | "error" | "not_installed"`。
   - `FsWatchStatus { installed; binaryVersion?; enabled; runState; lastHeartbeatAt?; heartbeatFresh; restartCount; lastError?; binPath; outDir }`。
   - `FsWatchConfigView { roots: string[]; excludeNames: string[]; excludeHidden: boolean; debounceMs: number; retentionDays: number }` + `FsWatchConfigUpdateInput`（Partial）。
   - `SkillCatalogItem { name; description; scope; source; location; directory; status; warning?; shadowed; removable }`（由 main 从 agent-core `SkillSummary` 映射，`removable` = directory 位于 `<dataRoot>/skills/` 下）+ `SkillListResult { items: SkillCatalogItem[]; warnings: string[] }` + install/uninstall 输入输出。
3. **main 进程插件服务**（新文件 `packages/desktop/src/main/plugins/fs-watch-service.ts`）：
   - 路径布局：`<dataRoot>/plugins/fs-watch/{bin/fs-watch, config.json}`；Skill 物化到 `<dataRoot>/skills/fs-watch/`（SKILL.md 模板作为本文件内嵌常量——actspace 侧真相；插件仓库 `skill/` 副本仅供外部使用者）；`outDir = <dataRoot>/skills/fs-watch/references/watch-log`。
   - `getStatus()`：bin 存在性、缓存的 `--version`、child 运行态 + state.json 心跳（`lastHeartbeatAt` 距今 < 90s 为 fresh）。
   - `installFromFile(sourcePath)`：复制到 binPath + chmod 0o755 + 跑 `--version` 验证（3s 超时），失败回滚删除。
   - `start()`：物化 Skill（幂等）→ 确保 config.json（默认 roots=[Kairos workspace]、excludeNames=契约默认、debounceMs=500、retentionDays=14；outDir 强制指向本机 skill references，读入时覆写）→ spawn `bin --config config.json`，stdout/stderr 进 main 日志带 `[plugin:fs-watch]` 前缀。
   - 守护：非期望退出按指数退避重启（5s/15s/45s/135s/405s），10 分钟窗口内超 5 次 → runState="error" 停止重试；`retry()` 手动清零。
   - `stop()`：SIGTERM → 2s 超时 SIGKILL；`updateConfig()` 写盘后运行中则 stop+start。
   - 与 settings 联动：`setEnabled(enabled)` 由 IPC handler 调用——先 `settingsService.update({plugins:{fsWatch:{enabled}}})` 持久化，再 start/stop。app 启动（whenReady）时按持久化状态自动拉起；`before-quit` 时 best-effort SIGTERM。
4. **IPC + preload + global.d.ts**（`packages/desktop/src/main/index.ts`、`packages/desktop/src/preload/index.ts`、`packages/desktop/src/global.d.ts`）：
   - `plugins:fs-watch:get-status` / `:set-enabled` / `:install`（`dialog.showOpenDialog` 选文件）/ `:get-config` / `:update-config` / `:pick-root`（选目录，返回绝对路径）/ `:retry`。
   - `skills:list` / `skills:install`（选目录 → 校验含 SKILL.md → 递归复制到 `<dataRoot>/skills/<dirname>`，同名已存在则报错）/ `skills:uninstall`（仅允许 `<dataRoot>/skills/` 内，递归删除）。
   - `skills:list` 的 workspaceRoot 取当前工作区（与 `agent:run-turn` 同源的 workspace 解析；不可得时回落 `roots.workspaceRoot` 或 cwd）。
   - preload 暴露 `window.actspace.plugins.*` 与 `window.actspace.skills.*`（或平铺方法，与现有命名风格一致，平铺更贴近现状——采用平铺：`getFsWatchStatus` 等）。
5. **主 Agent Skill 黑名单**（`packages/desktop/src/main/agent-runtime-context.ts`）：
   - `MainAgentRuntimeContextInput` 加 `disabledSkills?: string[]`；`loadSkillRegistry` 结果先按 name 过滤再 `createSkillCatalogSegment`。
   - `index.ts` 三处 `loadMainAgentRuntimeContext` 调用点注入 `getSettingsService().get().skills.disabled`。
6. **Kairos Skill 白名单**（agent-core 三处 + main 两处）：
   - `packages/agent-core/src/kairos/controller.ts`：`CreateKairosOptions` 加 `skillCatalog?: KairosSkillCatalogEntry[]`（`{ name; description; location; directory }`，main 已按白名单过滤好）；`buildKairosGuard` 的 `allowedRoots` 追加 `skillCatalog.map(s => s.directory)`；组装 system prompt 与 context snapshot 时把 catalog 传给 assembler。
   - `packages/agent-core/src/kairos/prompt.ts`：模板追加 `# 可用 Skills\n{skill_catalog}` 段（低频内容，符合缓存约束——只有白名单变化才变，变化时 main 会重建 controller）。
   - `packages/agent-core/src/kairos/prompt-assembler.ts`：`AssembleSystemPromptInput` 加 `skillCatalog?`；渲染 `<available_skills>` 简化列表（name/description/location 三行一条），空时输出「（无已启用 Skill）」；补一句使用指引（先读 SKILL.md，location 是绝对路径）。
   - `packages/desktop/src/main/index.ts` `ensureKairosController`：读 settings.kairos.enabledSkills → `loadSkillRegistry` → 过滤映射为 catalog → 传入 `createKairos`。
   - settings `kairos.enabledSkills` 变化时触发 `rebuildKairosController`（在 settings:update handler 中比较新旧值，复用现有 modelId/thinking 变化的重建路径）。
7. **设置页 UI**（renderer）：
   - `SettingsNav.tsx`：`SettingsSectionId` 加 `"plugins" | "skills"`，导航项「插件」（Plug 图标）「Skills」（Library 图标）。
   - 新文件 `PluginsSettings.tsx`：文件监听卡片——未安装态（说明 + 「选择二进制安装」）；已安装态（版本、总开关 Toggle、运行状态 badge（运行中/已停止/异常+重试按钮）、最近心跳时间）；配置区（监听目录列表增删、debounce/保留天数数字输入、排除规则只读展示 v0 不可编辑）。开关/配置变更即时生效；状态 2s 轮询（仅本分区挂载时）。
   - 新文件 `SkillsSettings.tsx`：Skill 卡片列表（name/description/scope/source/路径/warning/shadowed 标记）；每卡两个开关——「主 Agent」（黑名单反向）与「Kairos」（白名单）；顶部「安装 Skill」按钮；`removable` 的卡片给「卸载」按钮（confirm 后调用）。
   - `SettingsPage.tsx` 接线两个 section；浏览器 mock 模式下 bridge 缺失显示「仅桌面端可用」。
   - 样式遵守 `front-主题与配色规范.md`：全部用主题 token（text-text-main / bg-surface 等），禁止字面量颜色。
8. **联动语义**：`plugins:fs-watch:set-enabled(true)` 时把 `"fs-watch"` 并入 `kairos.enabledSkills`（若不存在），同一次 settings 更新完成——用户可再手动移除。

## 测试任务

- `packages/desktop/src/main/test/settings-service.test.ts`（或新增）：plugins/skills/enabledSkills 的默认播种、sanitize、持久化 round-trip。
- 新 `packages/desktop/src/main/test/fs-watch-service.test.ts`：心跳新鲜度判定、退避序列、config 默认生成与 outDir 覆写（对可注入 fs/spawn 的纯逻辑做测试；不真 spawn）。
- `packages/desktop/src/main/test/agent-runtime-context.test.ts`：disabledSkills 过滤后 catalog 不含被禁 Skill。
- `packages/agent-core/src/kairos/test/prompt-assembler.test.ts`：skillCatalog 渲染（有/无两态）；controller 测试补 extraAllowedRoots 进 guard 的断言（如现有 controller.test 可扩展）。

## 验证方式

- `pnpm typecheck`、`pnpm test` 全绿（与改动前基线对比，不引入新失败）。
- GUI 实机验收（用户侧 `pnpm dev:log`）：安装二进制 → 开关 → 状态运行中 → Kairos 上下文 Sheet 可见 Skill 段——与仓库 Kairos v1 相同的验收惯例，plan 完成不阻塞于此。

## 失败与回退

- 所有新功能默认关闭（fsWatch.enabled=false、enabledSkills=[]、disabled=[]），不影响既有行为；最小回退 = revert 本 plan 涉及文件。
- 注意仓库有 bash 工具相关的未提交改动（`tools/bash/*` 等），本 plan 不触碰这些文件。

## 进度记录

- [x] T1 shared 契约（settings.ts + plugins.ts）
- [x] T2 settings-service 扩展 + 单测
- [x] T3 fs-watch-service + IPC + preload + 退出挂钩
- [x] T4 主 Agent Skill 黑名单过滤
- [x] T5 Kairos skillCatalog + guard + 重建联动
- [x] T6 设置页「插件」「Skills」分区
- [x] T7 全量验证与文档同步
