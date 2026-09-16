# 工具进度、文件产物、模型目录与图片链路修复 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260913-tool-artifact-provider-image-ux.md`
- **执行过程**：`docs/exec-runs/20260913-tool-artifact-provider-image-ux/execution-process.md`
- **执行模式**：交互
- **执行结果**：代码与自动化验证完成；真实 Provider/Electron/截图门禁待人工验收

## 核心变更清单

- Write/Edit 以累计 `additions/deletions` 作为低噪声进度尾部，默认开启并可在设置关闭；完成态保留最终统计。
- Write/Edit 完成产物携带 workspace 相对路径，Artifacts 和回复中的安全本地链接统一打开右侧文件视图。
- 聊天 Markdown 使用 fenced-code renderer、语言标签、复制动作、受控滚动容器和主题 token；外部链接与越界路径不自动打开。
- Kimi 使用 `${baseUrl}/models` 目录发现、能力归一化和缓存，保留内置 fallback。
- 图片先进入 Session-owned Artifact；UserMessage 按需 hydration，Journal 不写入图片字节或 data URL。
- DeepSeek 直连 OpenAI 兼容路线使用 Files API `file_id`；上传缓存仅存内存，其他供应商继续使用校验后的 base64 wire payload。

## 人工验证指引

- 自动化：`pnpm run typecheck`、`git diff --check`。
- LLM：`@actspace/llm-pi-ai` typecheck；DeepSeek Files/Vision/tool-images/legacy 回归共 39 tests。
- Desktop：工具预览、流式、Kimi 目录、provider network、Markdown、图片 hydration、右侧 artifacts 共 89 tests。
- 手工待办：启动 Electron，验证 Write/Edit 长任务行数变化；会话 `2ef729eb-9876-4f08-b32b-2fe70b7578cc` 生成文件右侧打开；浅/深主题代码块；真实 Kimi refresh；真实 DeepSeek upload/file_id；图片发送、切会话、重启和右侧预览。

## Agent 已完成的验证

- 上述 typecheck、`git diff --check`、LLM 和 Desktop focused tests 均通过。

## 已知风险和遗留事项

- 未执行真实供应商和 Electron 宿主验收；DeepSeek Files API 对不支持该模型的上游错误会被保留为 provider failure，不会回退成未经预期的原始字节发送。
- 远端 file id 不写 Journal；本地 artifact 仍是重试和过期重传的唯一事实源。
- 仓库 `pnpm test` 在既有 `check-package-boundaries` 阶段停止：3 个既有 Desktop 测试深层导入 `apps/`/`packages/` 源码；本轮未改动这些无关测试，专项测试与全量 typecheck 均通过。
