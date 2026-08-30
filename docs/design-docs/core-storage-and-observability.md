# 存储与可观测性边界

> 状态：当前 v2 实现事实。旧 `sessions/`、可变 conversation 文件、独立 Context state 文件和 Trace sidecar 属于 v1，不是当前持久化契约。

Runtime 公共契约见 [`agent-plugin-runtime/`](agent-plugin-runtime/README.md)，Session schema 见 [`agent-spec-session-format-v1.md`](agent-plugin-runtime/agent-spec-session-format-v1.md)。

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

## Session Journal

每个持久 Session 的当前布局是：

```text
<dataRoot>/sessions-v2/<sessionId>/
├── journal.jsonl
├── artifacts/
├── recovery/
├── .writer-lock/          # 仅持有 writer lease 时存在
└── visualizations.json    # Desktop 可选派生缓存，不是 Session 事实源
```

其中：

- `journal.jsonl` 是唯一恢复事实源，包含 Header 与 append-only Event Envelope；
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

Journal 保存不可变领域事件；Session Surface 是这些事件经过 append / replace 语义折叠后的有效模型历史；Runtime Projection 再把 Surface 与事件投影为 Host-facing DTO。

```text
journal.jsonl
    ↓ codec + invariant validation
Session Journal / Surface
    ↓ durable projection
RuntimeV2SessionSnapshot
    ↓ fixed renderer adapter
SessionRecord / Context / Usage / Analysis
```

必须保持以下边界：

- Journal 不能保存 renderer 专用组件状态；
- Context assembly 不拥有另一份可变 conversation；
- renderer 不直接读取 Journal 文件，只通过 typed IPC 请求 Runtime snapshot 或事件投影；
- diagnostics 和 live progress 不是持久恢复事实，不能反向覆盖 Journal；
- Compaction 通过 `surface/replaced` 事务替换有效 Surface 区域，不改写已有历史行。

## Context、Usage 与 Analysis

当前 Context 面板没有独立持久化文件。Desktop 从最近一次 `request/snapshot` Journal event 生成 Context entries、bucket 和 token 估算：

- `systemSections` -> System Prompt、Rules、Skills；
- `tools` -> Tool Definitions；
- `facts` -> Runtime / Host facts；
- `messages` -> Conversation；
- 最近 Compaction summary -> Summarized Conversation。

Usage 和成本来自 `llm/usage` event。Durable Session projection 聚合 input、output、cache read、cache write 和 USD cost；Desktop Usage 页面再按 Agent Run、模型和日期派生视图。

Analysis / Trace 页面同样从 Journal 中的 Turn、request snapshot、LLM、Tool 和 retry event 即时派生。当前没有独立 Trace JSONL、summary sidecar 或 retention worker；删除 Journal 就无法重建这些分析视图。

## Artifact

Artifact 的语义所有权属于 Session / Tool call，但当前 Desktop 与 persistent CLI 的 concrete store 使用：

```text
<dataRoot>/artifacts-v2/<artifactId>
<dataRoot>/artifacts-v2/<artifactId>.json
```

元数据记录 `sessionId`、`callId`、`pluginId`、`toolId`、MIME、大小与 SHA-256。读取时必须：

1. 校验 artifact ID；
2. 验证实际路径没有逃出 store root；
3. 校验 owner session；
4. 重新计算大小和 SHA-256；
5. 只通过 Host API 返回 bytes 或安全预览。

CLI ephemeral run 使用系统临时目录中的一次性 artifact store，并在退出时删除。Journal 只保存 artifact reference，不保存 Base64、Authorization header、远程签名 URL 或不受控绝对路径。

## Fork 与恢复

Fork 不是复制一个 v1 会话目录。当前 Profile 的 App Bundle Service `forkMainSession()` 通过 Session Store 在指定 `boundarySeq` 创建新 Header 与事件种子，并记录 lineage；新 Session 获得独立 writer lease 和后续事件序列。

恢复分两类：

- **运行中断恢复**：为未完成 request、tool、step 和 turn 追加 `aborted`、`outcome-unknown` 与 recovery transaction；
- **torn-tail repair**：仅对“前缀合法、最后一行撕裂”的 Journal 执行。修复前把原文件按 digest 复制到 `recovery/`，再原子替换新 Journal。

中间坏行、未知 required codec、身份冲突或不满足 invariant 的 Session 不得静默修复为可写状态。

## 设置与凭据

- `settings.json`：main-owned 非敏感设置，包括 provider 开关、Base URL、代理、模型选择、Prompt、工具开关和快捷键；
- `secrets.json` v2：main-only 明文凭据，文件权限收紧为 `0600`；
- renderer 只接收 `hasApiKey`、连接状态、模型目录和脱敏错误；
- Desktop provider key 不从仓库 `.env` 读取；CLI 才读取启动进程显式提供的环境变量。

旧 `secrets.json` v1 只允许在 main 内完成全量解密校验后原子迁移。迁移失败时必须保留原文件并禁止用空状态覆盖。

## 日志

- `pnpm dev:log` 写 `logs/dev-*.log` 并更新 `logs/latest-dev.log`；
- 安装态 main 日志写 `<userData>/logs/main-startup.log`；
- 本地更新 helper 写 `<userData>/tmp/local-update/status.json` 与 `update.log`；
- 日志、Session、Projection 和诊断都不得包含 provider key、Authorization、Cookie、长 Base64 或未经脱敏的外部错误正文。

日志是排障证据，不是 Session 恢复事实。清理日志不得改变 Session；清理 Journal、artifact 或凭据属于不同的数据操作，必须分别授权。

## 代码事实入口

- `packages/session/persistence/src/session.ts`：Session layout、flush 与 close；
- `packages/session/persistence/src/recovery.ts`：中断恢复与 torn-tail repair；
- `packages/session/persistence/src/writer-lease.ts`：单 writer lease；
- `packages/runtime/src/runtime/session-controller.ts`：Host-facing Session 操作；
- `packages/runtime/src/projection/durable-session.ts`：durable snapshot；
- `apps/desktop/src/main/app-paths.ts`：Desktop data / log / tmp root；
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`：Context、Usage 与 Analysis 派生；
- `apps/desktop/src/main/runtime-v2/artifact-store.ts`：Desktop artifact integrity 与 owner 校验。
