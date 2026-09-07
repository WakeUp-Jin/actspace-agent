# ActSpace DSH 轨迹页面完整能力迁移 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260905-actspace-dsh-trajectory-parity/README.md`
- **执行过程**：`docs/exec-runs/20260905-actspace-dsh-trajectory-parity/execution-process.md`
- **执行模式**：交互
- **执行结果**：Phase 0–5 已完成；用户已接受前端，真实 Projection/IPC 与隔离 Electron 验收通过。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| DSH 轨迹 runtime 与 renderer | `apps/desktop/src/renderer/trajectory/*`, `TrajectoryView.tsx` | 保留 runtime contract、事件归并、partial、tool/result、时间线、虚拟化、搜索和详情；排除 DSH tab 系统。 |
| 浏览器 mock fixture | `apps/desktop/src/renderer/trajectory/fixtures.ts` | 支持 `complete`, `running`, `errors`, `long`, `empty`，仅显式 query 启用。 |

## 人工验证指引

1. 打开 `http://127.0.0.1:5173/?trajectoryFixture=complete`，点击会话标题左侧图标进入 Trajectory。
   - 预期：顶部只显示 Duration、Turns、Calls、Search；下方是 Input / Model / Tools timeline 和连续 ledger；Composer 仍在底部。
2. 检查 `running`、`errors`、`long`、`empty` fixture。
   - 预期：partial、失败、长列表虚拟化和空态可读；stream chunk 不逐条显示为普通文本行。
3. 点击 record、搜索、折叠 Turn/Calls，并在 timeline 上点击或拖拽范围。
   - 预期：Turn 编号位于第一条消息内；折叠显示步骤和工具调用摘要；范围会聚焦并淡化 ledger，详情 tabs 随消息类型变化。
4. 真实数据验收请在 Electron 中打开会话并切换 Trajectory；浏览器 fixture 继续用于展示回归。

## Agent 已完成的验证（2026-09-06）

- 浏览器实际点击 DSH 的 Duration、Turns、Calls，检查 User Source，并对照时间轴拖选后的边界、聚焦和淡化效果。
- ActSpace 实际点击 Tool 的全部五个 tabs，Assistant Step 2 时间详情、Turns 摘要、Calls 成组恢复、搜索、时间轴拖选与 Escape 清除。
- 6 Turn complete fixture、失败详情、empty 空态和 long fixture 已检查。long 为 144 Turn、约 2 万像素列表，滚动期间只挂载 22–31 行。
- 实际观察 1280px 宽屏浅/深主题和 571px 窄屏；窄屏详情使用底部抽屉。指定 viewport override 未生效，宽屏通过后台独立标签的默认尺寸验证。
- 补充浏览器验证通过：Load earlier history、嵌套工具折叠/父级跳转、Prompt Diff、请求边界、详情栏从约 538px 拖至 630px；滚轮缩放后可见 span 从 23 变为 8。
- 右键平移实现尚未做真实右键拖动验收。
- focused tests：31 个测试通过（builder、fixture、renderer、workbench，含空白会话草稿）。
- desktop typecheck、renderer build、Electron main/preload build、主题契约检查通过。renderer 仍有既有大 chunk 提示。

## Phase 5 之前的门槛（历史记录，现状见文末）

- 真实历史分页 transport 在 Phase 5 接入；当前 Load earlier history 只扩展本地 fixture 的完整 Turn 窗口。Prompt Diff 使用保留公共前后缀的逐行增删展示，不承诺最小编辑脚本。
- 已启动真实 Electron 进程；Computer Use 无法识别开发应用的临时 ID/路径，因此窗口、preload/IPC 和真实会话点击验收尚未完成。启动日志出现 Chromium cache 结构错误，未清理用户缓存。
- Phase 5 的真实 Projection/IPC 接入继续等待用户验收；本轮没有修改该链路。
- 仓库还有大量其他未提交变更；`check:docs` 本轮复跑通过。

## 本轮补充验收：消息与工具关联

1. complete → 第一条 Assistant：Summary 和 Preview 都列出 read_file、bash；Raw 按 thinking、text、两个 tool-call 显示四个原始块。
2. 点击任一工具引用或 Raw 块标题 → 对应 Tool Summary；Hierarchy → 原 Assistant。折叠 Turns / Calls 或搜索不匹配内容后再次点击，目标仍应展开、选中和定位。
3. Tool Schema 显示名称、中文工具描述、参数说明和必填项；Payload 仍显示这次实际 file_path/limit 或 command。
4. User Raw 只显示消息原文，Source 保留来源；完整 Journal 仍可从 Summary 的 Source events 展开。列表不再有 #N 请求小标记，Assistant Source 里的 Request #N 仍可进入请求详情。
5. Running 样例的工具入口可点击，状态 Running，缺失结果与时间不伪造。

本轮已执行上述核心浏览器点击并检查浅深主题；35 项 focused tests 通过（含 4 项新关联回归，最初 2 项已观察旧代码失败）。新增场景中的同名工具错配、跨本地历史窗口和时间范围解除由自动化测试覆盖。desktop typecheck、renderer/main/preload build 通过。Electron 开发名称及 bundle ID 均无法被 Computer Use 定位，窗口验收仍待完成。Phase 5 继续等待用户批准。

## Phase 5 完成记录

- 真实 User surface、Inbox claim、request snapshot、工具 modelOutput/inputSchema、压缩事务、failed/aborted 与运行中消息已适配。
- 共享 IPC 输入增加历史 cursor；主进程固定所有投影版本，完整 Turn 累计分页；bridge 保留窗口、处理 runtime gap 与并发失效回复。
- 实际 session/event 提交通知按会话合并，弥补原 live 事件 revision=0 的刷新缺口。
- 工程验收：Desktop focused 46 项、Session Projection 10 项；desktop typecheck、renderer/main/preload build、theme/docs/diff 检查。renderer 既有大 chunk 提示仍在。
- 浏览器：浅色 Assistant→Tool、Schema 和深色窄屏轨迹/Composer 已实测。
- Electron：Computer Use 无法定位临时开发 app；改用 Playwright Electron 启动隔离实例，真实创建并落盘 25 Turn Journal，实际通过 preload/IPC 验证一致 revision、历史分页、轨迹 UI、Assistant→Tool、Result、Schema、Journal commit 通知、Composer 草稿切换、重载恢复。没有调用 Provider。
- 可复跑脚本：`apps/desktop/scripts/verify-trajectory-electron.mjs`；设置 `ACTSPACE_PLAYWRIGHT_MODULE` 指向本机安装的 `playwright/index.mjs`，先完成 desktop build，运行 `node apps/desktop/scripts/verify-trajectory-electron.mjs`。测试数据和截图在脚本输出的独立系统临时目录。
- 保留边界：真实 Provider 长会话、Browser 外部能力、超大 Journal 读取性能、打包签名/公证未包含在本轮完成声明中。当前分页限制传输窗口，仍全量读取 Journal / surface snapshot。
