## 2026-10-07 09:38 | Task: 梳理 Harness 自进化草稿与第一版方向

### Execution Context

- Agent ID：`/root`
- Base Model：未由运行环境明确提供具体型号
- Runtime：Codex desktop

### 用户诉求

整理 Harness 自进化草稿，在设计目录保存讨论；先支持 Agent 根据同类任务反复失败修改工具，同时支持用户显式需求，长期演化为领域专用 Harness。参考本地 DeepSeek Harness 实现，不展开多智能体协作。

### 变更

- 创建自进化设计专题，区分原始主张、架构事实和未批准建议。
- 调研 DSH 当前三工具入口、历史动态定义机制及插件修改范围，保存参考提交与源码位置。
- 按用户反馈补全运行时执行链：包解析刷新、Profile 重组、Loader 条目更新、HMR 模块缓存替换、Cordis 资源释放，以及 Agent 下一步工具组装；区分默认配置监听与可选源码监听。
- 核实旧动态 Runner 失败时保留版本号但可能已经撤回旧实例；将此前 ActSpace 生效时机方案明确保留为待讨论项。
- 收敛工具优先、双入口、复用固定产物与授权启用的第一版讨论稿。
- 明确 Host 执行逻辑、Run 固定租约、安装版构建、授权与隔离仍需设计；未编写功能代码。
- 结合 Actor 产品概念补充会话局部选择、Agent 模式自动交接 Run 的推荐方案；区分可复用能力版本与 Actor 身份/记忆，不实现 Actor。核实 main 固定接线、多 Harness 初始化与正常任务交接的缺口。

### 文件

本轮补充（同任务设计整理）：用户确认开发 Skill、Plugin Manager、HMR 与不覆盖运行产物、切换条目版本的方向。新增专题导航和 05–09 五份设计，细化源码工作副本、固定版本派生、局部会话选择、Actor 能力引用、Run 边界切换及分段验收。复用现有 Control / generation 底座，不实现 Actor 或功能代码。保留此前正文，导航明确新旧建议的阅读优先级。

- `docs/design-docs/自进化的方案设计/README.md`
- `docs/design-docs/自进化的方案设计/05-总体架构与DSH借鉴边界.md`
- `docs/design-docs/自进化的方案设计/06-Agent开发Skill与PluginManager.md`
- `docs/design-docs/自进化的方案设计/07-工作区与版本派生及Actor扩展.md`
- `docs/design-docs/自进化的方案设计/08-HMR与运行时版本切换.md`
- `docs/design-docs/自进化的方案设计/09-交付阶段与验收边界.md`

- `docs/design-docs/自进化的方案设计/01-Harness自进化草稿梳理.md`
- `docs/design-docs/自进化的方案设计/02-架构对照与讨论起点.md`
- `docs/design-docs/自进化的方案设计/03-工具自进化第一版骨架.md`
- `docs/design-docs/自进化的方案设计/04-会话内自进化与Actor扩展边界.md`
- `docs/design-docs/index.md`
- `docs/references/dsh-self-modification-20261007.md`

### 验证

补充设计澄清：记录用户已同意的首次局部分支提交顺序，补充新增插件模块与现有模块扩展对照。当时 A / B 切换时机待用户决定；后续决策见下节。未开始功能实施。

`pnpm check:docs` 与 `git diff --check` 通过。DSH 参考仓库的 HMR modules、reconciliation、coordination 与动态 Runner versioning 共 4 个现有测试文件、42 项测试通过；包含受控模块缓存、模拟导入和 watcher，不作为真实应用端到端热更新验收。未启动完整 DSH 或执行产品验收。本轮为设计与调研，不额外生成代码变更学习文档。

补充：ActSpace harness-generations 与 harness-run 的既有测试已阅读；尝试运行时当前 worktree 缺少 vitest，执行未成功，不计为通过。未为调研安装依赖。

本轮方案整理后重新执行 `pnpm check:docs` 和 `git diff --check`，均通过；仅进行文档验证，未重新运行参考仓库测试或进行功能验收。

### 本轮范围收敛：V1 / V2 与官方 Skill 集合

用户确认 V1 只接受显式新增/修改意图：当前 Run 多轮执行使用旧 Harness，选择与绑定提交成功后的下一条用户消息使用新 Harness。移除旧 B 自动续跑，旧 C 扩展并更名为 V2，增加失败数据自动触发、独立评估沙箱及通过后的晋升门禁。Actor 保持引用扩展，由其他工作实现。

据此同步 05–09、专题导航及总索引，旧 01–04 添加后续决策提示。HMR 收敛为选择、绑定、准入和恢复协调，不再设计强制 Run 交接；保留已确认的先提交局部分支选择、再绑定会话的可恢复顺序。

核实当前 Skill 具备目录自动发现、本地目录安装和启停管理，默认扫描链缺少官方随包来源。补充官方 Skill 资源模块方案：首个默认开发 Skill、随应用交付、扩展已有加载与列表、统一身份与遮蔽语义；不创建第二套 Skill 引擎。

本轮只修改文档；未实现运行时代码、实际 Skill 或新 package，未执行真实模型或界面验收。

本轮调整后 `pnpm check:docs` 与 `git diff --check` 通过，并检查专题新增文件的行尾空白；未执行功能测试。
