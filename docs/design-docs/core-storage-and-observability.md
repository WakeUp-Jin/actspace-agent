# 存储与可观测性边界

> 状态：当前 v2 实现事实。旧 `sessions/`、可变 conversation 文件、独立 Context state 文件和 Trace sidecar 属于 v1，不是当前持久化契约。

Runtime 公共契约见 [`agent-plugin-runtime/`](agent-plugin-runtime/README.md)，Session schema 见 [`agent-spec-session-format-v1.md`](agent-plugin-runtime/agent-spec-session-format-v1.md)。

整体结构及读写流程见[数据存储结构与职责](core-data-storage-design.md)；模块 API、默认预算与已知限制见[职责与决策记录](core-data-storage-responsibilities.md#7-2026-10-18-实现落点与边界)。本文维护物理布局、Host 配置和观测边界。

## 数据根目录

Desktop 与 CLI 使用同一个平台默认 `dataRoot`，目录名固定为大小写敏感的 `ActSpace`；Host 仍可通过显式 `--data-dir` 或 `ACTSPACE_DATA_DIR` 覆盖。Electron 的 `userData` 被设置为同一 canonical root，因此两端共享 Session、artifact 和运行时数据。

默认路径：

```text
macOS:   ~/Library/Application Support/ActSpace
Linux:   $XDG_DATA_HOME/ActSpace，未设置时 ~/.local/share/ActSpace
Windows: %APPDATA%/ActSpace
```

Desktop 以这个 canonical root 作为 Electron `userData`，并解析以下根目录：

```text
<dataRoot>/
├── sessions-v2/
├── artifacts-v2/
├── tmp/
├── settings.json
├── secrets.json
└── ...其他 Desktop registry / preference 文件
```

日志根目录分两种情况：

- 在仓库开发态启动时写入仓库 `logs/`；
- 安装态或无法定位仓库时写入 `<dataRoot>/logs/`。

用户 workspace 与 `dataRoot` 是不同概念。`ACTSPACE_WORKSPACE_ROOT`、识别到的仓库根或 Host 默认目录决定文件工具 workspace；不得把 `userData` 当作代码 workspace。

## 存储接口与当前 JSONL 实现

Session 业务依赖 `@actspace/session-storage` 的 provider/handle 契约；创建、读写、列表、恢复、fork 和投影缓存经同一后端。JSONL 的目录、writer lease、fsync 和物理修复归 `@actspace/session-jsonl`。独立内存实现验证契约可替换；SQLite/MySQL 作为 Session 事实存储后端尚未实现。当前 `runtime-v2/usage-read-model.sqlite` 仅为 Usage/历史查询派生索引，通过 Provider 的有界事件读取同步，不能据此推导为已支持 SQLite Session 后端；状态见[SQLite 专题](筛选存储改版V2-增加SQLite/README.md)。详见[存储规范](agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)。

下列是默认 JSONL 后端的物理布局，不是所有后端必须使用的公共格式：

```text
<dataRoot>/sessions-v2/<sessionId>/
├── journal.jsonl
├── artifacts/
├── recovery/
├── .writer-lock/          # 仅持有 writer lease 时存在
└── visualizations.json    # Desktop 可选派生缓存，不是 Session 事实源
```

其中：

- `journal.jsonl` 是已记录 Session 事件的恢复事实源，包含 Header 与 append-only Event Envelope；引用的 artifact 正文和应用配置等有各自存储，不能仅凭日志恢复整个应用的全部数据；
- `artifacts/` 是 Session persistence 预留的受管目录，不代表所有 concrete tool artifact 当前都物理存放在这里；
- `recovery/` 保存 torn-tail repair 前的 forensic 副本和失效 writer lock；
- `.writer-lock/owner.json` 保存当前 writer lease，关闭 Session 后移除；
- `visualizations.json` 保存 Desktop 对 Assistant 回复生成的自包含 HTML，可删除并重新生成，不参与 Agent 历史恢复。

v2 不创建或读取以下 v1 文件：

```text
meta.json
session.jsonl
context-state.json
traces/<agentRunId>.jsonl
```

旧 `~/.actspace/`、`~/Library/Application Support/actspace/` 等 lowercase data root 不会被新默认路径自动混合读取、删除或迁移；在大小写不敏感文件系统上，lowercase 与 `ActSpace` 可能是同一目录。需要保留的数据通过显式 `--data-dir` 访问，迁移应由单独的、可审核流程完成。

旧 `<dataRoot>/sessions/` 原位保留，只用于用户历史数据和迁移取证；v2 不自动导入、恢复或删除。

## Journal、Surface 与 Projection

Journal 管理不可变领域事件；完整持久事实位于 JSONL，运行内存默认仅保留 512 条 / 4 MiB 预算的近期正文，未保存事件不得淘汰。Session Surface 是事件经过 append / replace 语义折叠后的有效模型历史；Runtime Projection 再把 Surface 与事件投影为 Host-facing DTO。当前状态、待落盘队列与近期正文是不同对象，4 MiB 不是整个进程的内存上限。

```text
journal.jsonl
    ↓ codec + invariant validation
Session Journal / Surface
    ↓ projection（另带 accepted / durable 水位）
RuntimeV2SessionSnapshot
    ↓ fixed renderer adapter
SessionRecord / Context / Usage
```

必须保持以下边界：

- Journal 不能保存 renderer 专用组件状态；
- Context assembly 不拥有另一份可变 conversation；
- renderer 不直接读取 Journal 文件，只通过 typed IPC 请求 Runtime snapshot 或事件投影；
- diagnostics 和 live progress 不是持久恢复事实，不能反向覆盖 Journal；
- Compaction 通过 `surface/replaced` 事务替换有效 Surface 区域，不改写已有历史行。

## Context、Usage 与 Trajectory

当前 Context 面板没有独立持久化文件。实时内容来自 `context.engine` 内存实例的只读投影；历史请求与趋势来自派生查询读模型。没有实时实例时，可用最近一次请求信息回退展示并标记为 last-request / stale，不能冒充当前状态。具体读取与同步路径见[Context 决策记录](上下文管理引擎设计/上下文管理引擎V2/07-Step增量更新与披露面板决策记录.md)。历史 `request/context` Journal event 提供下列请求信息：

- `systemSections` -> System Prompt、Rules、Skills；
- `tools` -> Tool Definitions；
- `facts` -> Runtime / Host facts；
- `messages` -> Conversation；
- 最近 Compaction summary -> Summarized Conversation。

Usage 和成本来自 Session Journal 的 request / assistant terminal usage facts。Desktop fixed-renderer projection 额外从 `request/header`、`request/context`、`assistant/message`、`step/end`、`llm/retry`、`tool/call` 和 Tool terminal 事件重建 `UsageActivitySnapshot`，按真实 request / tool invocation 输出稳定 activity ID、状态、延迟、重试链和成本依据。`UsageStatisticsSnapshot` 继续作为旧 UI/调用方的兼容适配器，不能成为第二份事实账本。

分析观测页面及专用 Analysis / Trace IPC 已于 2026-09-06 退役。Trajectory 继续从 Journal 派生运行轨迹；当前没有独立 Trace JSONL、summary sidecar 或 retention worker。Journal 仍是聊天恢复、Context、Usage 和 Trajectory 的事实来源。

## Artifact

Artifact 的语义所有权属于 Session / Tool call，但当前 Desktop 与 persistent CLI 的 concrete store 使用：

```text
<dataRoot>/artifacts-v2/<artifactId>
<dataRoot>/artifacts-v2/<artifactId>.json
```

元数据记录 `sessionId`、`callId`、`pluginId`、`toolId`、MIME、大小与 SHA-256。Desktop 与 Node store 在返回引用前 fsync 正文、元数据及目录；日志中的引用不等于正文已经包含在 JSONL 导出中。读取时必须：

1. 校验 artifact ID；
2. 验证实际路径没有逃出 store root；
3. 校验 owner session；
4. 重新计算大小和 SHA-256；
5. 只通过 Host API 返回 bytes 或安全预览。

Agent 的本地文件回读由 Host `resolveForSession` 校验后提供精确路径；`read_file` / `grep` 可读取本会话 artifact，写入工具不获得例外。大 Bash 输出不自动全文展开，图片只在 Provider 请求边界读取；完整契约见[工具输出与引用](tool-system/agent-tool-output-references.md)。

CLI ephemeral run 使用系统临时目录中的一次性 artifact store，并在退出时删除。Journal 只保存 artifact reference，不保存 Base64、Authorization header、远程签名 URL 或不受控绝对路径。

## Fork 与恢复

Fork 不是复制一个 v1 会话目录。当前 Profile 的 App Bundle Service `forkMainSession()` 通过 Session Store 在指定 `boundarySeq` 创建新 Header 与事件种子，并记录 lineage；新 Session 获得独立 writer lease 和后续事件序列。

Desktop fork 会将该前缀实际引用的附件与工具制品复制为子会话独立拥有的新制品。相同旧 ID 只复制一次；事件 data、surface 及请求快照中的结构化引用同步替换，普通文本不做 ID 字符串替换。复制时继续校验父会话归属和内容完整性。新会话目录独占创建，复制或 Journal 写入失败时清理本次副本与目录，不触碰既有会话。Host 未提供制品复制能力时，带制品的 fork 明确失败，纯文本 fork 仍可用。旧版本已经生成的失效 fork 不自动迁移。

恢复分两类：

- **运行中断恢复**：为未完成 request、tool、step 和 turn 追加 `aborted`、`outcome-unknown` 与 recovery transaction；
- **torn-tail repair**：仅对“前缀合法、最后一行撕裂”的 Journal 执行。修复前把原文件按 digest 复制到 `recovery/`，再原子替换新 Journal。

中间坏行、未知 required codec、身份冲突或不满足 invariant 的 Session 不得静默修复为可写状态。

## 设置与凭据

- `settings.json`：main-owned 非敏感设置。P0 后物理写入 `version: 4` 逻辑 namespace，包括 provider/connection、模型选择、Prompt 路径、工具开关和快捷键；v1/v2/v3 只作为迁移输入并保留备份，具体结构见 [`front-设置中心重构规范.md`](frontend/front-设置中心重构规范.md)；
- `secrets.json` v2：main-only 明文凭据，文件权限收紧为 `0600`；
- renderer 只接收 `hasApiKey`、连接状态、模型目录和脱敏错误；
- Desktop provider key 不从仓库 `.env` 读取；CLI 才读取启动进程显式提供的环境变量。

旧 `secrets.json` v1 只允许在 main 内完成全量解密校验后原子迁移。迁移失败时必须保留原文件并禁止用空状态覆盖。

Main 侧实现位于 `apps/desktop/src/main/settings/`。`settings-service.ts` 只是再导出原有对外 API 的入口，调用方都从这里 import。

- **`store.ts`**：`SettingsStore` 持有内存状态，负责：
  - 读写 `settings.json` / `secrets.json`；
  - legacy 凭据解密；
  - 写入失败时的回滚（`restoreFilesBestEffort`）；
  - 串行 mutation 队列；
  - v4 变更通知。
  这些只在 store 一处。
- **`facades/`**：业务操作，都是以 store 为第一个参数的函数，分 `providers`、`custom-connections`、`media`、`search`、`general` 五组。`service.ts` 的 `SettingsService` 持有 store，公开方法只转调这些函数。
- **纯函数模块**：`migrations.ts`（v1–v3 → v4，冻结）、`defaults.ts`、`sanitize.ts`、`custom-connection.ts`、`secrets-file.ts`、`atomic-io.ts`、`system-prompt-file.ts`。
- **`env.ts`**：把搜索 key 和工具偏好写进 `process.env` 的唯一位置，见技术债「main / 子进程环境（C1）」。

依赖方向是 service → facades → store → 纯函数，store 不反向依赖 facade。

### 设置中心 v4 的持久化边界（已确认，P0–P5 已实现）

设置中心重构采用“UI 统一、存储所有权分层”的方案：

- `settings.json` 仍是单个物理文件，但内部按 `general`、`models`、`tools`、`media`、`skills`、`subagents` 和 `activity.usage` 划分逻辑 namespace；不因为页面分组而拆出多个配置文件。
- `models` 的 `connections`、`definitions` 和 `installed` 使用稳定 ID，任务默认只保存稳定的 `modelKey` / binding 引用，不通过展示名称关联。
- `general.personalization` 保存 `displayName` 和 `responseStyle`；System Prompt 正文继续保存在 `<dataRoot>/prompts/main-agent.md`，身份偏好不能覆盖系统约束、项目指令或安全策略。
- 主题、字体、字号等首屏 Client UI 偏好第一阶段继续保存在 renderer `localStorage`，不进入 Runtime 设置 namespace。
- `activity.usage` 只保存 Usage 页面筛选和展示偏好，例如时间范围、状态、模型筛选、明细开关和当前 Tab；Token、成本、请求状态和运行轨迹 仍以 Session Journal 为事实来源。
- 当前 `runtime-v2/usage-read-model.sqlite` 是可删除、可重建的查询缓存。查询时检查来源水位并按游标追赶；实时事件不强制更新 SQLite，它不参与 Agent 执行或恢复。
- Renderer 通过 typed IPC 提交 namespace partial patch；Main 校验、合并并原子写入。第一阶段只需要 root revision 和现有 mutation queue，namespace revision、外部编辑热加载和插件自定义 schema 暂缓到确有多写入方需求时再引入。
- 设置属于 `<dataRoot>` 全局作用域，不跟随 workspace root；未来若需要项目级设置，另行定义显式 scope 和迁移规则。

## 日志

- `pnpm dev:log` 写 `logs/dev-*.log` 并更新 `logs/latest-dev.log`；
- 安装态 main 日志写 `<userData>/logs/main-startup.log`；
- 本地更新 helper 写 `<userData>/tmp/local-update/status.json` 与 `update.log`；
- 日志、Session、Projection 和诊断都不得包含 provider key、Authorization、Cookie、长 Base64 或未经脱敏的外部错误正文。

日志是排障证据，不是 Session 恢复事实。清理日志不得改变 Session；清理 Journal、artifact 或凭据属于不同的数据操作，必须分别授权。

## 代码事实入口

- `packages/session/persistence/src/session.ts`：Session 业务 handle、flush 与 close；
- `packages/session/persistence/src/recovery.ts`：语义中断恢复；`packages/session/jsonl/src/repair.ts`：物理 torn-tail repair；
- `packages/session/jsonl/src/writer-lease.ts`：单 writer lease；
- `packages/runtime/src/session/session-controller.ts`：Host-facing Session 操作；
- `packages/runtime/src/projection/durable-session.ts`：durable snapshot；
- `apps/desktop/src/main/app-paths.ts`：Desktop data / log / tmp root；
- `packages/runtime/src/projection/durable-session.ts`：Host durable facts、Surface、工具和 request context 派生；`packages/client/src/sessions/`：Client Chat、Trajectory、Tool Card 与 usage selectors；
- `apps/desktop/src/main/runtime-v2/artifact-store.ts`：Desktop artifact integrity 与 owner 校验。

## 可重建的会话浏览缓存

当前 projection-cache 从 storage 读取完整快照，按后端 identity、会话 revision、codec 和投影版本失效；最多保留 3 项及 16 MiB 序列化估算。当前不读取旧 `projection-checkpoint.json`，也没有新增持久化检查点文件。与此不同，JSONL Provider 的 `JsonlEventHistory` 现在持有可重建的内存字节位置索引，用于 Journal 已释放正文的范围回读；它不是旧的磁盘 byte-offset cache。

已打开会话的聊天窗口通过 Journal 读指定范围；未打开会话的冷缓存仍 inspect 全量快照后截取窗口。SQLite 索引另走 Worker 的有界读取。`flush` 不再触发冷缓存重建。旧缓存文件不参与读取或恢复，本轮不删除用户目录中的旧文件。
