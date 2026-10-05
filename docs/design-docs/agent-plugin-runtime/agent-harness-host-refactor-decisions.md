# Harness 与 Host 重构：最终决定

更新：2026-10-05。P1–P5 架构与[最终收尾计划](../../exec-plans/completed/20261005-agent-refactor-final-closeout/README.md)已完成本次批准范围：模块解耦、Host/客户端分离、冗余代码与根目录清理、文档校准及逐项验收。隔离源码自动化与 35/35 Computer Use 通过，证据和保留限制见[最终结算](../../exec-runs/20261005-agent-refactor-final-closeout/execution-summary.md)。这不表示全仓已被证明不存在任何冗余，也不包含未来自进化具体功能。

## 目标与优先级

1. 核心与扩展解耦，以可组合、可替换的 Harness 为未来自进化准备条件。
2. Host 与客户端分离，真实承担远端执行、生命周期和连接。
3. 删除重复实现、无用适配和失效测试，让职责与目录容易理解。
4. 当前文档跟代码一致，合并重复内容并退役失效方案；histories 和 learnings 保留。

模块化优先于包数、文件数和行数。默认必装不等于不可替换；Loop 同样属于可替换执行能力。独立模块不强制成为独立 package。不要因精简而合并需要独立演进的职责。

## Host、Harness、Run 与 Session

- Host 是稳定基底，拥有进程、认证连接、接纳和队列、组合选择、存储及资源管理。未来自进化先面向 Harness，Host 升级不混入此功能。
- Harness 是 Host 上独立装配的插件组合，包含 Loop、工具、上下文和策略。Run 是使用固定组合的一次执行；Session 跨 Run 保留。
- 本机 Desktop 默认内嵌，独立远端 Host 持续运行。退出本机应用不承诺本机任务后台继续；退出远端客户端不取消远端已接纳任务。
- 同一 Session 每次新 Run 选择当时成功启用的组合；子 Run 独立选组合，保留父子权限与取消约束。正在运行的 Loop 不热切换。
- “版本”表示可识别的实现/配置组合，不是产品 v1/v2，也不是模型版本。编辑磁盘源码不等于启用。

当前源码分工见[总体架构](agent-target-overall-architecture.md)、[Runtime](agent-target-runtime-architecture.md)、[Task/Run](agent-task-run-lifecycle.md)。

## Profile / Bundle / Patch 与启用

- Profile 提供启动身份，Bundle 组织组合，Patch 表达相对明确基线的差异；基线冲突拒绝，不自动合并。
- Patch 生成完整新定义后独立装配。保持 Host/Profile 稳定，旧 Run 使用旧树至释放；不做跨组合实例复用、自动影响计算或插件级共享引用优化。
- 固定运行产物包括实现依赖与资源，不能只固定入口文件；不冻结工具操作的工作区。旧 Run 所用产物不被后续编辑覆盖。
- HarnessControl 负责准备、Host 独立授权、持久启用与恢复；generation/lease 机制只管理实例生命期。代码修改、Bash 或文件授权不包含启用授权。
- 静态契约与隔离装配都要检查；通过不等于行为效果提升。候选不能批准自己，也不能靠真实业务副作用证明可用。
- 候选失败保留原选择；成功启用后旧实例清理失败单独诊断，不逆转启用结果。普通任务失败不自动回退，回退同样准备与授权。
- 共享 Host 能力、codec 或持久格式变化按重启与兼容检查处理，不在线改历史读取规则。恢复失败阻断执行，保留诊断和维护入口，不静默换成其他组合。
- 最近成功选择持久化，旧实例无租约后释放；固定文件保留供回退，不新增自动 GC，也不承诺卸载 Node ESM 内存。

详见[组合契约](agent-spec-profile-bundle-patch-layering.md)和[Host 指南](agent-host-guide.md)。

## 任务、队列、配置与审批

- 队列持久保存内容，不在入队时冻结模型或 Harness。配置按消息实际交付时读取；正在进行的模型请求不重启。
- 模式在同会话的 Run 之间可换，单次 Run 固定模式，不做运行中模式切换。
- 插入是把队列中的内容指定给当前 Run，不建第二套队列。主任务服务统一决定接纳、顺序、取消与消费。
- 接纳以持久保存成功为界；同一次提交稳定标识去重。丢回执重试返回原任务，不保证外部工具副作用 exactly-once。
- 审批等待不消耗执行时长预算，显式截止时间仍生效；离线不自动批准，取消使待审批失效，不撤销已发生的外部副作用。
- 多端可同时操作，Host 排序、校验 revision；审批 first valid wins，不做控制权移交。

## 客户端、认证与会话归属

- 进程内类型化直调；Desktop renderer/main 保留 IPC。进程外 JSON-RPC over WebSocket，Desktop 支持 WSS 和 SSH 隧道；SSH 不另造业务协议。
- 单所有者、多设备、自管 Host；不增加多租户系统。一次性短期配对码授予独立设备凭据，后续自动连接，设备可单独撤销。
- SSH 使用系统配置、密钥和 agent，校验服务器身份；回环访问不是授权，关闭隧道不停止 Host。
- 会话创建前选 Host，创建后固定归属；统一展示本地/远端会话，以标签区分，不按 Host 切整页列表。已有会话不隐式迁移。
- 服务器拥有工作区、Provider、密钥和模型配置。客户端选择 Host 公布的能力，不同步本机凭据或误用本机路径。
- 断线保留历史、输出和可编辑草稿，禁发/停止/审批；新离线草稿不自动发送。未确认提交以原标识核对。
- 重连恢复当前状态与保留输出，再衔接订阅；历史分页，不永久逐字重放流式输出，不重新执行任务。
- 发送时上传附件，全部成功再提交；失败保留正文/附件。结果经认证访问或主动保存，不自动覆盖本机文件，不做目录同步。

## 维护与恢复

正常维护拒绝新任务、暂停领取队列，等待当前 Run 和审批收尾；显式强停请求取消并限时清理。重启后队列手动继续，未结束 Run 标为中断，不重放未知副作用，不承诺恢复旧 Loop 内存。客户端断线与 Host 崩溃是两种边界。

## Cordis 与资源所有权

- 统一使用 Cordis 插件、Service、事件与生命周期，不另造事件总线。通知默认 emit，监听注册处隔离异常，异步工作由监听插件拥有。
- 必需持久化、权限、审批和工具结果属于能力调用链，不能靠 fire-and-forget 通知完成。checkpoint 必须 await 服务。
- 扩展使用 Cordis 约定的 emit/waterfall/parallel/serial/bail，事件声明记录 @mode；不按名称猜测分发方式。
- Context 释放只回收正确登记的资源，不自动撤回已发生的文件或业务副作用；Cordis 同进程插件不是恶意代码沙箱。
- 共同应用操作、调度、Run 绑定与入口策略按职责区分。标题是可选 Desktop 行为，辅助文本调用保留现有用途；此次清理移除基类标题钩子，使用 Cordis 观察与独立资源所有者。

## 本次边界与验证

不实现自进化源码工具/评估闭环、手机 Web 前端、原生手机 App、推送、真实用户云部署、远端 Terminal/Git Review/本机浏览器转发。服务端远端任务、附件与结果链路已属 P4 交付。

不为假想外部使用者保留永久兼容层，内部消费者一起迁移。设置、凭据和连接配置必须保留；本轮不清理真实会话历史、用户工作区或产物。

[P1–P5 计划](../../exec-plans/completed/20261003-agent-harness-host-refactor/README.md)记录批准范围；[最终验收](../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)区分 UI、协议、进程和未覆盖项。实机验收委派 gpt-6.1-sol，开发与修复由主智能体负责。

原始讨论可通过 Git 查看：`git show 1bc434d62152a783990e30e738eacc9ec302e140:docs/design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md`。该快照包含被后续决定替代的方案，不作当前实现依据。

## 早期决定保留的理由

采用 DSH 发布的 Cordis 基底而不引入其完整产品；Agent 语义、Session 格式和 Host 流程归 ActSpace。Provider wire/catalog 留在 LLM Adapter，凭据和代理留在 Host；固定前端不执行任意插件代码。

Profile-first 表示先确定组合身份和资源所有者，不表示全应用只有一棵执行树。Headless 与 Desktop 复用应用服务，保留各自输入和退出策略；managed ESM 支持插件装配，CLI 默认临时会话、显式持久化。早期全量 restart-only、用户 Inbox、仅允许 JSONL 的限制已由本页决定替代。
