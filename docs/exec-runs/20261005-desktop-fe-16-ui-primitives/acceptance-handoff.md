# 16 UI 原语与组件拆分验收交接

- 主线提交：`refactor/desktop-frontend` @ `4ba97aaf`
- 子分支：`refactor/desktop-fe-16`（`82d75436`..`e87bb8aa`，共 23 个提交，每个 T 一个提交；另有计划外的 T16b、收尾验收修复 `8b6bf867`、复核修复 `bbc8033f`）
- 状态：**可以交给验收**（原先待你确认的两项已于 2026-10-06 确定，见「已知问题与未覆盖」第一条）
- 启动方式：
  - 先运行 `pnpm install`（这份计划新增了 Radix 依赖），再运行 `pnpm --filter @actspace/shared build` 和 `pnpm --filter @actspace/desktop build`。
  - Electron：在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。附件和草稿的检查需要能发消息的模型，用你平时的数据目录更方便。
  - 浏览器 mock：在 `apps/desktop` 下运行 `pnpm dev:renderer`，打开 `/?mock=empty` 或 `/?mock=streaming`。

## 阶段：16 全部（T0–T18 + T16b + 收尾修复，单阶段）

### 用户能感知到的变化

- **弹层、菜单、对话框的键盘行为统一**：
  - Esc 一次只关最上层（例如设置里的对话框开着时按 Esc，只关对话框，不退出设置）；
  - 关闭后焦点回到打开它的按钮；
  - 菜单可以用方向键、Home / End、字母跳转；会话行支持 Shift+F10 / 菜单键打开右键菜单；
  - 对话框里 Tab 不会跑到背景上。
- **设置页的下拉**：原来是系统原生 `<select>`，现在是和菜单同一套外观的下拉，选中项前打勾。
- **附件跟着会话走**：在 A 会话加的图片，切到 B 不会出现；切回 A 还在。新建页发出第一条消息时，输入框不再重建，焦点不丢。
- **侧栏会话行**：重命名用 Enter / Esc 结束后，焦点回到会话标题；状态点的说明改为点开的浮层。
- **三处按钮外观小变化**（T17，你已确认先保持现状）：执行轨迹的「停止」、设置数值调节的「重置」悬停底色、子 Agent 详情页的「返回」。细节见 `execution-summary.md`「需要你确认」。
- 其余是内部改动：四个大文件拆分、检查脚本加按钮基线和弹层位置检查。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | desktop vitest | 文件 182 通过 / 1 跳过，用例 1402 / 2 跳过，没有失败；比 16 开始时多 12 个文件、118 个用例 | `execution-process.md` 各 T「验证」 |
| 脚本检查 | `check:frontend-tokens`、`test:frontend-tokens`（15 条）、`check:renderer-bridge`、`check:current-docs` | 通过 | — |
| grep 门槛 | `components/ui/` 之外的 `createPortal`、`role="dialog"` | 0（例外只有 ResponseAnnotationPill 的 HoverCard，登记在脚本里） | 检查脚本 |
| 原生按钮 | 按钮基线 | 234 → 230，只减不增 | `scripts/native-button-baseline.json` |
| 用例确实能拦住错误 | 变异验证 | 每个 T 的关键判断都有用例失败；存活的写明了原因，其中 jsdom 测不出的两组已在 Electron 里实测 | `execution-process.md` |
| mock：Composer 单次挂载 | vite + 无头 Chrome，`?mock=empty`，前后对比 | 三种窗口尺寸下位置尺寸与改前相同；发第一条后是同一个输入框、焦点还在 | `screenshots/t14-*` |
| mock：T17 外观 | 同上，前后截图逐字节比较 | 设置外观页、搜索页相同；三处变化如上 | `execution-process.md` T17 |
| Electron：弹层键盘行为 | 临时数据目录，CDP 发真实键盘 / 鼠标 / 触摸 | 侧栏右键菜单、图片生成对话框、打开方式菜单、会话状态说明、权限菜单、消息 ⋯ 菜单、设置 Select 都符合预期；发现两处 SessionRow 问题，已修（`8b6bf867`）并复测 | `execution-process.md`「收尾验收」 |
| Electron：480 窄窗 | `Emulation.setDeviceMetricsOverride` | 右键菜单、Select、权限菜单、⋯ 菜单都在窗口内，底部的 Select 向上翻；「复制」子菜单左边出界（已知，见下） | `screenshots/closeout-480-*` |
| Electron：页面截图 | 默认窗口 | 会话页、设置通用页、模型页无错位 | `screenshots/closeout-session.png`、`closeout-settings-*.png` |
| 范围复核 | Sonnet 只读子智能体 | 5 条发现，2 条是 16 引入的回归，已修（设置下拉 Esc 连带退出表单；换会话不收起 Composer 浮层），各加一条用例；3 条是旧问题或理论漏报，记技术债 | `execution-process.md`「复核处理」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 侧栏会话：聚焦标题，Shift+F10 → ↓ → Enter「重命名」→ 改名后 Enter；再来一次，按 Esc | 菜单打开时焦点在第一项；重命名结束后焦点回到会话标题；Esc 不连带关别的东西 | 我只能用 CDP 注入按键，没有真实键盘和读屏 |
| A2 | 开 VoiceOver，走一遍 A1、设置 → 图片生成设置对话框、消息 ⋯ 菜单 | 读出菜单 / 对话框名称和当前项；关闭后读出触发按钮 | 不能用 computer use，听不到读屏 |
| A3 | 会话 A 输入文字并拖入一张图片，切到会话 B，再切回 A；再切到设置页再回来 | A 的文字和图片都在，图片预览没坏；B 里没有 A 的附件 | 需要真实会话数据；我用 mock 和单测验证过 |
| A4 | 新建页输入后发送第一条消息 | 输入框不闪、焦点留在输入框里 | 同上，请在真实模型下复看 |
| A5 | 设置 → 通用：改「默认会话模型」「快速唤起打开目标」等下拉，用鼠标和键盘各一次 | 选中立即生效，重开设置仍是新值；窗口底部的下拉向上展开 | 我只验证了打开、关闭和位置，没有在真实数据上改值 |
| A6 | 打开设置里的一个对话框，按 Esc；再按 Esc | 第一次只关对话框，第二次才退出设置 | 请用真实键盘复看 |
| A6b | 设置 → 模型 → 自定义连接 → 编辑模型，展开「推理支持」等下拉，按 Esc | 只收起下拉，表单还在 | 复核发现并修复的回归，我只有单测 |
| A6c | 会话 A 打开输入框的「+」菜单或上下文用量，用 ⌘N 或侧栏切到别的会话 | 菜单和浮层收起 | 同上 |
| A7 | 看三处按钮外观：执行轨迹的「停止」（流式中）、设置里数值调节的「重置」悬停、子 Agent 详情页的「返回」 | 已确认先保持现状（2026-10-06）；验收时顺带看一眼即可 | 设计判断需要你来定 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：
  - 侧栏右键菜单的每一项（置顶、重命名、复制 ID / 会话记录、分叉、归档）；工作区右键「归档全部」；
  - Git 提交对话框、Review 的范围和跳转浮层、Mermaid 全屏预览；
  - 消息队列托盘的 ⋯ 菜单（排队时）、批注胶囊的悬停卡片。

### 已知问题与未覆盖

- **已确认（2026-10-06）**：
  1. `pauses.md` P2：选 A，ResponseAnnotationPill 保留 HoverCard，已写进 16 的决策记录。
  2. T17 的三处按钮外观变化：先保持现状，不改回。
- **窄窗子菜单**：窗口 480 宽、侧栏覆盖层打开时，会话右键菜单的「复制」子菜单左右都放不下，翻到左侧后左边约 52px 出界。两项仍可用键盘操作。16 之前的手写子菜单在这个宽度下出界更多。已记技术债。
- **16 之前就有、这次发现的**（已记技术债，没有改）：
  - 设置里的 `ProviderKeyModal` 没有入口：`onConnectProvider` 没有调用方。
  - 输入框上方「更多审查操作」⋯ 没有 `onClick`，点了没有反应。
- **还没迁移的手写弹层**：RightPanel 标签溢出菜单、可视化回复的文件列表、设置页的模型多选；Composer 内的菜单随 09 迁移。
- 我没有真实键盘、读屏和系统浏览器，键盘行为都是 CDP 注入的事件；请以 A1、A2、A6 为准。
- `execution-process.md` 里的路径用了 `R/`、`M/`、`S/` 缩写，含义见计划文档开头。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
