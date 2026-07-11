---
name: fs-watch
description: 本机文件监听插件的持续输出——被监听目录的文件创建 / 修改 / 删除 / 重命名事件按天写入 JSONL 日志。这是一个持续更新的数据源：每次唤醒 / 开始一轮工作时都应先扫一眼当天日志的新增事件，再决定要不要深入；也用于回答「某目录最近发生了什么变化」、统计某文件的修改时间与次数。读取前必须先检查 references/watch-log/state.json 心跳确认插件存活。
metadata:
  # host  = 进程由宿主应用（actspace）自动启动和守护，Agent 不要执行启动命令
  # agent = 无宿主托管，需要 Agent / 用户自行启动（install.sh 安装时自动改写为此值）
  process-management: host
---

# fs-watch 文件监听

一个独立运行的二进制插件在持续监听若干本机目录，把文件变化事件写到本 Skill 的 `references/watch-log/` 下。日常使用时你只负责读取输出，不要随手启停进程。

## 使用时机（重要）

- **每次唤醒 / 开始一轮工作先扫一眼**：读当天事件日志，与你上次看到的最后一条 `ts` 对比，只关注新增部分。有值得注意的变化（新文件、密集修改、删除/重命名）就纳入本轮判断，必要时读对应文件内容或记进笔记。
- 没有新增事件、或心跳已过期时，扫一眼即可结束，不要反复精读整份历史日志。
- 用户问「最近哪些文件变了 / 某目录发生了什么」时，这里是唯一权威来源，不要用目录扫描去猜。

## 使用步骤（每次都要做）

1. **先查心跳**：读 `references/watch-log/state.json`。
   - `lastHeartbeatAt` 距当前时间 **< 90 秒** → 插件存活，数据可信。
   - 超过 90 秒 → 插件已停止，事件流从心跳时间起不再更新；回答时必须说明数据截止时间。
   - `overflow: true` → 当日事件量超限已熔断，当天记录不完整，必须提醒用户。
2. **再读事件**：当天事件在 `references/watch-log/<YYYY-MM>/<YYYY-MM-DD>.jsonl`（按本机时区）。历史日期同理。每行一条 JSON：

```json
{ "v": 1, "ts": "2026-07-03T16:20:01.123+08:00", "root": "/abs/watched-dir",
  "kind": "created", "path": "docs/foo.md", "oldPath": null, "isDir": false }
```

- `kind`：`created` / `modified` / `removed` / `renamed`（`renamed` 时 `oldPath` 是旧路径）。
- `path` 是相对 `root` 的路径；绝对路径 = `root` + `/` + `path`。
- 行按时间递增追加；同一文件 500ms 内的连续变化已合并为一条。

## 心跳过期时怎么办（先看 frontmatter 的 `process-management`）

- `host`：进程由宿主应用自动启动和守护，**不要执行任何启动命令**；提示用户到 actspace 设置页「文件监听」分区开启即可（未安装则先到「插件」分区安装）。
- `agent`：本环境没有宿主托管。仅当用户明确要开启监听时，在后台启动随本 Skill 分发的二进制：

```bash
<本Skill目录>/scripts/fs-watch --root <要监听的目录> --out <本Skill目录>/references/watch-log
```

- `--root` 可重复以监听多个目录；更多参数见 `scripts/fs-watch --help`。
- 进程有单实例锁：若已有实例（心跳新鲜且 pid 存活）在写同一输出目录，重复启动会以退出码 2 直接退出，这不是错误。

## 注意

- 这里只有**路径级**事件，没有文件内容 diff；要看内容变化请直接 read 对应文件。
- 文件只保留最近 14 天；更早的已被自动清理。
- `state.json` 里的 `roots` 是当前实际监听的目录列表；用户问到未在列表中的目录时，说明该目录未被监听。
