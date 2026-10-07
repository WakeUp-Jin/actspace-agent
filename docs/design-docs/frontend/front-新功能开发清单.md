# 前端新功能开发清单

> 状态：现行规范（2026-10-07，Desktop 前端重构 10–17、09 合入 main 后整理）。
> 用途：新增或改动 Desktop renderer 功能前先读这一页。每条规则都只写一句，细节以链接的规范为准；规范更新时同步改这里的那一行。
> 「检查」列写的是哪个命令会拦住违反这条规则的代码；写「评审」的没有自动检查，只能靠写代码时自觉和评审时核对。

路径缩写：`R/` = `apps/desktop/src/renderer/`，`M/` = `apps/desktop/src/main/`。

## 1. 视觉与样式

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 字号、圆角、阴影、层级、动效时长只用 token（`text-act-*`、`rounded-act-*`、`shadow-act-*`、`z-(--act-z-*)`、`duration-(--motion-*)`），不写死数值 | [全局视觉语言规范](front-全局视觉语言规范.md) | `pnpm check:frontend-tokens` |
| 颜色只用随主题翻转的语义类或变量，不写 `text-black`、`bg-white`、`#hex`、`rgba()`；浅色、深色都要看一遍 | [主题与配色规范](front-主题与配色规范.md)「硬约束：禁止非主题感知字面量」 | `pnpm check:frontend-theme` |
| 普通 UI 样式写在组件的 Tailwind utility 里，不往全局 CSS 加；新增全局样式先确认归属和 cascade layer | [Tailwind 样式架构](front-tailwind-style-architecture.md)「样式所有权」 | 评审 |
| 界面文案用中文；模式名、思考档位、工具名等按约定保留英文 | [日常桌面界面中文文案](front-desktop-chinese-ui.md) | 评审 |

## 2. 组件与弹层

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 看起来是按钮的，用 `R/components/ui/Button` / `IconButton`；保留原生 `<button>` 的要写 `type="button"`，并有可见的 focus 样式 | [基础组件封装规范](front-基础组件封装规范.md)「按钮收口与检查」 | `pnpm check:frontend-tokens`（原生按钮数只许减） |
| 对话框、确认框、菜单、右键菜单、下拉、浮层、悬停卡片只用 `R/components/ui/` 的原语；业务组件不写 `createPortal`、`role="dialog"`，也不为了关弹层自己监听 Escape 或 document 点击 | [基础组件封装规范](front-基础组件封装规范.md)「弹层原语」（含「怎么选」） | `pnpm check:frontend-tokens`（`createPortal`、`role="dialog"`） |
| 只有图标的按钮必须有可读名称和 Tooltip | [图标按钮 Tooltip 规范](front-icon-button-tooltip-guidelines.md) | 评审 |

## 3. 文件放在哪、什么时候拆

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 按区域放在 `R/components/<区域>/` 下（`settings/sections/`、`sidebar/`、`conversation/`、`workbench/`、`composer/` 等），不新建 `features/` | [基础组件封装规范](front-基础组件封装规范.md)「大组件拆分的目录约定」 | 评审 |
| 区域入口文件只做布局和装配，目标 400 行以内；**任何单个文件超过 500 行就要拆**，纯函数拆成 `.ts` 并写单测，有状态的逻辑拆成 `use-*.ts` | 同上；现在超过 500 行的文件见[技术债](../../exec-plans/tech-debt-tracker.md)「renderer / 文件行数」 | 评审（不做自动检查） |
| 拆出的模块不反向 import 区域入口 | 同上 | 评审 |

## 4. 状态放在哪

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 会话数据分三类，各只有一个归属：已持久化的走 `ClientSessionStore` 的 cell，正在运行的走 `LiveRunStore` / `TaskQueueStore`，只在本机的按会话状态（草稿、队列展示等）走 `SessionLocalStore`。组件从 store 或 Context 读，不另存副本 | [会话状态与数据流规范](front-会话状态与数据流规范.md) 开头和 §2–§5 | 评审 |
| 不引入状态库；新 store 是带 `subscribe` 的小对象，React 侧用 `useSyncExternalStore` | 同上 §1 | 评审 |
| 当前会话、会话动作、输入框、运行目标从 Context 读（`useActiveSession`、`useSessionActions`、`useComposerContext`、`RunTargetContext`），不逐层传 prop；App 里不要用带工厂函数的 `useMemo` 拼 Context value | 同上 §8 | 评审 |
| 本机 / 远端的差异只通过 `RunTarget` 和 `capabilitiesOf` 的能力表判断，组件不判断 `hostId` 或 `host:` 前缀；远端支持某项能力时只改这张表 | [工作区、Git 与运行目标](front-workspace-git-worktree-context.md)「运行目标（本机与远端）」 | 评审 |
| 读写失败要让用户看到；确实只需打控制台的，在代码注释里写明理由 | [会话状态与数据流规范](front-会话状态与数据流规范.md) §11 | 评审 |

## 5. 怎么调用 main

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 组件、hook、store 只 import `R/api/<域>`，不碰 `window.actspace`，也不直接用 `getBridge()` | [Preload bridge 与 Mock 规范](front-preload-bridge与mock规范.md) §3 | `pnpm check:renderer-bridge` |
| 新增 IPC 能力按 7 步走：channel 常量 → 契约成员 → main 注册 → guard → mock → 调用方 → 检查；preload 里不写业务逻辑 | 同上 §4 | `pnpm check:ipc-channels` |
| 入参涉及路径、文件、终端、设置写入或远端 Host 的，加 guard，并补一个合法、一个非法输入的用例 | 同上 §5 | 评审 + `M/test/ipc-guards.test.ts` |
| 不写 bridge 存在检查和「当前环境不支持」的降级分支 | 同上 §3 | 评审 |

## 6. 安全边界

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| renderer 传来的工作区路径一律经 `M/workspace-access.ts` 解析，不直接 `resolve` | [SECURITY](../../SECURITY.md)「工作区访问入口」 | 评审 |
| 打开外部链接一律经 `M/platform-actions.ts` 的 `openExternalSafely`（只放行 `https:`、`http:`、`mailto:`）；不新开窗口，不让主窗口导航到外部页面 | [SECURITY](../../SECURITY.md)「外部打开白名单」「导航防护」 | 评审 |
| 新注册的 IPC 走 `createIpcRegistrar`，自动做 sender 校验 | [SECURITY](../../SECURITY.md)「IPC sender 校验 fail-closed」 | `pnpm check:ipc-channels` |
| 明文 Key 不进 renderer：renderer 只拿 `hasApiKey`、连接状态和脱敏错误 | [SECURITY](../../SECURITY.md)「主进程边界」 | 评审 |

## 7. 测试与 mock

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 用例里用 `setupBridge` / `overrideBridge` 换 bridge，不给 `window.actspace` 赋值 | [Preload bridge 与 Mock 规范](front-preload-bridge与mock规范.md) §8 | 评审 |
| 新增 IPC 时在 `R/mock/handlers.ts` 补默认实现，或明确不补；新增 mock 场景要同步更新验证文档的场景表 | 同上 §4、§7 | 评审 |
| 拆出的纯函数和 `use-*` hook 要有单测 | [基础组件封装规范](front-基础组件封装规范.md)「大组件拆分的目录约定」 | 评审 |

## 8. 验收

| 规则 | 详见 |
| --- | --- |
| 按改动选验收路径：工程验证 → 浏览器 mock（`?mock=<场景>`）→ Electron；最终说明里写清实际跑过哪些 | [前端验证约定](../../FRONTEND_VERIFICATION.md)「验证分层」「默认验收矩阵」 |
| 有界面变化的，看浅色、深色和 480px 窄窗 | 同上 |
| 键盘走一遍：弹层的 Esc 只关最上层，关闭后焦点回到触发器 | [基础组件封装规范](front-基础组件封装规范.md)「统一行为」 |

## 9. 提交前要跑的命令

在仓库根运行：

```bash
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:renderer-bridge
pnpm check:ipc-channels   # 改了 IPC、契约或 preload 时
pnpm check:current-docs   # 改了 docs/ 时
```

`pnpm test` 已包含 `check:renderer-bridge`、`check:ipc-channels` 和几个检查脚本自己的测试；`check:frontend-tokens`、`check:frontend-theme` 由 CI 的仓库卫生检查运行。
