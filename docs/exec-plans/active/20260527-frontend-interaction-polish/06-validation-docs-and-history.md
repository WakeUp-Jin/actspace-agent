# 06 验证、文档与收尾

## 目标

在剩余 `02` 附件链路和 `04` Workspaces / 会话状态完成后，统一完成工程验证、浏览器 mock 验证、Electron 真实验证、文档同步、history 记录和计划归档准备，确保前端交互与样式补齐任务可以被明确验收。

当前状态：截至 2026-06-01，`01` / `03` / `05` 已计为完成，后续只参与回归验收；`02` / `04` 仍是本计划簇的剩余实现面。

## 范围

包含：

- 汇总执行 `01` 到 `05` 的验证结果，其中 `01` / `03` / `05` 以既有实现记录和回归验收为主，`02` / `04` 需要补齐完整实现和真实验证。
- 跑仓库级或相关包级类型检查、构建、测试。
- 按 `docs/FRONTEND_VERIFICATION.md` 做浏览器 mock 与 Electron 真实验证。
- 更新被行为变化影响的设计文档。
- 更新本计划簇进度。
- 写入 `docs/histories/YYYY-MM/`。
- 判断是否需要学习文档。

不包含：

- 不在收尾阶段临时扩大功能范围。
- 不把未完成项静默标记完成。
- 不重新拆解 `01` / `03` / `05` 已收口的产品边界，除非回归验证发现实际 bug。
- 不归档其他无关 active plan。

## 背景

相关文档：

- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/PLANS_GUIDE.md`
- `docs/learnings/WRITING_GUIDE.md`
- `docs/TODOLIST.md`
- `docs/exec-plans/README.md`

相关代码路径：

- `packages/desktop/src/renderer/**`
- `packages/desktop/src/main/**`
- `packages/desktop/src/preload/**`
- `packages/shared/src/**`
- `packages/agent-core/src/**`
- `docs/design-docs/front-*.md`
- `docs/histories/**`

## 实施任务

### Step 1: 工程验证

根据实际改动范围运行：

- `pnpm typecheck`
- `pnpm build`
- 相关测试命令，例如：
  - `pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/shared test`

最低要求：

- `02` 完成后至少覆盖 shared / desktop / agent-core 中附件契约、持久化和 renderer 交互相关测试。
- `04` 完成后至少覆盖 desktop renderer 的 Sidebar / Workspaces / session status 相关测试。

验收：

- 记录实际运行命令和结果。
- 如果某条命令失败，必须记录原因、修复或未修复状态。

### Step 2: 浏览器 mock 验证

验证项目：

- Composer 默认态、有附件态、窄窗口态。
- 模型菜单 hover / focus edit。
- 附件 mock 添加、删除、发送 payload。
- Context popup 打开、关闭、usage / buckets 展示、完整视图入口和浮层互斥。
- Sidebar Workspaces fallback 添加、状态按钮详情。
- Settings 进入/返回、Typography 控件和预览。

验收：

- 截图或记录浏览器 mock 验证结果。
- 明确浏览器 mock 不能证明 preload / IPC / 本地文件能力。

### Step 3: Electron 真实验证

必须验证：

- Electron 窗口能启动并渲染。
- 附件按钮能打开系统文件选择器。
- 取消附件选择无副作用。
- 添加附件后发送，session 恢复仍能看到附件元信息。
- Workspaces 添加按钮能打开目录选择器。
- 取消目录选择无副作用。
- 选择目录后出现新 workspace / session。

推荐验证：

- Context popup 在真实 session 中展示 context usage / buckets，并能打开右侧完整 Context 视图。
- Settings 刷新后 localStorage 设置恢复。

验收：

- 记录实际 Electron 验证方式。
- 若当前环境不能直接观察 Electron，说明限制并请求开发者截图或日志。

### Step 4: 文档同步

按实际行为更新：

- `docs/design-docs/front-聊天输入框规范.md`
- `docs/design-docs/front-左侧会话栏规范.md`
- `docs/design-docs/front-设置页规范.md`
- `docs/FRONTEND_VERIFICATION.md`（仅当验证方式发生变化）
- `docs/TODOLIST.md`
- `docs/exec-plans/README.md`
- 本目录 `README.md` 和 5 个子计划进度。

验收：

- 文档不再引用过期的单文件 plan 路径。
- active 计划入口清晰。
- `README.md` 明确 `01` / `03` / `05` 已完成，`02` / `04` 是剩余实现面。

### Step 5: History 与学习沉淀

- 按 `docs/HISTORY_GUIDE.md` 写 history。
- 检查本轮是否至少命中两条学习沉淀条件：
  - 新概念
  - 可迁移
  - 有深度
  - 有陷阱
  - 有模式
- 若命中，读 `docs/learnings/WRITING_GUIDE.md` 并写 learning 文档。
- 未命中则在 history 里说明不单独写 learning。

验收：

- history 文件记录用户诉求、主要改动、设计动机和受影响文件。

### Step 6: 归档准备

- 所有子计划完成后，将本目录从 `active/` 移到 `completed/` 的具体时机需由开发者确认，或在最终验收后执行。
- 如果仍有 Electron 手动验收缺口，可保持 active，并在 README 里标注“代码完成，需手动验证”。

## 风险

- 风险：实现子计划跨多轮完成，验证信息分散。
  - 缓解：每个子计划结束时先记录局部验证，本计划只做汇总和缺口闭环。
- 风险：Electron 真实验证需要用户本机交互。
  - 缓解：优先用 Computer Use 观察窗口；不可用时明确请求截图和 `logs/latest-dev.log` 摘要。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- 相关 `pnpm --filter ... test`
- 浏览器 mock 截图或交互记录。
- Electron 真实窗口验证。

## 进度记录

- [ ] 完成工程验证。
- [ ] 完成浏览器 mock 验证。
- [ ] 完成 Electron 真实验证。
- [ ] 完成设计文档和导航同步。
- [ ] 写入 history。
- [ ] 判断并处理 learning 文档。
- [ ] 更新计划簇最终状态。

## 决策记录

- 2026-05-28：把整体验证和文档收尾单独列为第 6 个子计划，避免前 5 个实现计划在“跑完局部测试”后漏掉 Electron 真实验证和文档生命周期收口。
- 2026-06-01：将 `06` 调整为剩余 `02` / `04` 完成后的最终验收计划；`01` / `03` / `05` 只做回归，不再作为实现阻塞项。
