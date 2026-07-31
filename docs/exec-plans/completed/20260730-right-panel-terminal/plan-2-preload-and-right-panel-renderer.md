# Plan 2：preload 与右侧 Terminal renderer

## 目标

把 Plan 1 的 Terminal Session Runtime 以窄 preload API 接入 renderer，在右侧对象面板实现主题感知、可 resize、可 attach / detach、支持多 Terminal 的 xterm 交互视图。

## 准入条件

- Plan 1 所有 shared / main 测试和 Desktop build 通过。
- Terminal IPC 和错误语义已稳定，本计划不重新发明第二套契约。
- 开始前读取 `docs/design-docs/frontend/front-主题与配色规范.md`、`front-工作台布局与面板交互规范.md`、`front-右侧面板与文件渲染规范.md` 和终端设计文档。

## 修改范围

- `packages/desktop/package.json`、`pnpm-lock.yaml`：精确锁定经验证的 `@xterm/xterm`、`@xterm/addon-fit`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `packages/desktop/src/renderer/components/right-panel/TerminalRenderView.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- Terminal 专用 renderer tests 和必要的样式文件

## 实施任务

### Task 2.1：preload 窄 API

暴露：

- `createTerminal`
- `attachTerminal`
- `listTerminals`
- `writeTerminal`
- `resizeTerminal`
- `ackTerminalData`
- `closeTerminal`
- `onTerminalEvent`

每个订阅必须返回 cleanup，组件 unmount 时移除精确 listener。preload 不接收 executable / cwd / env。

验证：

- preload typecheck。
- listener add / remove 和事件转发单测。
- `window.actspace` 类型与 shared 契约一致。

### Task 2.2：Terminal Tab 数据模型

在 `RightPanelTab` 增加：

```ts
{ kind: "terminal"; id: string; title: string; terminalId: string; sessionId: string }
```

规则：

- RightPanel state 只保存 terminalId / sessionId / title，不保存 xterm 对象、PTY 句柄或输出缓冲。
- 新建终端先订阅事件，再调用 create，成功后创建 Tab。
- 关闭非 Terminal Tab 保持现有同步行为；关闭 Terminal Tab 需要先完成 main close 请求。
- 为避免把通用 `closeTab` 强行改为全局 async，由 Terminal 视图或上层关闭协调器完成 resource close，成功后再调用现有 `closeTab`。

验证：

- 新建、切换、关闭、重复点击和多 Terminal 标题。
- 关闭 Terminal 失败时 Tab 保留并显示可恢复错误，不产生失联 PTY。

### Task 2.3：TerminalRenderView

- 创建 xterm Terminal，加载 FitAddon 和 WebLinksAddon。
- 默认不加载 OSC 52 ClipboardAddon。
- `ResizeObserver -> fit -> resizeTerminal`，只在 cols / rows 真正变化时发 IPC。
- `onData -> writeTerminal`；大段粘贴按 IPC input 上限分批。
- `TerminalEvent.data -> xterm.write(data, callback) -> ackTerminalData`。
- `init_log` 先于实时 data 写入，并对 truncated 给出不干扰 shell 的辅助提示。
- theme 改变只更新 xterm options，不 recreate Terminal Session。
- exit 后禁止输入，显示 exit code、Restart 和 Close。
- React unmount 只 detach / cleanup listener 和 xterm instance，不自动 close backend。

验证：

- mocked bridge 单测覆盖 attach、init log、data ACK、resize 去重、exit、restart、unmount cleanup。
- 浏览器 renderer 没有 preload 时显示明确不可用状态，不伪造真实 shell 数据。

### Task 2.4：右侧入口与布局

- 对象启动页调整为 `Files / Terminal / Review / Context / Kairos / Reply` 六个入口的 `2 × 3`。
- `+` 菜单增加 Terminal，与启动页共用同一 create action。
- Terminal 内容区不消费文档预览 padding，占满 Tab 剩余区域。
- 多 Terminal 时在终端视图内提供轻量创建入口，不新增底部 panel region。
- 所有颜色使用语义 token，并继续避让 WindowChromeBar 和右上角 `+ / PanelRight` 控件。

验证：

- 启动页与菜单入口语义一致。
- 六个入口均键盘可达，focus-visible 清晰。
- 480 / 820 / 1120 / 1440px 的右侧宽度、覆盖层和中间 Composer 保护。
- 浅色、深色、system-light、system-dark 的终端背景、选择、cursor 和 ANSI 基础色可读。

## 验收命令与分层

- `pnpm --filter @actspace/shared build`
- Desktop 目标 renderer / preload 测试。
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm check:frontend-theme`
- `pnpm build`
- `pnpm check:docs`
- `pnpm check:repo`
- 浏览器 renderer 只验收启动页、布局、主题和无 preload 空态。
- 真实 shell、IPC、attach、Ctrl+C 和进程清理必须在 Electron 验收，不用浏览器 mock 代替。

## 进度记录

- [x] Plan 1 通过。
- [x] preload 和 global type 契约。
- [x] Terminal Tab 模型与 resource close 协调。
- [x] TerminalRenderView 与单测。
- [x] 右侧启动页、菜单与响应式布局。
- [x] 工程、主题和 renderer 验收。
- [x] Electron 基础验收。

实施偏差与收敛：Terminal 使用 xterm + FitAddon；WebLinksAddon 不进入 V1 依赖，因为当前仓库没有窄化的外部 URL 打开桥，不能为满足计划字面要求而让 renderer 直接导航。多终端继续通过现有右上角 `+` 创建，不在终端内容区重复放第二个创建入口。renderer remount 和会话切换通过 `listTerminals` 重新同步当前会话的内存终端 Tab。
