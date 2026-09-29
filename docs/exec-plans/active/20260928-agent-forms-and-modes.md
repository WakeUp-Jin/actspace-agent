# 单一 Agent 形态与 Chat / Plan / Agent 模式执行计划

> 状态：执行中。T1–T7 已实现；T8 的真实 Chat/Plan 主要路线已验证，部分 Electron 验收未覆盖。
> 验证记录：[执行摘要](../../exec-runs/20260928-agent-forms-and-modes/execution-summary.md)。

## 1. 目标与范围

将当前固定的主 Agent/Chat preset 收敛为一个真正由插件组成的内建形态，并支持 Session 内三模式持久切换。Chat 恰好开放 `web`、`generate_image`；Plan 使用设计中的显式能力白名单；模型可见范围与 Tool Runtime 执行范围同源。

包含：形态成员激活生命周期、模式策略、直接工具调用门禁、Session 事件/投影/恢复/fork、Desktop/Headless 接入、Composer 和旧数据兼容。

不包含：第二种形态、第三方形态配置、插件市场、工具包物理拆分、新搜索/图片供应商、部署、提交或推送。

用户已确认按本文执行，D1–D5 按已批准的实施建议推进。

## 2. 必读与当前证据

执行者先读 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`、`docs/CODING_BEHAVIOR.md`、`docs/PLANS_GUIDE.md`、`docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`。

专题：本设计、`docs/design-docs/agent-runtime/agent-main-chat-form.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-agent-scope-model.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`、`docs/design-docs/execution-safety/agent-tool-permission-model.md`、`docs/FRONTEND_VERIFICATION.md`。改样式前读 `docs/design-docs/frontend/front-主题与配色规范.md`。

2026-09-28 源码检查基线：

| 路径 | 当前行为与迁移目的 |
|---|---|
| `packages/core/agent/src/main-preset.ts` | 两个静态 preset；转为唯一组合与旧 preset 解码 |
| `packages/runtime/src/runtime/agent-factory-plugin.ts` | 工厂按 preset 一次绑定 prompt/tools/compaction；转为形态成员激活与按模式策略消费 |
| `packages/core/agent-loop/src/loop.ts` | `plan/agent` 逐轮值；`toolDefinitions` 筛选、`runTools` 已拒绝不可见工具；保留检查并统一策略 |
| `packages/tools/runtime/src/runtime.ts` | `executeBatch` 转入 scheduler；在真实准入/执行路径补 scope 策略校验 |
| `packages/shared/src/runtime-v2/runtime.ts` | `MainAgentForm=agent/chat`、`RuntimeV2AgentMode=plan/agent`；拆清规范字段和旧输入 |
| `packages/runtime/src/runtime/session-controller.ts` | Header preset、创建、恢复及 fork；新增组合绑定与模式恢复 |
| `packages/desktop-app/src/service.ts` | 旧 Chat 强制以 agent 参数执行并清空 selected Skills；移除 preset 特判 |
| `packages/tools/core-tools/src/manifest.ts` | 已注册 `web` 与 `generate_image`；不重写工具业务实现 |
| `packages/subagent/src/preset.ts` | 现有两个 child preset 只开放四个文件探索工具；继承父上限，保持子 Agent 只读 |

这是超过 8 个文件、跨 Runtime/Session/Tools/Host/UI 的改动，估计为数个工作日量级，不按一次下拉框修改估算。沿用现有服务，不增加新全局服务。

## 3. 交付策略与依赖

采用一个完整可交付切片，T1–T7 是内部顺序步骤，不能单独发布半成品。T8 完成后才可声明实施结束；不伪装成彼此独立的发布阶段。

数据链：

```text
Composer → Desktop IPC / App Service → Session 串行接纳
                                          ↓
                                 Journal / 模式投影
                                          ↓
形态定义 → AgentScope 成员激活 → 策略快照 → Loop / Prompt
                                          ↓
                                 Tool Runtime → Host policy
```

审批前无需新账号、API key、MCP 或外部 CLI。开发和确定性测试使用现有 pnpm/Vitest、fixture，不调用付费服务。真实搜索/生图/模型验收使用用户已有配置；服务可用性未在文档阶段验证，执行时只记录配置是否可用，不能读取或输出密钥。无配置则记录该实机项未覆盖，不能改为绕过配置。

工具策略和插件组合在已有包内实现；没有对外框架 API 升级需求。已有 AgentScope、disposer、registry 是复用基础，不引入另一套插件加载框架。

## 4. 执行任务

### T1：建立形态、模式与兼容契约

- 修改 `packages/shared/src/runtime-v2/runtime.ts`、`projection.ts`、`desktop-ipc.ts`、`fixed-renderer.ts`，统一规范 `agentFormId`、`agentMode`、模式 revision；保留 permission 字段原义。
- 在 `packages/core/agent/src/main-preset.ts` 及新增 `agent-form.ts`、`agent-mode-policy.ts` 定义唯一内建组合、版本、依赖和模式白名单；通过该包公开 exports 暴露。
- 增加旧 preset 的显式映射，拒绝未知值；避免把旧 Chat 的内部 `turn/start.mode=agent` 当成用户选择。
- 验证：集合相等测试覆盖 Chat 两工具、Plan 全名单、Agent 工具名单；新工具注册不自动增加允许集合；未知形态/模式失败。

### T2：实现 Agent 范围的插件激活

- 修改 `packages/runtime/src/runtime/agent-factory-plugin.ts` 与 `agent-runtime-plugin.ts`；使用形态定义激活成员，再发布 Agent。
- 在 `packages/prompt/src/plugin.ts`、`packages/tools/core-tools/src/plugin.ts`、`packages/core/agent/src/todo-tool.ts`、`packages/subagent/src/tool-plugin.ts`、`packages/compaction/src/plugin.ts` 增加或提取 Agent 激活入口；Browser 使用 `packages/tools/browser-tools/src/plugin.ts` 的可选成员绑定。
- 利用 `packages/core/scope/src/scope.ts`、`disposer.ts` 和 scoped registry；共享工具 executor 只注册一次，Agent 绑定由自身 scope 释放。英语辅助行为沿用现有显式启用 scope，不改变产品默认。
- 保存实际组合成员/版本/digest。缺 required 成员失败；缺 optional Browser 不扩大其他模式。
- 验证：两个 Agent 并存、未选成员不贡献、第二成员激活失败逆序清理、重复释放、恢复不重复订阅、释放一个不影响另一个。

### T3：Session 模式持久化与串行接纳

- 修改 `packages/session/journal/src/core-codecs.ts`、`packages/session/projection/src/facts.ts`、`projection.ts`；增加模式事件与兼容组合绑定事实、fold、codec 校验及 replay fixture。
- 修改 `packages/runtime/src/runtime/session-controller.ts`、`run-controller.ts` 和 `packages/core/agent-loop/src/service.ts`；所有模式变更与 Run 接纳经过相同 Session 串行边界。
- 新建保存 initial mode；显式切换写入并 flush 后才更新可运行状态；busy/过期 revision 不写事件。持久化失败后保持不可运行直至重放恢复。
- 同步 `packages/runtime/src/projection/durable-session.ts`、`packages/session/projection-cache/src/journal-cache.ts`、`global-index.ts`，升级派生缓存版本并支持重建。
- fork 按截断位置恢复模式和组合，保持附件复制；旧 Chat、旧 main、无 preset、未知版本分别建 fixture，旧文件字节不修改。
- 验证：切换/发送竞态、重复请求、落盘前后失败、重启、缓存删除、分页/list/snapshot 一致、fork 历史模式而非最新模式。

### T4：统一可见工具与实际执行门禁

- 修改 `packages/core/agent-loop/src/loop.ts`，每轮捕获模式策略；继续检查不可见调用，移除 effect 推断 Plan 权限的分支。
- 修改 `packages/tools/runtime/src/prepared-execution.ts`、`runtime.ts`、`scheduler.ts`、`core-guards.ts`，在可信 scope 中解析策略并在准入/进入 body 前校验；无可信绑定拒绝。
- 修改 `packages/subagent/src/tool-plugin.ts` 和 provider 调用链，传递父策略上限；后台任务、待审批和子任务纳入模式切换 busy 条件。系统停止/清理由 Host 生命周期入口处理，不借机给 Chat/Plan 开放 shell 工具。
- 模式失败采用结构化结果并保留审计信息；不进入审批或执行 body。full-access、Session Grant 不能绕过。
- 验证：直接 `executeBatch` 提交写工具、混合批次、缺 scope、跨 Agent 伪造绑定、延迟审批后执行、子 Agent 嵌套和注册新工具；拒绝项的 executor 调用次数必须为零。

### T5：上下文与现有 Chat 行为收口

- 修改 `packages/prompt/src/core-contributors.ts`、`plugin.ts`、`host-context.ts`、`packages/runtime/src/runtime/agent-factory-plugin.ts` 和 `packages/core/agent-loop/src/loop.ts`：在 resolveSource 前按模式决定是否读取工作区，prompt/Skills/compaction 消费同一策略。
- 保留历史消息与工具结果，所有模式的新用户消息以持久 runtime-context 表达实际模式；隐藏块不进入 transcript、标题或自然语言压缩摘要。
- 将 Chat 压缩阈值从 preset 判断改为模式判断，保留现有设置键、默认值和校验，不新增设置。
- 验证：Chat 工作区读取 spy 为零；同模式稳定 prompt 字节不变；切换历史可重放；文本附件限制及 Artifact ownership 不退化；Plan Todo 可写会话进度但不能写工作区。

### T6：Host API、Desktop 与 Headless 贯通

- 修改 `packages/desktop-app/src/service.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`projection-ipc.ts` 与相关 preload/Client bridge，增加 set-session-agent-mode 操作与 revision 冲突处理。
- 更新现有 create/run 输入与输出；旧 agentForm 只在兼容边界映射。Chat 不再伪装为 agent 参数执行。
- 修改 `packages/headless/src/runner.ts` 及 `apps/cli/src/args.ts` 的接入/测试，保持现有 CLI 默认行为与 `--permission-mode` 语义；本计划不新增 CLI 模式 flag。Headless API 有显式 mode 时使用同一持久化路径，缺省采用会话当前模式。
- 验证：Desktop/Headless 默认、旧调用、显式模式、CLI permission regression、缺工作区切入开发模式被拒绝，不能隐式使用 Host cwd。

### T7：Composer 模式交互与附件保护

- 修改 `apps/desktop/src/renderer/components/Composer.tsx`、`apps/desktop/src/renderer/App.tsx`、会话 DTO 消费与相关测试，把形态菜单收敛成三模式菜单。
- 删除切换空会话时新建/归档 Session 的路径；保持草稿、附件、会话 ID。Chat 开发控件隐藏依据当前 mode，而非旧 form。
- 活动执行期间禁用切换，停止后仍有后台任务则说明阻塞；没有 workspace 时引导选择后再切 Plan/Agent。
- 发送前按目标模式现有附件规则校验，不静默移除附件。切换失败回到服务端投影，不能显示假成功。
- 验证：组件 fixture 覆盖菜单、busy、冲突、重启、附件错误、开发控件恢复；复用现有 token，不引入新配色。

### T8：验证、文档同步与交付

- 执行第 5、6 节验证，按验收点记录通过/失败/未覆盖及证据；运行日志、截图和 Journal 摘要脱敏。
- 更新 `docs/design-docs/agent-runtime/agent-main-chat-form.md` 的当前规范入口，保留旧实现的追溯信息；同步 Runtime、权限、前端相关描述与 `docs/releases/feature-release-notes.md`，只声明已实现行为。
- 在 `docs/histories/2026-09/` 记录代码变更；按 `docs/learnings/WRITING_GUIDE.md` 判断插件作用域/模式门禁/持久化迁移是否满足学习文档条件。
- 完成后更新执行摘要，将本计划移至 completed 并登记剩余外部门禁；不得因未做真实 Provider 验收写成全部通过。

## 5. 自动化验证

文档阶段发现当前 checkout 缺少 node_modules；执行开始先用 `pnpm install --frozen-lockfile` 恢复锁定依赖，不升级 lockfile。实施前记录现有失败基线；不为消除无关失败扩大范围。先运行受影响包的 focused tests，再运行整体检查。

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm test
pnpm build
pnpm check:docs
pnpm check:frontend-theme
pnpm check:frontend-tokens
```

预期：集合、生命周期、模式恢复、直接调用拒绝和前端状态测试通过；构建不引入跨包私有源码依赖。测试 fixture 必须含旧 Chat 内部 agent mode、新模式事实、fork 截断和损坏/未知模式。每次源码改动后只重跑相关失败或受影响项，最终执行全仓门禁一次并记录基线差异。

## 6. Computer Use 验收点与操作路线

验收点及路线；本轮实机覆盖结果见执行摘要。

### 验收点

| 编号 | 界面、状态与行为 | 预期 |
|---|---|---|
| U1 | 新建会话与三模式菜单 | 默认 Agent；只有模式选择，无形态选择 |
| U2 | 空会话/有消息会话的切换 | Session ID 不变，不新增归档项；草稿/附件保留 |
| U3 | Chat 模式发起网络搜索与生图 | 两工具真实运行或明确配置错误；请求审计恰好两 schema |
| U4 | Chat 开发控件和上下文 | 无 Skills/Workspace/终端入口；新请求不新增工作区贡献 |
| U5 | Plan 探索、Todo 与禁止修改 | 允许项工作；写文件/Shell 不执行；权限为 full-access 仍不扩权 |
| U6 | 活动 Run、审批、后台任务、子任务 | 模式切换被阻止；停止并收束后可切换 |
| U7 | Chat 切开发模式、无工作区、附件不兼容 | 明确选择工作区/附件错误；不丢稿、不隐式选目录 |
| U8 | 重启、切会话、旧 Chat、fork | 模式恢复正确；旧 Chat 不变成 Agent；fork 使用截断位置模式 |
| U9 | 浅/深主题和窄窗口 | 菜单、禁用、错误、焦点和弹层可辨认，无裁切 |
| U10 | 历史和权限保持 | 切 Chat 保留历史并说明边界；权限值/Grant 不被切换重写 |

### 分组执行

1. **主会话路线**：从新建 Agent 开始，保存草稿和附件，切 Chat → Plan → Agent，覆盖 U1/U2/U4/U7/U10。记录 ID、附件与关键菜单/错误截图；请求上下文的证据来自审计，单独标为运行时检查。
2. **执行与阻塞路线**：同一隔离测试会话中完成 Chat 搜索/生图、Plan 探索/Todo、执行长任务/审批/子任务，再尝试切换和停止，覆盖 U3/U5/U6。用预先准备的确定性 fixture 验证伪造写调用，不能要求模型违规来代替 Runtime 负向测试；真实服务与 fixture 结果分开记录。
3. **恢复与视觉路线**：重启应用，打开旧 Chat 与 fork，切回主测试会话，浅/深主题及窄窗口检查菜单/禁用/错误状态，覆盖 U8/U9 并复查 U2/U10。保存恢复前后状态与代表截图，不在每个主题重复所有网络调用。

用 `pnpm dev:log` 启动，从日志的 `[dev-runtime]` 识别本 worktree 应用；浏览器 mock 只证明 renderer，Electron 才证明 IPC/持久化。U3/U5 中未配置外部服务的部分标记未覆盖；运行时审计与真实点击证据不能互相冒充。

## 7. 风险与回退

| 风险 | 处理 |
|---|---|
| 只改 whitelist，未实现插件行为生命周期 | T2 的未选成员、失败清理和多实例测试为必须门禁 |
| 共享 executor 被单个 Agent 释放 | 区分 Host 注册和 Agent 绑定，分别持有 disposer |
| 模式事件写成功但内存切换失败 | 停止接纳，重放 Journal 后恢复；UI 不抢先显示成功 |
| Chat 切换被误认为历史隐私隔离 | 保留历史、明确说明；新会话承担隔离对话需求 |
| 老二进制不理解新增事件/组合 | 使用隔离数据验收并备份；禁止删新事件实现降级 |
| 并行现有工作更改相关 DTO/服务 | 执行启动先检查 git diff 与接口漂移，保留无关修改；必要时修订计划后再改 |

代码回退不等于数据回退。尚未创建新格式数据时可撤回实现；已写新事件时保留原目录，使用对应备份恢复旧版本测试，或留在新 codec 版本只读访问。禁止在真实用户数据上做破坏式迁移试验。

## 8. 进度、授权与执行记录

- [x] 只读核对代码与已有设计，形成待审核文档。
- [x] 用户审核 D1–D5 并明确授权开始实施。
- [x] T1–T2 契约与插件实例生命周期。
- [x] T3–T5 持久化、门禁与上下文。
- [x] T6–T7 Host 与界面。
- [ ] T8 验证、同步文档与交付（自动化与部分实机完成，剩余见执行摘要）。

执行模式：交互模式。已获用户授权。执行记录位于 `docs/exec-runs/20260928-agent-forms-and-modes/`，持续记录步骤、失败及 U1–U10 结果。

决策记录：2026-09-28 用户确认唯一形态由插件组合构成，包含 Chat/Plan/Agent，Chat 仅现有网络与生图工具；其余实施建议以设计 D1–D5 为审核对象。
