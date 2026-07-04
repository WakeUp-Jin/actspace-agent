# Agent Plugins 插件模式与 fs-watch 文件监听设计

> 长期设计事实来源（design fact source）。本文档定义 actspace 的 Plugin 插件模式（外部二进制辅助工具）、第一个插件 `fs-watch`（Rust 文件监听程序）的文件契约，以及 actspace 侧的集成边界：设置页「插件」「文件监听」两个分区、Skills 管理分区和 Kairos Skill 白名单。后续 execution plan 从本文档派生。

## 当前状态

- 状态：已上线（2026-07-03）。插件仓库侧：`actspace-plugins` 内 fs-watch v0 已实现（`plugins/fs-watch/`，一插件一自包含文件夹布局，含 PID 探活的单实例锁）。actspace 集成侧已实施：main 进程 `FsWatchService`（spawn / 守护 / 孤儿接管 / 优雅退出）、设置页「插件」（安装与编译）+「文件监听」（开关与监听目录）两个分区、Kairos Skill catalog 接入。同日两项联动变更：Kairos 旧 poll-on-tick 巡检管道退役（目录变化感知归口本插件）；fs-watch 监听目录自动并入 Kairos 的只读授权 `readOnlyRoots`（详见 `agent-kairos-autonomous-mode.md`）。v1 曾命名为 Sidecar 并计划源码进仓，v2 定名 **Plugins** 且插件源码外置到独立仓库 `actspace-plugins`。
- 适用范围：
  - `actspace-plugins` 独立仓库（side-project 下新建）：Rust 插件源码、Skill 模板、构建发布。
  - actspace 仓库：`packages/shared`（settings 契约）、`packages/desktop`（main 进程管理 + 设置页）、`packages/agent-core`（Kairos Skill catalog）。
- 关联文档：
  - `agent-kairos-autonomous-mode.md`：Kairos 自治模式的事实来源。其 v1 poll-on-tick 巡检（watch-scanner + watch-diff）已于 2026-07-03 退役，目录变化感知统一由本插件承担。
  - `agent-skill-loading.md`：Skill 目录结构、发现路径和渐进式披露规范，fs-watch 的 Skill 形态完全遵守它。
  - `agent-browser-bridge-design.md`：另一个外部辅助程序先例（Go CLI），语言选型讨论以它为参照。

## 背景与动机

### Kairos 现有文件监听的局限

Kairos v1 的巡检刻意不用 `fs.watch`，走「轮询快照 + 集合差集」（`kairos/context/watch-scanner.ts` + `watch-diff.ts`，2026-07-03 已随管道退役删除）。算法简单可靠，但有三个天然局限：

1. **感知不到 modified**：文件内容变了、文件名没变，diff 完全看不见。
2. **粒度粗**：变化只能在下一次 tick 才被发现，两次 tick 之间的中间状态丢失。
3. **扫描成本随目录规模线性增长**：每次 tick 全量重扫。

### 为什么用独立进程 + 独立仓库

真正的 fs 事件监听（macOS FSEvents / Linux inotify）在 Electron main 进程里长期多目录监听有稳定性顾虑（这正是 Kairos v1 排除它的原因）。把监听做成独立常驻小程序：

- 崩了不影响主应用，重启成本低。
- 输出是普通文件，actspace 之外的任意 Agent 只要会读文件就能复用。
- 源码放独立仓库，避免 Rust 工具链耦合进 actspace 的 TS 单仓；actspace 只依赖文件契约。

## 命名决策：Plugins（插件）

- 采用 **Plugin / 插件**（对齐 Codex 等产品的用户心智，好理解）。
- 术语纪律：仓库文档中**浏览器侧统一称「浏览器扩展（extension）」**，「插件」专指本文档定义的外部二进制辅助工具，避免撞名。
- 曾评估并排除的候选：
  - Sidecar（伴生工具）：语义最准确，但对普通用户过于工程化，v2 弃用。
  - 桥梁（Bridge）：已被 `agent-browser-bridge-design.md` 的 Go browser bridge 占用，且 bridge 语义是"连接两端的通道"，插件是"持续生产数据的独立进程"。

术语约定：

- **Plugin（插件）**：一个独立可执行程序，伴随宿主（actspace 或任意 Agent 环境）运行，持续产出结构化数据到约定文件位置。
- **Plugin Skill**：插件的 Skill 载体形态——`SKILL.md` 说明怎么用，`references/` 承接插件的输出。

## 语言选型：fs-watch 用 Rust

fs-watch 选 Rust，核心理由是技术性的，不只是偏好：

- **递归监听**：Rust `notify` crate 原生支持 `RecursiveMode::Recursive`；Go `fsnotify` 至今不支持递归，需要自己遍历目录逐个加 watch、动态补挂新建子目录，这层胶水正是最容易出 bug 的地方。
- **macOS 表现**：`notify` 在 macOS 走 FSEvents（系统级递归监听，一个句柄管整棵树）；`fsnotify` 走 kqueue，每个被监听文件占一个文件描述符，大目录下句柄爆炸。
- **常驻形态**：单二进制、无 runtime、内存占用几 MB，适合长期后台运行。

选型不外溢：browser bridge 维持 Go，未来新插件按「哪个生态对该问题有事实标准库」选择语言。插件与 actspace 之间只有文件契约，语言无关。

## 仓库边界

| 仓库 | 内容 | 不放什么 |
| --- | --- | --- |
| `actspace-plugins`（独立新仓库） | 一个插件一个自包含文件夹 `plugins/<name>/`（语言无关，Rust / Go 均可，不用根级 Cargo workspace）；每个插件带自己的构建定义与 lockfile、`build.sh`（编译并把二进制放进 `skill/scripts/`）和 Skill 载体 `skill/`（SKILL.md + 构建产物，可整体分发） | 不放 actspace 的 TS 代码，不反向依赖 actspace |
| `actspace-agent`（本仓库） | 集成层：settings 契约、main 进程插件管理、设置页 UI、Kairos Skill catalog | 不放插件源码，不解析插件内部实现 |

两仓之间的唯一耦合是下文的**文件契约**（事件 JSONL + state.json），契约以本文档为唯一事实来源，用 `v` 字段做版本兼容。

## 设计目标

- 把文件监听升级为「独立插件 + Skill 载体」，同一份输出既服务 Kairos，也服务任意其它 Agent。
- 复杂度内置化：actspace 用户在设置页完成安装、开关、配置全部操作，不需要理解二进制和进程管理。
- 插件与宿主之间只用**文件**交换数据（输出 JSONL + 心跳 state.json），不引入 socket / RPC，接入门槛压到"会读文件"。
- Skill 生态可视化：用户能在设置页看到所有 Skill，点击安装 / 开启 / 禁用。

## 非目标（V1 明确不做）

- 不做插件市场、注册表、自动更新器。V1 只有 fs-watch，管理逻辑写在 main 进程里，等第二个插件出现再抽象。
- 不做插件与宿主的双向通信（socket / stdin 命令通道）。配置变更走「重写 config + 重启进程」。
- 不监听文件**内容**、不计算 diff patch。fs-watch 只产出「哪个路径发生了什么类型的变化」。
- 不做网络能力。fs-watch 不发任何网络请求。
- **不做 controller 直读插件日志进 tick 观测增量的路径**——Kairos 消费只走 Skill catalog（理由与取舍见下文）；若实际运行发现 Kairos 经常漏看，再回头补该路径。（原「不改动 Kairos 巡检管道」一条已过时：2026-07-03 旧巡检管道整体退役，本插件成为唯一的目录变化感知来源。）
- 不随 actspace 打包插件二进制（v0 走约定路径 + 手动安装，见下文；打包留给后续）。

## 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ actspace-plugins 仓库（独立）                                 │
│   plugins/fs-watch/           Rust 源码 + build.sh           │
│   plugins/fs-watch/skill/     Skill 载体（SKILL.md +          │
│                               scripts/ 内的构建产物二进制）    │
└─────────────────────────────────────────────────────────────┘
                    │ 构建二进制，用户安装（设置页选文件 / 手动放置）
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ <userData>/plugins/fs-watch/                                 │
│   bin/fs-watch                二进制（约定安装位置）           │
│   config.json                 设置页维护的插件配置             │
└─────────────────────────────────────────────────────────────┘
                    │ main 进程 spawn / 守护 / 优雅退出
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ <userData>/skills/fs-watch/          ← Skill 发现路径优先级 4 │
│   SKILL.md                    使用说明（给所有 Agent 看）      │
│   references/watch-log/                                      │
│     state.json                心跳：pid / roots / 最近活动    │
│     2026-07/2026-07-03.jsonl  当日事件流（按天轮转）           │
└─────────────────────────────────────────────────────────────┘
        ▲ fs-watch 进程写入              │ 读取
        │                               ▼
                             ┌──────────────────────────────┐
                             │ 消费方                        │
                             │ - Kairos：Skill catalog +     │
                             │   read_file（白名单控制）      │
                             │ - 主 Agent / 外部 Agent：     │
                             │   经 SKILL.md 指引 read_file  │
                             └──────────────────────────────┘
```

三个角色的职责：

| 角色 | 职责 | 不做什么 |
| --- | --- | --- |
| fs-watch 二进制 | 监听配置的目录，产出事件 JSONL + 心跳 | 不做业务判断、不读文件内容、不联网 |
| Skill 载体 | 承接输出（references/）+ 向 Agent 说明怎么读（SKILL.md） | 不含执行逻辑 |
| 宿主集成（actspace main） | 安装检测、spawn/守护进程、设置页、Kairos catalog | 不解析事件语义（那是 Agent 的事） |

## 文件契约（两仓之间的唯一耦合）

### 事件 JSONL

每行一条 JSON，写入 `references/watch-log/<YYYY-MM>/<YYYY-MM-DD>.jsonl`，按本地日期轮转：

```jsonc
{ "v": 1,
  "ts": "2026-07-03T16:20:01.123+08:00",
  "root": "/abs/path/to/watched-dir",     // 命中的 watch 根
  "kind": "created",                       // created | modified | removed | renamed
  "path": "docs/foo.md",                   // 相对 root 的路径
  "oldPath": null,                         // 仅 renamed 时有值
  "isDir": false }
```

事件处理规则：

- **合并去抖**：同一 path 在 `debounceMs`（默认 500ms）窗口内的多次原始事件合并为一条；`created` 后紧跟 `modified` 合并为 `created`；`created` 后紧跟 `removed` 互相抵消（不输出）。
- **rename**：平台能给出 old→new 配对时输出 `renamed`；配不上时退化为 `removed` + `created` 两条。
- **背压保护**：单日文件超过 50 MB 时停止写入并在 state.json 标记 `overflow: true`，避免病态目录爆盘。
- **只追加**：JSONL 只 append，绝不改写历史行；消费方可以安全用字节偏移做水位。
- **保留策略**：fs-watch 自身负责清理，删除 14 天前的日文件（可配置）；消费方不承担清理职责。

### 心跳 state.json

`references/watch-log/state.json`，启动时写入、之后每 30s 覆盖（tmp + rename 原子写）：

```jsonc
{ "v": 1,
  "pid": 12345,
  "startedAt": "2026-07-03T16:00:00+08:00",
  "lastHeartbeatAt": "2026-07-03T16:20:00+08:00",
  "roots": ["/abs/path/to/watched-dir"],
  "overflow": false,
  "binaryVersion": "0.1.0" }
```

- **消费方**（Agent / 只读方）判定插件存活的唯一标准：`lastHeartbeatAt` 距今 < 90s（3 个心跳周期）。消费方**不要用 pid 探活**——pid 复用会误判。
- 单实例锁（插件自身）：启动时若 state.json 心跳新鲜**且其中 pid 仍存活**（`kill(pid, 0)`）则以 exit code 2 退出 + stderr 说明，避免双写。只看心跳会误伤优雅重启：进程退出时会写最后一次遗言心跳（向消费方标记数据截止时间），90s 内的「停止 → 再启动」（改配置自动重启、快速关开开关）就会被自己的遗言心跳挡住。插件自己 kill(pid, 0) 探活可接受——误判窗口只有 90s，远短于 pid 复用周期。
- 优雅退出：收到 SIGTERM / SIGINT 后 flush 缓冲、写最后一次心跳、退出。

### 插件 config.json

```jsonc
// <userData>/plugins/fs-watch/config.json（actspace 设置页维护；外部使用者手写）
{
  "version": 1,
  "roots": [
    { "path": "/abs/path/to/watched-dir" }
  ],
  "outDir": "/abs/path/to/skill/references/watch-log",
  "excludeNames": [".git", "node_modules", ".DS_Store", ".cache",
                   "dist", "build", ".next", "__pycache__",
                   ".venv", "venv", "target"],
  "excludeHidden": true,
  "debounceMs": 500,
  "retentionDays": 14
}
```

- `excludeNames` 默认值沿用 Kairos 旧 `watch-scanner.ts` 的 `DEFAULT_WATCH_EXCLUDE` 清单（该文件已删除，清单事实来源改为本文档与插件源码），命中即跳过整个子树。
- 监听目录由设置页直接维护，**不再从 Kairos `paths.json` 生成**——插件配置与 Kairos 配置解耦，各管各的。

### CLI 形态（self-describing）

```bash
fs-watch --help                 # 用途、参数、输出格式说明
fs-watch --config <path>        # 主形态：从 JSON 配置启动
fs-watch --root <dir> --out <dir>   # 快捷形态：单目录监听（可重复 --root）
fs-watch --version
```

参数细节以 `--help` 输出为准（在插件仓库维护）；本文档只约束上面的文件契约。

## Skill 载体形态

### 物化位置

Skill 模板放在插件仓库 `plugins/fs-watch/skill/`（构建后 `scripts/` 内含二进制，整个文件夹是完整分发单元），由 actspace 在启用插件时**物化**到用户级 Skill 目录 `<userData>/skills/fs-watch/`。选这里而不是项目 `.agents/skills/` 的原因：

- `references/` 是运行时持续写入的数据，放进任何 git 仓库都会污染状态。
- `<userData>/skills/` 已经在 `agent-skill-loading.md` 的扫描路径里（user scope 优先级 4），主 Agent 零改动即可发现。

给 actspace 之外的 Agent 使用时，把构建后的 Skill 目录整体复制到 `~/.agents/skills/fs-watch/`（二进制已在 `scripts/fs-watch`），按 SKILL.md 指引启动。

### SKILL.md 要点

frontmatter 遵守 `agent-skill-loading.md` 规范。因为 Kairos 消费只走 Skill 读取（没有 controller 强制注入增量），description 要写得 **pushy**——明确自述"这是持续更新的数据源，每次唤醒 / 开始工作都应先扫一眼当天日志新增事件"，而不是被动等任务匹配。正文必须覆盖：

1. **是什么**：fs-watch 插件的输出目录，记录被监听目录的文件变化事件。
2. **使用时机**：每次唤醒先扫当天日志，对比上次读到的最后一条 `ts` 只看新增；无新增或心跳过期就收手，不反复精读历史。
3. **先查存活**：读 `references/watch-log/state.json`，`lastHeartbeatAt` 距今 < 90s 才代表数据实时；过期则明确告知用户"监听未在运行"，不要拿旧数据当实时状态。
4. **怎么读**：当日文件是 `references/watch-log/<YYYY-MM>/<YYYY-MM-DD>.jsonl`，每行一条事件；关心近期变化从文件尾部读，回溯按天往前翻。
5. **事件语义**：`kind` 四种取值、`path` 相对 `root`、rename 可能退化为 removed+created。
6. **边界**：事件只反映"路径发生了变化"，不含文件内容；需要内容自己 `read_file`。

## actspace 集成

### 安装与二进制发现

- 约定安装位置：`<userData>/plugins/fs-watch/bin/fs-watch`。
- **主路径（一键编译安装）**：设置页「插件」分区的「插件仓库」卡片配置仓库路径（`settings.plugins.repoRoot`），指向用户 clone 的 `actspace-plugins` 仓库绝对路径。设置后未安装时显示「编译并安装」按钮，已安装时显示「重新编译」按钮（升级用：先停旧进程 → 重编 → 重装 → 重启），一键完成：
  1. 校验仓库结构（`plugins/fs-watch/Cargo.toml` 存在——每个插件是自包含文件夹，自带构建定义与 lockfile，无根级 workspace）；
  2. 发现 cargo（先 PATH，再回落 `~/.cargo/bin/cargo`——macOS GUI 启动的 app PATH 通常不含后者）；找不到给出安装 Rust 的指引；
  3. `cargo build --release --locked`（cwd = `plugins/fs-watch/`，显式移除 `CARGO_TARGET_DIR`，10 分钟超时，输出进主进程日志）；
  4. 安装 `plugins/fs-watch/target/release/fs-watch` 到约定位置（复制 + chmod + `--version` 校验）；
  5. renderer 侧随即自动打开总开关 → 物化 Skill + 启动进程 + 并入 Kairos 白名单。复杂度全部藏在代码后面，用户视角就是一次点击。
- **兜底路径**：「选择二进制安装」文件选择器仍保留（未设仓库路径、或没装 Rust 工具链时使用）。
- 设置页检测约定位置：存在 → 显示版本（`fs-watch --version`）与开关；不存在 → 上述安装入口。
- 后续插件稳定后再评估随 actspace 打包（extraResources）或下载安装，v0 不做。

### 设置页「插件」与「文件监听」两个分区

fs-watch 在设置页拆成两个导航分区，按用户心智分工（用户反馈：安装/编译这类"插件"操作和"文件监听"这个功能混在一个页面不好懂）：

**「插件」分区**——管插件二进制的安装与版本（未来新插件都加在这里）：

1. 「插件仓库」卡片：`settings.plugins.repoRoot` 配置（见上节「安装与二进制发现」）。
2. 「已接入的插件」列表：每个插件一张卡片，显示安装状态 / 版本号 / 运行状态徽标 / 最近心跳，提供「编译并安装」「选二进制」「重新编译」按钮；卡片文案指引用户到对应功能分区做开关与配置。

**「文件监听」分区**——面向用户管功能本身：

1. **总开关**：开启 = spawn 进程 + 守护 + 挂优雅退出；关闭 = SIGTERM 停进程。状态持久化，应用重启后按状态自动拉起。
2. **运行状态**：运行中 / 已停止 / 异常（附内联重试），依据心跳新鲜度（<90s）展示，附最近心跳时间。
3. **配置**：监听目录列表（增删，目录选择器）、排除规则、日志保留天数。写 `config.json`，变更后自动重启进程生效。
4. 未安装时整版引导到「插件」分区先安装。

关闭开关**不删除** Skill 目录和历史日志——再次开启无缝续写；用户想清理可手动删。

### 进程生命周期（main 进程职责）

- spawn：以 `--config <userData>/plugins/fs-watch/config.json` 启动，stdout/stderr 落应用日志（`[plugin:fs-watch]` 前缀）。
- 守护：异常退出后指数退避重启，10 分钟内最多 5 次，超过置「异常」状态并停止重试（设置页可手动重试）；exit code 2（单实例锁冲突）不自动重启，直接置异常。
- 孤儿接管：start 前若发现 state.json 心跳新鲜且 pid 存活，先 SIGTERM（2s 后 SIGKILL）清掉再 spawn——outDir 由 actspace 独占管理，往这里写心跳的进程必然是 actspace 之前 spawn 的（典型：dev 热重启杀主进程来不及给子进程发 SIGTERM 留下的孤儿）。
- 优雅退出：应用 `before-quit` 时发 SIGTERM，2s 超时后 SIGKILL（与 Kairos `shutdown()` 同阶段处理）。

### Kairos 集成：Skill catalog（唯一路径）

插件价值通过 Skill 进入（不直连 tick 观测增量）：

- Kairos 新增最小 Skill catalog 能力：白名单 `kairos.enabledSkills`（默认 `[]`）命中的 Skill，以现有 catalog 格式（name / description / location）注入 Kairos system prompt 配置提示段（低频内容，不破坏缓存前缀）；正文仍走 `read_file` 渐进式披露。
- 授权走**只读**通道：Skill 根目录与 fs-watch 正在监听的目录一起进入 Kairos guard 的 `readOnlyRoots`（读工具放行、写工具拒绝）；可写授权仍只来自 paths.json 的 `allowedRoots`。用户把目录加入文件监听即视为允许 Kairos 阅读其中内容。fs-watch 监听目录或开关变化时 main 进程重建 KairosController，保证授权实时同步。
- 联动：设置页开启「文件监听」时，默认把 `fs-watch` 加入 `kairos.enabledSkills`（用户可手动移除）。

**已知取舍**：只靠 catalog，Kairos 不保证每次 tick 都读监听日志——它是"知道有这个能力、需要时来读"。缓解手段（前两条已实施）：① catalog 渲染的通用指引里加一句"持续更新的数据源类 Skill 每次唤醒应主动查看最新输出"（保持 skill-agnostic，不在 Kairos 代码里硬编码 fs-watch）；② fs-watch 的 description 写得 pushy（自述为持续数据源 + 每次唤醒先扫）；③ 用户可在 Kairos `rule.md` 写"每次唤醒先看一眼文件变化"进一步强化。若实际运行仍发现 Kairos 经常漏看，再补 controller 直读观测增量的路径（该方案的水位 / 回退设计已在本文档 v1 版本中论证过，可从 git 历史找回）。

## Skills 管理分区（与「插件」「文件监听」分开成组）

新增独立设置分组「Skills」，把散落在文件系统里的 Skill 生态可视化。与前两个分区分开的理由：Skill 是**能力知识**的管理，插件是**外部进程**的管理，混在一起概念会糊。

- **列表**：展示所有扫描到的 Skill（项目级 + 用户级，即 `agent-skill-loading.md` 的 7 个扫描根），每张卡片显示 name、description、scope / source、路径、是否被同名覆盖（shadowed）、warning 状态。
- **两个维度的开关**（故意不对称）：
  - **主 Agent**：黑名单 `skills.disabled: string[]`，默认全开。理由：主 Agent 交互式，catalog 只注入元信息成本低，默认全开符合现状。
  - **Kairos**：白名单 `kairos.enabledSkills: string[]`，默认全关。理由：后台自治 Agent 上下文预算紧、行为要可预期，不应默认继承整个 Skill 生态。
- **安装**：选择本地 Skill 文件夹（含 SKILL.md），校验 frontmatter 后复制到 `<userData>/skills/`，立即出现在列表。
- **卸载**：删除该 Skill 目录（二次确认）；只允许卸载 `<userData>/skills/` 下的条目，项目级 / 其它生态目录的 Skill 只能禁用不能删。
- 插件物化的 Skill（fs-watch）与用户自装 Skill 在此页一视同仁，不搞特殊。

## settings.json 契约扩展

`packages/shared/src/settings.ts` 的 `AppSettings` 扩展：

```ts
export interface PluginsSettings {
  fsWatch: {
    /** 文件监听插件总开关；开启后 main 进程负责 spawn 与守护。 */
    enabled: boolean;
  };
}

export interface SkillsSettings {
  /** 主 Agent Skill 黑名单（默认 []，全开）；命中者不进主 Agent catalog。 */
  disabled: string[];
}

// KairosSettings 追加：
//   /** Kairos Skill 白名单（默认 []，全关）；命中者注入 Kairos catalog 并授权其根目录。 */
//   enabledSkills: string[];
```

## 安全边界

- fs-watch 只读文件系统**元数据**（路径、类型、事件），不读文件内容，不联网，输出目录固定为 config 指定的 `outDir`。
- 事件 JSONL 里的路径可能包含敏感文件名；references/ 位于 `<userData>`，不进仓库、不上传。Kairos blocklist（如 `**/.env`）在 guard 层照常生效：插件会记录 `.env` 变化的事件行，但 Kairos 想读该文件内容仍会被拒绝。
- Skill 目录内容不会被 Agent 自动执行（遵守 `agent-skill-loading.md`：不自动执行 scripts）；插件进程只由 main 进程按设置开关 spawn。
- 「选择二进制安装」是用户显式动作，等价于用户自己运行该程序；actspace 不校验二进制签名（v0 取舍，用户对自己选择的二进制负责）。
- 供应链：插件仓库提交 `Cargo.lock`，构建走该仓库自己的 CI；actspace 侧遵循 `docs/SUPPLY_CHAIN_SECURITY.md` 的既有约定，不因插件降低标准。

## 分阶段范围

### V0（最小闭环）

- `actspace-plugins` 仓库：fs-watch 实现（config 加载、notify 递归监听、去抖合并、JSONL 按天输出、state.json 心跳、单实例锁、SIGTERM 优雅退出、保留清理）+ Skill 模板 + 构建脚本。
- actspace：settings 契约扩展；main 进程安装检测 / spawn / 守护 / 退出挂钩；设置页「插件」（安装、编译、版本）与「文件监听」（开关、状态、配置）两个分区。
- 单测：Rust 侧事件合并 / 轮转 / 心跳（插件仓库）；TS 侧进程管理状态机、心跳判定。

### V1（补齐）

- Kairos Skill catalog：`kairos.enabledSkills` 白名单 + catalog 注入 + allowedRoots 联动 + 与插件开关的联动。
- 设置页「Skills」管理分区：列表、双维度开关、安装 / 卸载。
- Skill 物化流程接入插件开关。

### 后续演进（不承诺）

- 第二个插件出现时，把安装 / spawn / 守护 / 心跳判定抽象为通用 Plugin manager。
- 插件二进制随 actspace 打包或下载安装。
- 若 Kairos 漏看监听日志成为真实问题，补 controller 直读观测增量路径。
- brief `trigger: event` 与插件事件打通（watch 目录出现变化立即注入 tick）。

## 与现有文档的关系

- `agent-kairos-autonomous-mode.md` 中 watch 的 v2–v5 演进猜想（mtime 跟踪、事件 tick 等）由本设计接管；该文档的 watch 小节已标注退役并指向本文档（2026-07-03）。
- 实施时 `<userData>/plugins/`、`<userData>/skills/fs-watch/` 的落盘布局需同步进 `core-storage-and-observability.md`。
- 设置页新增「插件」「文件监听」「Skills」分组时同步 `front-设置页规范.md`。
- `agent-current-module-map.md` 在实现完成后记录插件管理与 Kairos catalog 模块。

## 维护规则

- 插件与 actspace 之间的文件契约（JSONL schema、state.json、心跳判定标准、config.json）以本文档为唯一事实来源；改契约必须同步 `v` 字段和 SKILL.md。
- 新增插件时，先在本文档补充命名与职责表，再拆 execution plan；插件实现细节在 `actspace-plugins` 仓库维护，本文档只维护契约与集成边界。
- fs-watch 的 CLI 参数变化优先体现在 `--help` 输出，本文档不复述参数细节。
