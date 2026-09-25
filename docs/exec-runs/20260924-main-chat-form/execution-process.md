# Main Chat 形态 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260924-main-chat-form.md`
- **执行模式**：交互
- **开始时间**：2026-09-24 22:16 CST
- **结束时间**：2026-09-24 23:26 CST

## 执行时间线

### 步骤 1：建立执行基线

- **操作**：确认用户已经批准计划，检查工作区状态，并创建本轮执行记录。
- **影响文件**：`docs/exec-runs/20260924-main-chat-form/execution-process.md`、`docs/exec-runs/20260924-main-chat-form/execution-summary.md`。
- **决定**：按计划从 M1 开始逐里程碑实现和验证，不跨阶段混合修改。
- **验证**：执行前工作区仅包含本功能已经批准的设计文档与执行计划变更，没有发现无关脏改动。

## 遇到的问题

- 下游 package 首次读取到旧 `dist` 类型；先构建 Runtime 依赖闭包后，聚焦测试与 typecheck 恢复通过。
- Desktop 全套测试首次发现两个旧断言仍假设 `/chat` 和无 `agentForm` 的创建输入；按已批准的 Session 形态契约更新测试后，107 files / 759 tests 通过。
- 最终计划对照发现 workspace 行 `+` 仍直接创建 Agent；补成 Agent/Chat 菜单并增加 Sidebar 回归。
- `web` 已注册 definition 与底层门面，但 Node aggregate ports 初次漏转发 `web`；聚焦测试捕获后补齐。
- 两次运行 `pnpm dev:log` 均在窗口创建前失败：`electron@39.8.10` 缺少安装产物，抛出 `Electron failed to install correctly`。执行 `pnpm rebuild electron` 返回成功但未生成 `path.txt`，因此没有把实机 UI 记为已验收。

## 跳过或推迟的事项

- 真实 Electron 启动被本机 Electron 二进制缺失阻塞；未打开窗口，也未消耗真实搜索、生图或主模型 Provider 额度。
- 未验证退出重启、真实本地文件选择、多模态模型、浅/深/跟随系统主题和小窗口截图。

### 步骤 2：M1 Prompt cache 与动态尾部

- **操作**：Contributor 增加 `model-fact`，snapshot schema 升级为 v2；system prompt 只渲染 `modelFacts`。Agent mode 改为持久化 `runtime-context` 用户消息尾部。
- **决定**：Chat 形态固定，不写单轮 mode 块；内部块不进入 renderer、标题、transcript 或 Compaction 自然语言摘要。
- **验证**：Prompt、AgentLoop、Compaction、English Learning、Client 聚焦测试与类型检查通过。

### 步骤 3：M2 固定 Chat preset 与工具边界

- **操作**：增加 `actspace.main` / `actspace.chat`、`MainAgentForm`、Session Header/Projection/IPC 链路；新增 `web` 门面并让 Chat 精确暴露 `{web, generate_image}`。
- **决定**：旧 Session 缺 preset 解释为 Agent；未知 preset fail closed；Agent 排除 `web`，保留 `web_search` / `web_fetch`。
- **验证**：core-agent、tools、runtime、desktop-app 与 Desktop 创建/Composer/Sidebar 测试通过。

### 步骤 4：M3 Chat 附件

- **操作**：实现首版格式白名单、严格 UTF-8/BOM/NUL 校验、1 MiB/256,000 字符限制、批次预校验、Artifact owner 回滚与持久化正文。
- **决定**：PDF/DOC/DOCX 明确拒绝；文本正文直接随 user message 进入 Journal，模型不依赖 `read_file`。
- **验证**：允许格式、拒绝格式、目录、非法 UTF-8、NUL、单文件/合计超限和 Artifact 删除测试通过。

### 步骤 5：M4 Chat 压缩阈值

- **操作**：Settings v4 增加 `chatCompactionTriggerRatio`；Desktop Host 提供 live resolver；Compaction 为 Chat 创建 resolver-backed policy view。
- **决定**：只覆盖 trigger ratio，保留现有算法、region、手动 compact、Agent/Subagent/CLI 行为。
- **验证**：50%/95% live resolver 回归、Settings/renderer 类型检查和测试通过。

### 步骤 6：M5 全量验证与文档

- **操作**：同步长期设计、history、learning 和 execution summary；运行 package、全仓与文档门禁。
- **验证**：最终复跑 Runtime 依赖闭包 build、全仓 typecheck、production build、Desktop 759 tests、package boundaries、docs/current-docs、secrets、`git diff --check`，全部通过。
