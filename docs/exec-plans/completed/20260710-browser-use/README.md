# Browser Use 执行计划总览

状态：Plan 0-pre 至 Plan 5、M0-M6 全部完成，已进入 completed 归档

设计来源：
- `docs/design-docs/agent-browser-use-integration-design.md`
- `docs/design-docs/agent-browser-use-command-surface.md`
- `docs/design-docs/agent-browser-bridge-design.md`

## 目标

让 actspace-agent 通过 Unix socket 长连接与 Go bridge 通信，实现对用户真实 Chrome 浏览器的自动化操作。首阶段覆盖基础导航/截图/DOM 读取，后续逐步扩展到完整三层操作和 Tab Group 管理。

## 前置决策：仓库合并

`actspace-plugins` 仓库（含 browser-bridge 和 fs-watch）整体合并进 actspace-agent 主仓库。

目标路径：
```
actspace-agent/
  plugins/
    browser-bridge/           ← 从 actspace-plugins/plugins/browser-bridge/ 迁入
      apps/cli/               ← Go CLI (abb)
      apps/chrome-extension/  ← Chrome Extension
      packages/protocol/      ← Go 协议层
      go.work
      build.sh
    fs-watch/                 ← 从 actspace-plugins/plugins/fs-watch/ 迁入
      src/
      Cargo.toml
```

合并理由：
- browser-bridge 与 agent-core 有紧密协议耦合，socket 长连接让两者成为一个整体
- 原子提交：改协议 + 改 TS 消费侧可以在同一 commit
- Agent 在同一 workspace 看到全部代码
- 简化 CI 验证链路

pnpm workspace 不管 `plugins/` 目录（非 TS 包）。Go/Rust 工具链通过独立 CI step 处理。

## 子计划拆分

本实现拆成 6 个可独立执行的子 plan，具有明确的依赖顺序：

```
Plan 0-pre: 仓库合并（把 actspace-plugins 代码搬入 plugins/）
    ↓
Plan 0: 协议与契约地基（扩展 protocol.go）
    ↓
Plan 1: Go bridge socket server 模式
    ↓
Plan 2: agent-core BridgeClient + 基础工具注册
    ↓
Plan 3: 交互命令 + Playwright 注入
    ↓
Plan 4: Tab Group + 光标可视化 + Chrome Extension 升级
```

Plan 0-pre 是单次机械操作（cp + 调整 import + 验证编译）。
Plan 0 和 Plan 1 可由熟悉 Go 的会话执行。
Plan 2 由熟悉 agent-core TS 的会话执行，依赖 Plan 1 产物。
Plan 3 和 Plan 4 分别扩展两侧。

## 后续收敛计划

- `plan-5-go-command-engine-convergence.md`：将首版 15 个 Agent 工具与 Extension 内高层逻辑收敛为“Go canonical command engine + injected Locator runtime + Extension primitive backend + 9 个分类工具 + `browser_help` + `browser_run`”，并分阶段补齐完整 62 条命令。

Plan 5 的 7 个设计闸门已于 2026-07-10 全部确认；M0-M6 已完成，62/62 registry commands 均为 Go handler。真实 Chrome fixture、I/O、claim/handoff、deliverable、Agent approval/denial、公共 CLI compatibility 和 A/B session isolation 均已通过。

## 非目标

- 不实现 MCP server/client 层。
- 不修改现有 CLI 子命令的行为（向后兼容）。
- 不触碰 Electron renderer 侧（桌面前端集成待后续计划）。
- 不实现远程 site policy API 调用。
- 不实现 CUA 坐标全套（drag/move 留 Phase 5）。

## 必读文档

开始任何子 plan 前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/agent-browser-use-integration-design.md`
- `docs/design-docs/agent-browser-use-command-surface.md`
- `docs/design-docs/agent-browser-bridge-design.md`
- `docs/design-docs/agent-testing.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-权限设计规则和原则.md`
- `docs/HISTORY_GUIDE.md`

## 共享契约

### 协议层（plugins/browser-bridge/packages/protocol/protocol.go）

所有新增 method 命名空间：`agent_browser_bridge.*`

新增 method 清单见 Plan 0。

### Socket 路径

macOS 默认复用 Chrome Native Host 的稳定路径：

`~/Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock`

Agent 不额外启动 `abb serve`。`ABB_SOCKET` / `ABB_SUPPORT_DIR` 仅用于开发与测试覆盖。

### 帧格式

沿用现有 protocol.go：4 bytes uint32 长度头 + JSON payload。

## 决策记录

- 2026-07-10：确认采用薄集成 + 长连接方案，否决 MCP、纯 CLI、TS 完全集成和进程内插件四个备选。
- 2026-07-10：确认首阶段 15 个高层工具，不一次实现全部 62 条命令。
- 2026-07-10：确认协议命名空间沿用 `agent_browser_bridge.*`，不新增独立命名空间。
- 2026-07-10：确认将 actspace-plugins 整体合并进主仓库 `plugins/` 目录，不再维护独立仓库。
- 2026-07-10：补齐 `browser_*` ToolManager 注册、稳定 Native Host socket、turn 生命周期清理和标准工具优先提示；CLI 降级为诊断/安装入口。
- 2026-07-10：新增 Plan 5，推荐由 Go 承担 CUA、DOM CUA、Locator 与等待/事件编排，Extension 收敛为 Chrome/CDP primitive backend；Agent 工具面收敛为 9 个分类工具加 `browser_help`、`browser_run`，等待用户确认后执行。
