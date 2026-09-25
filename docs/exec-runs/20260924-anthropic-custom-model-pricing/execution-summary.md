# Anthropic 自定义连接、手动模型与价格 - 执行摘要

状态：实现完成，保留真实 Electron 和真实中转站人工门禁。

## 实现结果

- Anthropic 自定义连接采用 Claude Code 常见的 Messages API 语义：用户填写服务根地址，系统请求 `<baseUrl>/v1/messages`，主进程拒绝末尾 `/v1`。
- 连接测试改为协议感知的最小真实请求；Anthropic 使用 `x-api-key` 与固定版本头，不携带工具或缓存标记。
- 新增连接级 Prompt Cache `short/off`。短缓存通过 direct pi-ai 的原生参数和代理 wire 的 payload 标记保持一致；关闭时两条路径都不发送缓存字段。
- 取消自动模型拉取与自动价格匹配。每条连接手动维护模型 ID、显示名称、能力、上下文限制、默认模型和四类每百万 Token 单价。
- 模型 ID 使用 connection-scoped ModelKey；相同上游 ID 在不同连接中互不覆盖。价格继续使用既有请求级 snapshot，历史 Usage 不随后续编辑重算。
- 首个模型自动启用并成为连接默认模型；删除当前默认模型需要先选替代，删除最后模型时连接保留并把默认模型写为 `null`。

## 验证结果

- `pnpm --filter @actspace/shared test`：14 个文件、79 项通过。
- `pnpm --filter @actspace/llm-service test`：5 个文件、23 项通过。
- `pnpm --filter @actspace/llm-pi-ai test`：8 个文件、47 项通过。
- Desktop 聚焦：3 个文件、62 项通过；此前含 settings migration 的组合为 4 个文件、70 项通过。
- `pnpm --filter @actspace/runtime... build`、Desktop typecheck/build、全仓 typecheck/build 通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check` 通过。
- 完整 `pnpm test`：Desktop 105 个文件通过、1 个文件中的 1 项失败。首个错误为 `ShortcutSettings` 读取未初始化的 `window.actspace`；失败文件未修改，目标测试单独运行 24/24 通过，因此记录为既有测试隔离问题，不在本计划扩大修复。

## 界面验收

- renderer fixture 已检查连接详情、实际 `/v1/messages`、短缓存状态、模型列表和四类价格字段。
- 浅色与深色 477px 检查通过；375×812 深色模型表单截图无横向溢出。
- Electron 开发版使用隔离数据目录成功启动；macOS 锁屏阻止真实窗口点击，因此 Electron 创建、重启恢复和 Composer 即时刷新仍是人工门禁。

## 未执行的外部门禁

- 未使用真实中转站 Key，未产生 Provider 费用。
- 未验证真实文本流、工具调用、adaptive effort、真实代理、缓存命中和中转站返回的 cache usage。
- 这些项目需要用户解锁桌面，并在明确允许少量费用后按计划第 12 节执行。

## 交付边界

- 改动位于独立 worktree 和 `codex/anthropic-custom-model-pricing` 分支。
- 未 push、未发布安装包；实施阶段未修改主工作区的并行改动。
