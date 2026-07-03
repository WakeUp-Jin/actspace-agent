# Plan 01：actspace-plugins 仓库与 fs-watch 插件实现

## 目标

在 `side-project/` 下创建独立仓库 `actspace-plugins`（Cargo workspace，一仓多插件），完成第一个插件 `fs-watch` 的 Rust 实现：递归监听配置目录，事件按天写 JSONL，state.json 心跳，单实例锁，优雅退出，保留期自清理。产物是一个可通过 `cargo build --release` 得到的单二进制。

## 范围

- 包含：`actspace-plugins` 仓库骨架、`crates/fs-watch` 完整实现与单测、Skill 模板（给非 actspace 使用者）、README、构建脚本。
- 不包含：actspace 侧任何代码（见 Plan 02）；网络能力；文件内容 diff；插件自动更新。

## 必读文档

- `actspace-agent/docs/design-docs/agent-plugins-fs-watch.md`：文件契约（JSONL schema、state.json、心跳判定、config.json）是唯一事实来源，本 plan 不得偏离。
- `actspace-agent/AGENTS.md`（若由子会话执行）。

## 背景与约束

- 仓库位置：`/Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins`（与 actspace-agent 平级）。
- Rust 工具链已就绪（cargo 1.95）。
- 语言选型 Rust：`notify` crate 原生 `RecursiveMode::Recursive` + macOS FSEvents。
- 两仓唯一耦合是文件契约；本仓库不依赖 actspace 任何代码。
- exclude 默认名单必须与设计文档一致（同 Kairos `DEFAULT_WATCH_EXCLUDE`）。

## 任务拆解

### T1 仓库骨架

- `git init` + `.gitignore`（`target/`、`.DS_Store`）。
- 根 `Cargo.toml`：`[workspace] members = ["crates/fs-watch"]`，`resolver = "2"`。
- `README.md`：仓库定位（actspace 外部插件集合）、构建方式、与 actspace 的契约文档指向。
- `scripts/build.sh`：`cargo build --release`，输出产物路径提示。

### T2 fs-watch crate

依赖（用 `cargo add` 取最新版）：`notify`、`serde`（derive）、`serde_json`、`chrono`、`ctrlc`（termination feature）。

模块划分（`crates/fs-watch/src/`）：

| 文件 | 职责 |
| --- | --- |
| `main.rs` | 参数解析（手写，支持 `--config` / `--root` / `--out` / `--version` / `--help`）、装配、信号处理、主循环 |
| `config.rs` | `Config` 结构体 + JSON 加载 + 默认值（excludeNames / excludeHidden=true / debounceMs=500 / retentionDays=14）+ 校验 |
| `event.rs` | `WatchRecord`（v/ts/root/kind/path/oldPath/isDir）serde 序列化；notify `EventKind` → `created|modified|removed|renamed` 映射 |
| `coalesce.rs` | 去抖合并器（纯逻辑，可单测）：同 path 在 debounce 窗口内合并；created+modified→created；created+removed→抵消；modified+removed→removed |
| `writer.rs` | 按天轮转 JSONL writer（`<out>/<YYYY-MM>/<YYYY-MM-DD>.jsonl` append）、50MB overflow 熔断、retention 清理（删过期日文件与空月目录） |
| `heartbeat.rs` | state.json（pid/startedAt/lastHeartbeatAt/roots/overflow/binaryVersion）tmp+rename 原子写，每 30s 一次 |

关键行为：

- 排除规则：事件路径任一 component 命中 excludeNames、或（excludeHidden 时）以 `.` 开头 → 丢弃该事件。
- rename：notify `RenameMode::Both` → 一条 `renamed`（含 oldPath）；`From`/`To` 单独出现 → 退化为 `removed`/`created`。
- `path` 落盘为相对命中 root 的路径；`isDir` 用 `fs::metadata` best-effort，取不到（如已删除）为 false。
- 单实例锁：启动时读 state.json，`lastHeartbeatAt` 距今 < 90s → stderr 说明 + exit code 2。
- SIGTERM / SIGINT：flush coalescer 与 writer、写最后一次心跳、退出 0。
- 主循环实现建议：notify watcher → mpsc channel → 主线程 `recv_timeout(100ms)` 驱动 coalescer flush 与心跳计时，不引入 tokio。

### T3 Skill 模板（给非 actspace 使用者）

`crates/fs-watch/skill/SKILL.md`：frontmatter（name: fs-watch, description 按设计文档写 pushy）+ 正文五要点（是什么 / 先查 state.json 心跳 / 怎么读当日 JSONL / kind 语义 / 只有路径没有内容）。

### T4 单测

`cargo test` 覆盖（各模块内 `#[cfg(test)]`）：

- coalesce：三条合并规则 + 窗口过期 flush + 不同 path 互不影响。
- writer：日文件命名与月目录；跨天轮转；retention 删除 15 天前文件、保留 14 天内；overflow 后不再写事件行。
- config：缺字段回默认值；坏 JSON 报错信息可读。
- event：kind 映射与 JSONL 字段序列化（含 oldPath 为 null 时省略或 null 的稳定形态——契约用 null）。
- heartbeat：state.json 字段完整、原子写落盘可重读。

## 验证方式

- `cargo test`（全绿）。
- `cargo build --release` 产物存在。
- 手工冒烟：`./target/release/fs-watch --root /tmp/fswatch-demo --out /tmp/fswatch-out`，另开终端 touch/rm 文件，确认 JSONL 行与 state.json 心跳符合契约；`--help` / `--version` 输出正常；二次启动被单实例锁拒绝。

## 失败与回退

- 本仓库独立，任何失败不影响 actspace；最小回退 = 删除目录重来。
- notify 在特定平台的事件形态差异（如 rename 配对失败）按契约允许退化为 removed+created，不视为失败。

## 进度记录

- [x] T1 仓库骨架
- [x] T2 fs-watch 实现
- [x] T3 Skill 模板
- [x] T4 单测 + 冒烟验证
