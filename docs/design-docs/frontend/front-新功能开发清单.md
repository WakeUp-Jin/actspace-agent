# 前端新功能开发清单

新增或改动 Desktop renderer 功能前先读这一页。每条规则只写一句，细节以链接的规范为准；「检查」列写哪个命令会拦住违反这条规则的代码，写「评审」的没有自动检查。读完这页，再读 [视觉 token](front-视觉token规范.md)、[文案与状态表达](front-文案与状态表达规范.md)、[组件与交互模式](front-组件与交互模式规范.md) 三份，最后按 [README](README.md) 的路由表读对应区域规范。

路径缩写：`R/` = `apps/desktop/src/renderer/`，`M/` = `apps/desktop/src/main/`。

## 1. UI 自检（交付前逐条对，任何一条答不上来就先改）

1. 去掉所有彩色，页面层级还看得懂吗？绿色只出现在运行 / 成功 / 开启上吗？——[视觉 token §1](front-视觉token规范.md#1-颜色职责)
2. 浅色、深色、480px 窄窗都看过吗？——[视觉 token §3](front-视觉token规范.md#3-主题机制与硬约束)
3. 字号全是 `text-act-*`，除轨迹视图和 Harness 统计外没有小于 11px 的字吗？——[视觉 token §5](front-视觉token规范.md#5-字体与字号)
4. 每一行灰色说明小字，删掉后用户会选错、误花钱或误以为安全吗？不会就删。——[文案规范 §2](front-文案与状态表达规范.md#2-说明文字默认不写)
5. 同一信息在这个区域只出现一次吗？有文字的地方没再加图标，组内一致的标记放在了组标题吗？——[文案规范 §3](front-文案与状态表达规范.md#3-同一信息只出现一次)
6. 状态是「文字或图标其一加颜色」，不是只靠颜色、也没叠加吗？——[文案规范 §4](front-文案与状态表达规范.md#4-状态表达)
7. 空 / 零 / 未知 / 加载 / 失败都按固定写法吗？有没有伪造数据、占位入口？——[文案规范 §5–6](front-文案与状态表达规范.md#5-空值零值未知错误加载)
8. 按钮、弹层、Tooltip 都用 `ui/` 原语，variant 与尺寸选对，纯图标按钮有 `label` 吗？——[组件规范 §2–4](front-组件与交互模式规范.md#2-button-与-iconbutton)
9. 能撤销的操作给了撤销条，只有不可恢复或提升权限的才弹确认框吗？——[组件规范 §5](front-组件与交互模式规范.md#5-确认与撤销)
10. 行与表格：从属行没缩进、表头与首列对齐、标签 `shrink-0 whitespace-nowrap`、值 `min-w-0 truncate`、完整值在 `title` 吗？——[组件规范 §6–7](front-组件与交互模式规范.md#6-设置页的行分组与对齐)
11. 新界面或改版前，找过 1–2 个同类产品截图并把取舍写进区域规范了吗？——[组件规范 §9](front-组件与交互模式规范.md#9-对标与-demo)

## 2. 样式与 token

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 字号、圆角、阴影、层级、动效时长只用 token（`text-act-*`、`rounded-act-*`、`shadow-act-*`、`z-(--act-z-*)`、`duration-(--motion-*)`），不写死数值 | [视觉 token](front-视觉token规范.md) §5、§7–§10 | `pnpm check:frontend-tokens` |
| 颜色只用随主题翻转的语义类或变量，不写 `text-black`、`bg-white`、`#hex`、`rgba()`、Tailwind 调色板色 | [视觉 token](front-视觉token规范.md) §3 | `pnpm check:frontend-theme` |
| 普通 UI 样式写在组件的 Tailwind utility 里，不往全局 CSS 加；新增全局样式先确认归属和 cascade layer | [视觉 token](front-视觉token规范.md) §11 | 评审 |

## 3. 组件与弹层

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 看起来是按钮的，用 `R/components/ui/Button` / `IconButton`；保留原生 `<button>` 的要写 `type="button"` 并有可见 focus | [组件规范](front-组件与交互模式规范.md) §2 | `pnpm check:frontend-tokens`（原生按钮数只许减） |
| 对话框、确认框、菜单、右键菜单、下拉、浮层、悬停卡片只用 `R/components/ui/` 的原语；业务组件不写 `createPortal`、`role="dialog"`，也不为关弹层自己监听 Escape 或 document 点击 | [组件规范](front-组件与交互模式规范.md) §4 | `pnpm check:frontend-tokens` |
| 只有图标的按钮必须有可读名称和 Tooltip | [组件规范](front-组件与交互模式规范.md) §3 | 评审 |

## 4. 文件放在哪、什么时候拆

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 按区域放在 `R/components/<区域>/` 下（`settings/sections/`、`sidebar/`、`conversation/`、`workbench/`、`composer/` 等），不新建 `features/` | 本页 | 评审 |
| 区域入口文件只做布局和装配，目标 400 行以内；**任何单个文件超过 500 行就要拆**，纯函数拆成 `.ts` 并写单测，有状态的逻辑拆成 `use-*.ts`。超标文件见[技术债](../../exec-plans/tech-debt-tracker.md) | 本页 | 评审（不做自动检查） |
| 拆出的模块不反向 import 区域入口；区域内共用的样式常量放该区域的 `styles.ts` | 本页 | 评审 |

## 5. 状态放在哪

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 会话数据分三类，各只有一个归属：已持久化的走 `ClientSessionStore` 的 cell，正在运行的走 `LiveRunStore` / `TaskQueueStore`，只在本机的按会话状态（草稿、队列展示等）走 `SessionLocalStore`。组件从 store 或 Context 读，不另存副本 | [会话状态与数据流规范](front-会话状态与数据流规范.md) §2–§6 | 评审 |
| 不引入状态库；新 store 是带 `subscribe` 的小对象，React 侧用 `useSyncExternalStore` | 同上 §1 | 评审 |
| 当前会话、会话动作、输入框、运行目标从 Context 读（`useActiveSession`、`useSessionActions`、`useComposerContext`、`RunTargetContext`），不逐层传 prop | 同上 §8 | 评审 |
| 本机 / 远端的差异只通过 `RunTarget` 和 `capabilitiesOf` 的能力表判断，组件不判断 `hostId` 或 `host:` 前缀 | [工作区、Git 与运行目标](front-workspace-git-worktree-context.md)「运行目标（本机与远端）」 | 评审 |
| 读写失败要让用户看到；确实只需打控制台的，在代码注释里写明理由 | [会话状态与数据流规范](front-会话状态与数据流规范.md) §11 | 评审 |
| 流式、每帧、每个实时事件经过的代码，工作量和已输出的长度、会话长度无关：已定稿的块 memo 住，渲染函数里不建解析器等重对象，实时事件只更新受影响的部分；IPC 轮询不低于 1 秒、没变化不重算 | [性能与内存约定](../../coding-standards/perf-memory-conventions.md) §6、§7 | 评审；渲染次数用计数测试锁住（参考 `chat-markdown-render-count.test.tsx`） |

## 6. 怎么调用 main

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 组件、hook、store 只 import `R/api/<域>`，不碰 `window.actspace`，也不直接用 `getBridge()` | [Preload bridge 与 Mock 规范](front-preload-bridge与mock规范.md) §3 | `pnpm check:renderer-bridge` |
| 新增 IPC 能力按 7 步走：channel 常量 → 契约成员 → main 注册 → guard → mock → 调用方 → 检查；preload 里不写业务逻辑 | 同上 §4 | `pnpm check:ipc-channels` |
| 入参涉及路径、文件、设置写入或远端 Host 的，加 guard，并补一个合法、一个非法输入的用例 | 同上 §5 | 评审 + `M/test/ipc-guards.test.ts` |
| 不写 bridge 存在检查和「当前环境不支持」的降级分支 | 同上 §3 | 评审 |

## 7. 安全边界

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| renderer 传来的工作区路径一律经 `M/workspace-access.ts` 解析，不直接 `resolve` | [SECURITY](../../SECURITY.md)「工作区访问入口」 | 评审 |
| 打开外部链接一律经 `M/platform-actions.ts` 的 `openExternalSafely`（只放行 `https:`、`http:`、`mailto:`）；不新开窗口，不让主窗口导航到外部页面 | [SECURITY](../../SECURITY.md)「外部打开白名单」「导航防护」 | 评审 |
| 新注册的 IPC 走 `createIpcRegistrar`，自动做 sender 校验 | [SECURITY](../../SECURITY.md)「IPC sender 校验 fail-closed」 | `pnpm check:ipc-channels` |
| 明文 Key 不进 renderer：renderer 只拿 `hasApiKey`、连接状态和脱敏错误 | [SECURITY](../../SECURITY.md)「主进程边界」 | 评审 |

## 8. 测试与 mock

| 规则 | 详见 | 检查 |
| --- | --- | --- |
| 用例里用 `setupBridge` / `overrideBridge` 换 bridge，不给 `window.actspace` 赋值 | [Preload bridge 与 Mock 规范](front-preload-bridge与mock规范.md) §8 | 评审 |
| 新增 IPC 时在 `R/mock/handlers.ts` 补默认实现，或明确不补；新增 mock 场景要同步更新验证文档的场景表 | 同上 §4、§7 | 评审 |
| 拆出的纯函数和 `use-*` hook 要有单测 | 本页第 4 节 | 评审 |
| `apps/web` 同样受 `check:frontend-tokens` 和 `check:frontend-theme` 约束，原生 `<button>`、`createPortal`、`role="dialog"` 只允许写在 `apps/web/src/ui/` | [Web / PWA 客户端规范](front-web-pwa客户端规范.md) | `pnpm check:frontend-tokens` |

## 9. 验收

| 规则 | 详见 |
| --- | --- |
| 按改动选验收路径：工程验证 → 浏览器 mock（`?mock=<场景>`）→ Electron；最终说明里写清实际跑过哪些 | [前端验证约定](../../FRONTEND_VERIFICATION.md) |
| 有界面变化的，看浅色、深色和 480px 窄窗；键盘走一遍：弹层的 Esc 只关最上层，关闭后焦点回到触发器 | [组件规范](front-组件与交互模式规范.md) §4、§8 |

## 10. 提交前要跑的命令

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
