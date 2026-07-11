# fs-watch

递归监听本机目录的文件变化（created / modified / removed / renamed），事件按天写 JSONL，带 30s 心跳与 14 天自清理。Rust 实现，单二进制、无 runtime、不联网、不读文件内容。

契约（JSONL schema、state.json、心跳判定）的唯一事实来源：`actspace-agent` 仓库的 `docs/design-docs/agent-plugins-fs-watch.md`。

## 能力概览

- 基于 `notify`（macOS 走 FSEvents）的递归监听，一个句柄管整棵目录树。
- 同路径事件在 500ms（可配）窗口内合并去抖；`created`+`removed` 互相抵消。
- 输出只追加（append-only），消费方可安全用字节偏移做水位。
- 单实例锁：同一输出目录已有新鲜心跳**且对应 pid 仍存活**时，重复启动以退出码 2 退出（优雅退出留下的遗言心跳不会挡住 90s 内的重启）。
- 单日事件文件超 50 MB 熔断并在心跳标记 `overflow: true`，避免病态目录爆盘。

## 构建

```bash
./build.sh
# 产物：skill/scripts/fs-watch
```

## 安装为 Skill（推荐外部 Agent 使用方式）

在仓库根目录执行：

```bash
./scripts/install.sh fs-watch
# 构建并把 skill/ 整体安装到 ~/.agents/skills/fs-watch/
```

之后启动监听：

```bash
~/.agents/skills/fs-watch/scripts/fs-watch \
  --root <要监听的目录> \
  --out ~/.agents/skills/fs-watch/references/watch-log
```

Agent 按 `skill/SKILL.md` 的指引读取心跳与事件。

## 在 actspace 中使用

构建后在 actspace 设置页「插件」分区点「编译并安装」（需先设置仓库路径）或「选择二进制安装」；安装后到「文件监听」分区开启并配置，选中 `skill/scripts/fs-watch`；后续开关、监听目录配置都在设置页完成，进程由 actspace 托管。

## CLI

```bash
fs-watch --config <path>              # 主形态：从 JSON 配置启动
fs-watch --root <dir> --out <dir>     # 快捷形态（--root 可重复）
fs-watch --version
fs-watch --help                       # 参数与输出格式的权威说明
```

退出码：`0` 正常；`1` 参数 / 配置错误；`2` 已有实例在运行（心跳新鲜且 pid 存活）。

## 输出

写入 `--out` 指定目录：

- `<YYYY-MM>/<YYYY-MM-DD>.jsonl`：事件流，每行一条 `{ v, ts, root, kind, path, oldPath, isDir }`。
- `state.json`：心跳（30s 一次）；`lastHeartbeatAt` 距今 < 90s 代表存活，**不要用 pid 探活**。

## 测试

```bash
cargo test --locked
```
