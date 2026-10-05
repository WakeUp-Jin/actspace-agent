# 13 Preload 与 Mock Bridge 验收交接

- 主线提交：`refactor/desktop-frontend` @ `<squash 提交哈希>`
- 子分支：`refactor/desktop-fe-13`（`3de509c5` 起，共 32 个提交：T0–T11 按计划拆分的提交、一个处理复核发现的提交、一个收尾提交）
- 状态：**可以交给验收**
- 启动方式：
  - 先运行 `pnpm install`（如有需要）和 `pnpm --filter @actspace/shared build`，再运行 `pnpm --filter @actspace/desktop build`。
  - Electron：在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。验证真实模型发送、远端 Host 时，可以改用已有数据目录。
  - 浏览器 mock：`pnpm --filter @actspace/desktop dev:renderer`，然后打开 `http://localhost:<端口>/?mock=<场景>`。

## 阶段：13 全部（T0–T11，单阶段）

### 用户能感知到的变化

- **桌面端**：应当没有可见变化。所有 IPC 都改走统一注册器，renderer 的兜底分支全部删除，需要回归各功能区。
- **桌面端，非法入参**：高风险 IPC 收到形状不对的入参时，报错改为「原因 (channel)」，例如 `Invalid terminal input (runtime-v2:fixed-renderer:terminal-write)`。正常操作不会触发。
- **浏览器开发模式**：App 不再有本地假会话分支，改为注入 mock bridge，可用 `?mock=` 切换 5 个场景。
- **不在桌面端打开生产包**：显示「无法连接桌面服务」致命页，不再白屏，也不再部分降级。
- **renderer 里已删除的降级提示**：「仅桌面端可用 / 当前环境不支持… / 当前桌面版本尚未加载终端桥接」这类提示不会再出现。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | `pnpm --filter @actspace/desktop test`、shared vitest | desktop 文件 145 通过 / 1 失败 / 1 跳过，用例 1098 / 1 / 2，唯一失败是基线中已知的 `workspace-git-context-service`；比 12 结束时多 7 个文件、57 个用例。shared 19 个文件、148 个用例通过 | `execution-process.md` 各 T「结果」 |
| 脚本检查 | `check:ipc-channels`、`ipc-channels.test.mjs`（12）、`check:renderer-bridge`、`test:renderer-bridge`（6）、`check:frontend-tokens`、`check:frontend-theme`、`check:current-docs`、`test:current-docs` | 通过；契约 160 个 channel（invoke 148 / send 1 / event 11），renderer 287 个文件 | — |
| 审计和测试确实能报错 | 变异验证 | 契约类型错误会被 typecheck 拦住；T7 前的 renderer 报 238 处直接访问；临时导入 `api/bridge` 会报错；mock 修复退回后新用例失败 | `execution-process.md` T1、T7、复核处理 |
| 生产包不含 mock | 构建后 grep `dist` / `dist-electron` | 没有 mock 字符串；有 `Desktop bridge missing`；preload 38 KB | `execution-process.md` T8 |
| Electron：bridge 形状 | CDP | 22 个冻结域，没有扁平名，没有 `actspaceHosts` | `screenshots/t10-electron-home.png` |
| Electron：会话 | CDP 点击 | 新建、分叉成功；右键「复制会话记录」拦截剪贴板后得到 Markdown，没有写入系统剪贴板 | `t4-electron-home.png` |
| Electron：终端 | CDP | 经 IPC `create → attach → write`，回显 `bridge-42`；从界面「新建右侧面板对象 → 终端」打开后显示 shell 提示符 | `final-panel-terminal.png` |
| Electron：guard | CDP 调 IPC | 非法终端入参被拒；`hosts.call` 单对象入参到达 main（离线 Host 返回 `Host is offline`）；配对表单拦住非法地址 | `t10-electron-host-settings.png` |
| Electron：设置 10 页 | CDP 逐页点击 | 每页都能打开，`aria-current` 跟随；没有降级文案和 `is not a function` | `final-settings-*.png` |
| Electron：语音 / 英语学习 | CDP | 语音区块正常渲染；`englishLearning.getState()` 经 IPC 返回 `unconfigured` | `final-settings-speech-english.png` |
| Electron：Review | CDP | 右侧面板 Review 列出工作区未提交改动 | `final-panel-Review.png` |
| 浏览器 mock 5 个场景 | Vite + headless Chrome（独立 profile） | empty 能发送并流式输出；streaming 打开后开始流式输出；long-session 40 轮；approval-pending 点「运行」后审批结束；remote-host 分组、离线标记正常，重连 / 移除后列表更新。控制台没有 error | `t8-mock-*.png`、`t10-mock-remote-host.png`、`review-mock-host-reconnect-remove.png` |
| 预览 fixture | headless Chrome | settings-preview 4 页、model-settings、english-learning、extensions 都能渲染，没有 error | `t9-fixture-*.png` |
| 范围复核 | Sonnet 只读子智能体 | 没有发现运行时回归；修了 5 条，4 条说明后不改 | `execution-process.md`「复核处理」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 连上模型，新建会话发送一条消息，等流式输出结束；再发一条触发工具调用和审批的消息，点「运行」 | 流式输出、工具日志、审批卡片和重构前一致 | 临时数据目录没有模型 key，按约束不使用真实用户数据 |
| A2 | 连接一台真实远端 Host：配对、重连、在 Host 上新建会话、引用远端文件、预览并下载产物、移除连接 | 都正常；Host 工作区和模型选择不再停在「等待 Host …」 | 没有真实 Host；mock 不实现 `hosts.call` / `preview` / `download` |
| A3 | 配置 MiniMax Key，打开英语辅助学习，发一条英文消息，试听朗读 | 双语输出和朗读正常 | 需要真实 Key 和音频输出 |
| A4 | 在输入框里用中文输入法输入，再粘贴一张图片、选择附件 | 输入法组合、粘贴、附件选择正常（这几处删掉了「当前环境不支持」分支） | 需要真实 IME 和系统文件对话框 |
| A5 | 设置里改几个开关（工具、外观、快捷键），重启应用 | 改动保存下来；没有 revision 冲突提示 | 我只在临时目录里看过页面渲染，没有完整走保存后重启 |
| A6 | 浏览器打开 `?mock=` 的 5 个场景，对照 `docs/FRONTEND_VERIFICATION.md` 场景表 | 与表中「覆盖」一致 | 我已经用 headless Chrome 截图检查过，这里请在有界面的浏览器里复看交互 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：
  - 置顶、重命名、归档、分叉会话；
  - 文件树、OpenInApp 菜单、提交历史 / 分支比较、Skills、Chrome 浏览器连接、本地更新页各打开一次。这些地方删掉了降级分支。

### 已知问题与未覆盖

- 测试中唯一的失败是基线中已知的那一个，与本计划无关。
- 全量测试偶发未处理错误 `ReferenceError: window is not defined`：约 3/7 次出现，栈在 `ResponseAnnotationPill.tsx` 的 HoverCard 定时器。在本计划起点 05ffe370 上也复现了，不是本计划引入的；用例计数不受影响。
- `hosts.call` 的返回类型仍是 `unknown`。按 method 区分要改 host-protocol（C3），本轮不做。
- mock 没有实现 `hosts.call` / `preview` / `download`、`terminal.create`、worktree 创建，调用会 reject，并且错误信息里写明了成员名。
- 两处 `!sessionId` 分支的文案仍是「当前环境不支持可视化转换 / 会话图片预览」，措辞过时但不是 bridge 检查，没有改。
- 08 §5 验证矩阵里有 7 个单测还没写（矩阵中标 `*`），按计划在 14–16 中补。
- `execution-process.md` 里 T0–T10 的路径用了 `R/`、`M/`、`P/`、`S/` 缩写，含义见计划文档开头。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
