# Anthropic 自定义连接、手动模型与价格 - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260924-anthropic-custom-model-pricing.md`
- **执行模式**：交互
- **开始时间**：2026-09-24 CST
- **结束时间**：2026-09-25 00:20 CST
- **隔离工作区**：`/private/tmp/actspace-anthropic-custom-model-pricing`
- **分支**：`codex/anthropic-custom-model-pricing`

## 执行时间线

### 步骤 1：恢复审计与隔离

- **操作**：复核已批准计划、主工作区状态、共享 IPC 重叠和另一项主 Chat 计划的执行记录。
- **结果**：主 Chat 计划仍在实施且未形成可合并切片；按本计划约束创建独立 worktree，基线为 `9322aed`。
- **决定**：本计划不修改主工作区，不提交、不推送，不消费真实 Provider 额度。

### 步骤 2：建立实施基线

- **操作**：读取仓库协作、架构、编码、前端主题、模型设置、LLM Core Pi 和 Prompt Cache 规范；读取 `llm-agent-dev` 与 `ui` Skill。
- **决定**：延续现有设置中心的平面详情路由和 Tailwind 语义 token；Provider 差异停留在 Adapter/transport 边界；价格复用现有 `ModelPricing` 与请求级快照。
- **结果**：确定复用现有 `anthropic-messages`、ModelDefinition pricing 和请求级价格快照，不增加自动模型发现或自动价格匹配。

### 步骤 3：Anthropic 协议与缓存加固

- **操作**：增加 Anthropic 根地址校验、`/v1/messages` 显式最小测试、连接级 `short/off` 缓存策略，并让 direct pi-ai 与 request-scoped proxy 使用相同策略。
- **结果**：Anthropic 使用 `x-api-key` 和 `anthropic-version`；测试请求只发送 1 Token，不带工具和缓存字段；短缓存标记 system、最后一个工具定义和最近 user 内容块。

### 步骤 4：手动模型与价格管理

- **操作**：增加 connection-scoped 模型 builder、主进程运行时校验、添加/编辑/默认切换/删除保护 IPC，以及首个模型和后续模型表单。
- **结果**：API Model ID 与显示名称分离；四类价格均为手动输入；同 ID 可跨连接隔离；删除最后模型后连接保留且默认模型显式写为 `null`。

### 步骤 5：界面与文档

- **操作**：连接详情显示协议、实际请求 URL、Prompt Cache、默认模型与模型列表；新增 renderer fixture；同步模型设置、多 Provider、Usage 与 LLM Core Pi 文档。
- **结果**：浅色和深色 477px 检查通过，375×812 深色模型表单实拍无横向溢出；首个模型不显示可关闭开关，Anthropic `/v1` 输入显示字段错误和修正动作。

### 步骤 6：工程与审查门禁

- **通过**：Shared 79、LLM Service 23、pi-ai 47、Desktop 聚焦 62 项；全仓 typecheck、build、主题检查、文档检查和 `git diff --check`。
- **完整测试**：`pnpm test` 运行到 Desktop 时为 105 个文件通过、1 个文件中的 1 项失败；失败是未改动的 `ShortcutSettings` 在并发测试环境读取未初始化 bridge。该测试单独运行 24/24 通过，归类为既有测试隔离问题。
- **审查**：补齐畸形 IPC 输入、重复模型、无效价格和删除最后模型的回归；未发现本计划范围内的 blocker。

## 遇到的问题

- 主工作区存在与本计划重叠的未提交 IPC、Settings 和 renderer 改动。已通过独立 worktree 隔离，不在原工作区尝试合并或覆盖。
- 边界测试发现 v4 解析器会丢弃显式 `defaultModel: null`；已修复为保留 `null` 并通过回归。
- 完整 Desktop 测试中出现一个并发隔离失败，单测独跑通过且失败文件不在本次 diff 中，未扩大范围修复。

## 跳过或推迟的事项

- 真实中转站请求会消耗额度，本轮只实现显式测试入口和自动化 mock 验证；真实 Key、余额和缓存命中留给人工门禁。
- Electron 开发版已成功启动并使用隔离数据目录，但 macOS 锁屏使 Computer Use 无法进入窗口；真实点击、重启恢复和 Composer 刷新留待解锁后验收。
