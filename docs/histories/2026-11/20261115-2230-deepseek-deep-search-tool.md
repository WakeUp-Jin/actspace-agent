## [2026-11-15 22:30] | Task: DeepSeek 深度搜索 PA：`deep_search` 工具上线

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 按计划继续执行 DeepSeek 更新计划（PA 深度搜索），Key 已给；验证、浏览器验收交给 Sonnet 子智能体。

### 🛠 Changes Overview

**Scope:** `@actspace/tool-deep-search`、`@actspace/agent`、`@actspace/agent-host`、`@actspace/shared`、`@actspace/client`、`@actspace/desktop`、`@actspace/web`、`docs/`

**Key Actions:**

- **实测（PA.1）**：带「只写要点」系统提示词跑了 5 个问题，确认字段结构、引用下标、计费字段；录了 3 份回放夹具（去掉了 Key）。
- **请求与解析（PA.2、PA.3）**：`sse.ts` 读事件流，`stream-state.ts` 累积进度和结果，`assemble.ts` 插 `[n]` 标记、拼要点 + Sources，`node-ports.ts` 发请求、空闲 40 秒 / 总 120 秒超时、HTTP 状态映射失败码。
- **Host 接线（PA.4）**：桌面端每次调用读开关和 Key；CLI / 远程 Host 要 `ACTSPACE_DEEPSEEK_DEEP_SEARCH=1`。
- **设置（PA.5）**：「搜索与网页读取」页「使用 DeepSeek 深度搜索」，默认关。
- **界面（PA.6、PA.7）**：`deep_search` 预览投影、失败文字；桌面端 `DeepSearchBlock`（运行中一行进度，完成后展开搜索词 / 引用来源 / 未能打开）；Web / PWA 单行；mock 场景 `deepseek-tools`。
- **Chat 模式（PA.8）**：`deep_search` 声明 Chat、Plan、Agent；Chat 可用时多这一个工具。
- **文档（PA.9）**：设计文档对应章节改写成当前事实；web 工具、预览规范、中间消息区、设置页、SECURITY 同步。

### 🧠 Design Intent (Why)

- 深度搜索在 DeepSeek 服务端多轮搜索，和普通函数工具放进同一次请求时模型不去搜，所以单独一次请求、包装成工具。内部请求只要要点，因为主模型还会重写一遍。
- 默认关、不可用时对模型隐藏：它按次计费，问题会发给 DeepSeek。
- 独立工具而不是 `web` 的第三种动作：`web` 的 schema 固定，三个模式共用一个工具、一种行、一套测试。

### Unverified & Leftovers（未验证与遗留）

- 真实应用验收（PA 计划第 9 步 1–7）结果见同目录后续记录或 PR 描述；Electron 里的深色、窄窗口观感以那次为准。
- `: keep-alive` 注释和打不开网页的路径，真实调用里没遇到，只用合成数据测过。
- PB（文档解析）未开始。

### 📁 Files Modified

- `packages/web/tool-deep-search/src/`
- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`、`packages/host/agent-host/src/node-ports/tool-host-services.ts`
- `apps/desktop/src/renderer/components/settings/SearchSettings.tsx`
- `packages/util/shared/src/session/`、`packages/client/client/src/sessions/`、`packages/client/client/src/live/stream-blocks.ts`
- `apps/desktop/src/renderer/components/messages/DeepSearchBlock.tsx`、`styles/deep-search.css`、`mock/scenarios/deepseek-tools.ts`
- `apps/web/src/sessions/transcript-model.ts`、`apps/web/src/pages/session/blocks/ExploreGroup.tsx`
- `packages/core/agent/src/main-preset.ts`
- `docs/design-docs/`、`docs/SECURITY.md`、`docs/FRONTEND_VERIFICATION.md`
