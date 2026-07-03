## [2026-07-03 18:00] | Task: 插件模式落地——fs-watch 文件监听插件与 actspace 集成

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

### 📥 User Query

> Kairos 的文件监听目前是简单的轮询扫描算法。希望把文件监听抽出来用 Rust 实现为一个外部持续运行的「插件」（学习 Codex 叫 plugins），监听结果写入文件；同时把它包装成 Skill 提供给其他 Agent 使用（SKILL.md + references 按天组织事件日志）。插件源码单独放 `actspace-plugins` 仓库；actspace 侧做设置页「文件监听」分区（安装/开关/配置）和「Skills」可视化管理（安装/启用/禁用），Kairos 通过 Skill catalog + read_file 消费（不改现有观测管道）。先整理两份 exec plan，然后 v0/v1 一起执行完成。

### 🛠 Changes Overview

**Scope:** `packages/shared` / `packages/agent-core` / `packages/desktop`（main + preload + renderer）/ `docs`；独立仓库 `actspace-plugins`（新建）

**Key Actions:**

- **设计文档**: 新增 `docs/design-docs/agent-plugins-fs-watch.md`，定义「插件 = 外部二进制进程」模式、文件契约（事件 JSONL / state.json 心跳 / config.json）、Skill 形态与设置页规范。
- **Rust 插件（独立仓库）**: `actspace-plugins/crates/fs-watch`——notify 事件监听、500ms 合并去抖（Coalescer）、按天 JSONL 滚动写入（14 天保留 + 单日熔断）、30s 心跳 + 单实例锁、SIGTERM 优雅退出；针对 macOS FSEvents 的 kind 歧义做了 birthtime/LiveSet 校正。25 个单测全绿。
- **shared 契约**: `settings.ts` 新增 `PluginsSettings` / `SkillsSettings` / `kairos.enabledSkills`；新文件 `plugins.ts` 定义 fs-watch 状态/配置与 Skill 管理的 IPC 类型。
- **main 进程**: 新增 `plugins/fs-watch-service.ts`（安装校验 / spawn / 指数退避守护 / 心跳判定 / config 归一化，outDir 强制指向本机 Skill references）与 `skills-service.ts`（list/install/uninstall，仅 `<userData>/skills/` 可卸载）；`index.ts` 挂 IPC、app 启动自动拉起、before-quit 收尾；开启插件时自动把 `fs-watch` 并入 Kairos 白名单。
- **Kairos Skill 白名单**: controller 接收 `skillCatalog`（main 按白名单过滤后传入），注入 system prompt「可用 Skills」段并把 Skill 目录并入 guard allowedRoots；白名单变化触发 controller 重建。现有 watch-scanner / watch-diff 零改动。
- **主 Agent 黑名单**: `agent-runtime-context.ts` 按 `settings.skills.disabled` 过滤 skill catalog。
- **设置页 UI**: 新增「插件」（PluginsSettings.tsx——安装/开关/状态徽标/心跳/目录与参数配置）与「Skills」（SkillsSettings.tsx——卡片列表 + 主 Agent/Kairos 双开关 + 安装/卸载）两个分区。
- **测试**: 新增 fs-watch-service 纯逻辑单测、agent-runtime-context 黑名单过滤、settings 播种/round-trip/旧文件迁移、prompt-assembler skill catalog 渲染；修正两个过期断言（kairos 持久化形状、kimi 已是合法 Kairos 模型）。

### 🧠 Design Intent (Why)

- 事件驱动的原生 FS 监听（FSEvents/inotify）替代轮询扫描的能力上限：可感知 modified/renamed、无 5000 文件上限；但不动 Kairos 现有 tick 观测，风险最小。
- 通信全部走文件契约（JSONL/心跳/config），插件与宿主完全解耦——同一份输出天然是 Skill 的 references，其他 Agent 零成本复用。
- 「插件管进程、Skill 管知识」的双分区设置页，把复杂度内置化：用户一个开关完成安装→运行→Kairos 授权链路。
- Kairos 用白名单（默认全关）而主 Agent 用黑名单（默认全开），匹配两者的自主性风险差异。

### 📁 Files Modified

- `docs/design-docs/agent-plugins-fs-watch.md`（新）
- `docs/exec-plans/completed/20260703-plugins-fs-watch/`（两份 plan，已归档）
- `packages/shared/src/{settings.ts, plugins.ts, index.ts}`
- `packages/desktop/src/main/{settings-service.ts, agent-runtime-context.ts, skills-service.ts, plugins/fs-watch-service.ts, index.ts}`
- `packages/desktop/src/{preload/index.ts, global.d.ts}`
- `packages/desktop/src/renderer/components/settings/{SettingsNav.tsx, SettingsPage.tsx, PluginsSettings.tsx, SkillsSettings.tsx}`
- `packages/agent-core/src/kairos/{controller.ts, runner.ts, prompt.ts, prompt-assembler.ts, index.ts}`
- 测试：`packages/desktop/src/main/test/{fs-watch-service,agent-runtime-context,settings-service}.test.ts`、`packages/agent-core/src/kairos/test/prompt-assembler.test.ts`、renderer 测试 fixture ×4
- 文档同步：`docs/ARCHITECTURE.md`、`docs/design-docs/{core-storage-and-observability.md, front-设置页规范.md}`
- 独立仓库：`actspace-plugins/`（Cargo workspace + crates/fs-watch 全部源码与 skill 模板）
