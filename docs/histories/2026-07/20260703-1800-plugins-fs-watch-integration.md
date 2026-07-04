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

### 🔁 后续迭代（同日）

- **一键编译安装**：设置页「插件」分区顶部新增「插件仓库」配置（`settings.plugins.repoRoot`，指向用户 clone 的 actspace-plugins 仓库）。设置后 fs-watch 未安装态出现「编译并安装」主按钮：校验仓库结构（`plugins/fs-watch/` 自包含布局）→ 发现 cargo（PATH 回落 `~/.cargo/bin`）→ 在插件目录内 `cargo build --release --locked`（移除 CARGO_TARGET_DIR、10 分钟超时、输出进日志）→ 安装产物 → 自动开启（物化 Skill + 启动 + Kairos 白名单）。「选择二进制安装」保留为兜底。新增 IPC `plugins:fs-watch:install-from-repo` / `plugins:pick-repo-root`。
- **Skills 列表描述单行截断**（hover title 看全文）。
- **单实例锁修复（插件仓库）**：用户手动测试撞到「检测到另一个 fs-watch 实例正在运行」误报——插件优雅退出时会写最后一次遗言心跳（向消费方标记数据截止时间），只看心跳新鲜度（<90s）的锁会被自己的遗言挡住 90s 内的重启（改配置自动重启、快速关开开关必现）。修复：`another_instance_alive` 改为「心跳新鲜 **且** state.json 的 pid 仍存活（`kill(pid, 0)`，EPERM 视为存活）」；消费方契约不变（仍只看心跳）。
- **孤儿接管（actspace 侧）**：`FsWatchService.start()` 前若发现心跳新鲜且 pid 存活，先 SIGTERM（2s 后 SIGKILL）清掉再 spawn——outDir 由 actspace 独占，写心跳的必然是之前 spawn 的孤儿（典型：dev 热重启杀主进程来不及回收子进程）。
- **强化 Kairos 主动读 watch-log**：用户观察到 Skill 已注入 catalog 但强调不够，Kairos 不会主动看监听日志。双层强化（不动每 tick 变化的内容，缓存前缀安全）：① catalog 通用指引（`renderKairosSkillCatalog`）加一句"持续更新的数据源类 Skill 每次唤醒应主动查看最新输出"——保持 skill-agnostic，不在 Kairos 代码硬编码 fs-watch；② fs-watch SKILL.md 的 description 改写为 pushy（自述"持续更新的数据源，每次唤醒先扫当天日志新增"），正文新增「使用时机」小节（对比上次最后一条 ts 只看新增、无新增即收手、回答"最近什么变了"以此为唯一权威来源）。actspace 内嵌模板与插件仓库 skill 模板同步修改。
- **设置页拆分：「插件」+「文件监听」两个分区**：用户反馈把文件监听的配置塞在「插件」页里不好懂，最终形态是**两个都保留、按心智分工**（中间曾短暂改名为单一「文件监听」分区，被用户纠正）。「插件」分区（`PluginsSettings.tsx`）管安装与版本：插件仓库路径 + 已接入插件列表（编译并安装 / 选二进制 / 重新编译按钮、版本、运行状态徽标、心跳、重试）；「文件监听」分区（`FileWatchSettings.tsx`，FolderSearch 图标，导航新 id `fileWatch`）面向用户管功能：总开关 + 状态 + 监听目录 + 监听参数，未安装时整版引导去「插件」分区。两分区共用 `fs-watch-shared.ts`（状态轮询 hook、徽标 / 心跳格式化）。「重新编译」按钮会先停旧进程再 cargo 重编、重装、重启（用于升级二进制）。settings 数据模型（`settings.plugins.*`）不变。

### 📁 Files Modified

- `docs/design-docs/agent-plugins-fs-watch.md`（新）
- `docs/exec-plans/completed/20260703-plugins-fs-watch/`（两份 plan，已归档）
- `packages/shared/src/{settings.ts, plugins.ts, index.ts}`
- `packages/desktop/src/main/{settings-service.ts, agent-runtime-context.ts, skills-service.ts, plugins/fs-watch-service.ts, index.ts}`
- `packages/desktop/src/{preload/index.ts, global.d.ts}`
- `packages/desktop/src/renderer/components/settings/{SettingsNav.tsx, SettingsPage.tsx, PluginsSettings.tsx, FileWatchSettings.tsx, fs-watch-shared.ts, SkillsSettings.tsx}`
- `packages/agent-core/src/kairos/{controller.ts, runner.ts, prompt.ts, prompt-assembler.ts, index.ts}`
- 测试：`packages/desktop/src/main/test/{fs-watch-service,agent-runtime-context,settings-service}.test.ts`、`packages/agent-core/src/kairos/test/prompt-assembler.test.ts`、renderer 测试 fixture ×4
- 文档同步：`docs/ARCHITECTURE.md`、`docs/design-docs/{core-storage-and-observability.md, front-设置页规范.md}`
- 独立仓库：`actspace-plugins/`（Cargo workspace + crates/fs-watch 全部源码与 skill 模板）
