# Context 引擎 Computer Use 验收

日期：2026-10-06。执行者：按仓库约定委派的 `gpt-6.1-sol` 验收子智能体。仅操作隔离 Electron，未修改业务代码、导入凭据或连接真实 provider。

## 环境与证据边界

- 主 Agent 使用 `ACTSPACE_DATA_DIR=/tmp/actspace-context-engine-acceptance pnpm dev:log` 启动，日志为 `/tmp/context-engine-desktop.log`。
- 日志 `[dev-runtime]` 确认 workspace 为本 worktree，`appName=Actspace Dev 956e-3624`，`appId=com.actspace.desktop.dev.w3624b697`，Electron 39.8.10。CUA 以该 bundle ID 绑定窗口 `actspace`，没有操作其他应用实例。
- 真实窗口加载成功，侧栏、Composer、设置、右侧 Context 均可操作。设置中的 Agent 指令路径显示隔离目录 `/tmp/actspace-context-engine-acceptance/prompts/main-agent.md`。
- 模型设置真实显示“还没有连接模型服务”；Composer 显示“未连接模型”，发送按钮 disabled，帮助文本为“暂无可用模型，请在设置中连接服务商”。输入非空测试草稿后仍为 disabled。未形成模型请求或持久测试会话。
- 日志有隔离目录 Chromium cache 创建失败提示；本次界面可正常加载，未据此判定 Context 引擎失败。
- 下列 E1–E4 是本次 CUA 工具输出中的 AX 记录和内联截图；未将截图另存仓库文件。源码、自动化测试和主 Agent 的工程检查结果不计作本报告的真实 UI 通过证据。

## 验收点与执行分组

验收点沿用 P4 的 U1–U8：常规请求与引用、Chat 模式边界、手动压缩、冷热导航周期、历史/索引与权限、恢复/fork、Context 实际输入与模型容量、英语学习/停止/重试。

1. 常规场景：进入隔离空会话，核实模型配置，打开 Context 详情，执行 Agent → Chat → Plan → Agent 切换，输入无敏感信息测试草稿。覆盖 U1/U2/U7/U8 的可达入口；保留 E1–E4。
2. 压缩场景：无 provider，发送被禁用，不能形成冷热文件读取、压缩摘要、睡眠索引或权限请求。U3/U4/U5 及 U7 的实际输入检查未执行。
3. 恢复/fork：隔离实例没有已持久请求会话，不能执行具有引擎状态的恢复与 fork。U6 及 U4/U5 定向复查未执行。

## 实际界面证据

- **E1：模型设置截图 + AX**。操作：设置 → 模型。截图显示模型连接空态和“添加连接”；AX 明确“还没有连接模型服务”。
- **E2：Context 详情截图 + AX**。操作：返回应用 → 打开右侧面板 → 上下文。真实文案为“当前没有可展示的上下文明细。开始对话后，这里会按分组列出喂给模型的完整上下文。”未显示伪造的实际输入。
- **E3：模式切换 AX**。Agent 菜单含 Agent/Plan/Chat/图片/Skills；选 Chat 后出现“移除 Chat 模式”，工作区环境入口从 AX 消失，添加菜单变为 Agent/Plan/Chat/图片与文件，不含 Skills；选 Plan 后出现“移除 Plan 模式”、工作区环境入口恢复、菜单再次含 Skills；选 Agent 后 Plan 标记移除。
- **E4：非空草稿截图 + AX**。输入 `Context engine acceptance: isolated test draft.` 后，仍显示“未连接模型”，发送按钮 disabled；Context 详情继续显示无请求空态。草稿没有被发送。

## 逐项结果

| 验收点 | 结果 | 已观察内容与缺口 |
| --- | --- | --- |
| U1 Agent/Plan 请求、工具读取、引用附件 | 未覆盖 | Agent/Plan 入口可操作（E3）；未连接模型，无法发送请求或验证工具、附件、图片/引用的请求链路。 |
| U2 Chat 规则与工具边界 | 未覆盖 | Chat 切换隐藏工作区环境/Skills，切回恢复（E3）。真实请求的规则、工具边界与补充残留未验证，不能整项通过。 |
| U3 手动压缩与摘要反馈 | 未覆盖 | 无请求历史，未触发手动压缩、Relevant Files、失败/无需压缩反馈。 |
| U4 冷热导航与下一周期恢复 | 未覆盖 | 未形成工具读取和成功压缩，不能验证 active/sleeping 周期状态。 |
| U5 原始历史/索引、重读与权限 | 未覆盖 | 没有可操作的对应 Session 历史与睡眠索引；未执行文件重读或权限拒绝。 |
| U6 重启/恢复/fork 独立性 | 未覆盖 | 隔离空实例不存在有请求状态的会话，未执行恢复/fork。 |
| U7 Context 实际输入与容量 | 未覆盖 | 右侧详情空态正确（E2/E4），设置导航可访问。没有本次模型请求，Popup、容量和新增补充的位置未验证。 |
| U8 英语学习、停止、重试 | 未覆盖 | 通用设置保留英语辅助学习/语音配置文案，未配置时提示仍可双语输出；无模型请求，未执行英语学习响应、停止或重试去重。 |

没有发现可确定归因于 Context 引擎的真实 UI 失败；上述未覆盖也不能解释为通过。未声称 provider cache 命中、真实摘要质量或自动压缩通过。

## 有配置环境的复验步骤

1. 在明确授权的隔离 provider 环境完成普通 Agent/Plan 请求、文件读取与附件/引用检查；切 Chat，再切回；查看 Popup 和详情并核对请求快照；执行英语学习、停止和重试，核对尾部补充不重复。
2. 在同一会话准备超过 active 容量的冷热文件 fixture，手动压缩，核对 Relevant Files 和导航；读取 sleeping 文件观察其不立即唤醒，再成功压缩核对排名；读取实际历史与索引，压缩后重读源文件，执行一次拒绝权限；用 Journal/请求快照辅助核对中间周期。
3. 重启恢复该会话并 fork，核对历史/摘要仍可查看，父子引用和读取计数独立，定向复查历史权限与导航；另以真实 provider 触发一次可达自动压缩，恢复测试阈值。

本次没有变更 provider、阈值或其他应用配置。临时进程由主 Agent 在报告收到后关闭；不删除用户原始数据。
