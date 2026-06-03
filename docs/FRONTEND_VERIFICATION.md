# 前端验证约定

这份文档定义 `actspace` 前端改动完成后的验收方式。

`actspace` 是桌面端应用，不能把浏览器里的 `http://127.0.0.1:5173/` 等同于完整产品。浏览器只能直接加载 renderer，完整桌面端还包含 Electron main、preload、IPC、本地文件和持久化能力。

## 默认原则

- 前端改动必须在计划和收尾中写清验证方式。
- 工程验证优先使用仓库命令，不要只依赖人工目测。
- UI 样式与组件打磨优先使用浏览器 renderer 验证，因为它更适合快速检查 CSS、布局、HMR、空态和不依赖 IPC 的局部交互。
- 真实桌面链路必须使用 Electron 窗口验证，但它是完成流程的最终验收，不是每次样式微调的首选工具。
- 有 Computer Use 的 Agent，完成重要 UI 修改后应在收尾阶段查看真实 Electron 窗口。
- 没有 Computer Use 的 Agent，需要说明限制，并让用户提供截图或启动日志辅助确认。

## 验证分层

### 1. 工程验证

适用范围：

- 所有实质性前端代码修改。
- 组件结构、样式、状态管理、IPC 类型、构建脚本相关改动。

默认命令：

```sh
pnpm typecheck
pnpm build
```

如果只改了局部包，可以使用更小的命令，但最终说明要写清原因。

这层验证用于确认：

- TypeScript 类型没有破坏。
- workspace 包边界没有漂移。
- Vite renderer 可以构建。
- Electron main/preload 可以构建。

### 2. 浏览器 Renderer 验证

适用范围：

- 纯 UI 样式。
- 组件布局。
- 普通前端交互。
- 响应式检查。
- 不依赖真实本地文件系统和 IPC 的页面状态。
- 设计图还原、视觉密度、间距、颜色、组件状态打磨。

推荐目标：

```text
http://127.0.0.1:5173/
```

浏览器验证只加载 renderer，不代表完整桌面产品。没有 Electron preload 时，页面不应该白屏；它应该显示真实空态、明确的开发提示，或只在测试/显式 demo harness 中使用 mock bridge。

浏览器 renderer 验证不能用运行时假业务数据证明产品状态。稳定样例数据应放在测试、Story 或显式 demo 边界内。

可以验证：

- 左侧会话栏。
- 中间消息区。
- Composer。
- Context popup。
- Diff 卡片。
- 右侧文件预览的视觉状态。

不能证明：

- preload 是否注入成功。
- IPC 是否可用。
- 本地会话是否真实落盘。
- 文件读取、附件、持久化、恢复是否正常。

### 3. Electron 真实验证

适用范围：

- 一轮前端改动完成后的最终桌面验收。
- 桌面端窗口行为。
- preload 注入。
- IPC。
- 本地持久化。
- session 恢复。
- 文件系统能力。
- 任何涉及 `window.actspace` 的真实能力。

默认启动：

```sh
pnpm dev
```

需要确认：

- Electron 窗口可以弹出。
- renderer 正常加载，不是空白页。
- `window.actspace` 注入后，页面可以加载 bootstrap state。
- 首次启动可以创建或恢复会话。
- 本地数据目录正常初始化。

有 Computer Use 的 Agent 应该直接观察 Electron 窗口，必要时点击核心交互并截图确认。

没有 Computer Use 的 Agent 应说明无法直接观察桌面窗口，并请用户提供：

- Electron 窗口截图。
- `pnpm dev` 终端日志。
- 必要时提供本地数据目录里的 `meta.json` 或 `session.jsonl` 摘要。

## 默认验收矩阵

| 改动类型 | 必须验证 | 推荐补充 |
| --- | --- | --- |
| 样式、布局、组件展示 | `pnpm typecheck`、浏览器 renderer 截图 | 完成阶段再看 Electron 窗口 |
| Composer、弹窗、菜单等交互 | `pnpm typecheck`、浏览器 renderer 交互 | Electron 窗口交互 |
| IPC、preload、session、本地文件 | `pnpm typecheck`、`pnpm build`、Electron 真实验证 | Computer Use 操作或用户截图 |
| 构建脚本、workspace、Electron 配置 | `pnpm typecheck`、`pnpm build`、`pnpm dev` | 检查 `dist-electron/main/index.js` 是否生成 |
| 设计文档或图片更新 | 文档链接检查 | 对照设计图人工确认 |

## 计划与收尾写法

计划阶段应该写明：

- 这次改动属于哪一类。
- 使用浏览器 renderer 还是 Electron 真实验证。
- 是否需要用户截图或 Computer Use。

收尾阶段应该写明：

- 实际运行过的命令。
- 是否看过浏览器或 Electron 窗口。
- 没能验证的部分和原因。

示例：

```text
已运行 pnpm typecheck 和 pnpm build。
本次只改 Composer 样式，使用浏览器 renderer 验证布局；未涉及 preload、IPC 和本地持久化。
```

另一个示例：

```text
已运行 pnpm typecheck、pnpm build 和 pnpm dev。
本次涉及 preload 与 session 恢复，需要 Electron 窗口验证；当前环境没有 Computer Use，因此需要用户提供窗口截图和终端日志。
```
