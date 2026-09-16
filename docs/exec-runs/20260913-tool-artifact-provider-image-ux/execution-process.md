# 工具进度、文件产物、模型目录与图片链路修复 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260913-tool-artifact-provider-image-ux.md`
- **执行模式**：交互
- **开始时间**：2026-09-13 现在
- **结束时间**：2026-09-13 17:24（自动化代码阶段完成；Electron/真实 Provider 手工门禁保留）

## 执行时间线

### 步骤 1：计划确认与工作区审计

- **操作**：确认已获用户批准，读取仓库协作、架构、前端验证、主题、Agent Runtime 与 UI 规范；审计 dirty worktree 和相关既有设计文档。
- **影响文件**：无业务代码变更；新增本执行记录。
- **决定**：沿用现有 UI 语言和 CSS token；保持 Journal 只保存稳定 artifact 引用；不恢复完整正文流式输出。
- **验证**：完成文档读取，确认工作区存在与目标文件重叠的未提交修改，后续按文件逐段增量修改。

### 步骤 2：工具进度与文件产物

- **操作**：为 Write/Edit progress 增加累计 `additions/deletions`，Main stream adapter 按 tool-call 隔离累计值，完成事件用最终 diff 校正；Renderer 默认在工具行尾显示 `+N -M`，设置页可关闭。完成态结果携带工作区相对路径，由 Turn Artifacts 统一打开右侧文件 Tab。
- **验证**：`file-diff-block.test.tsx`、`runtime-v2-tool-preview.test.ts`、`runtime-v2-tool-stream.test.ts` 与 `turn-output-artifacts.test.tsx` 通过。

### 步骤 3：回复渲染与右侧打开

- **操作**：聊天 Markdown 切换到 `react-markdown + remark-gfm + rehype-highlight`；fenced code 增加语言标签、复制动作、受控滚动容器和主题 token；回复中的安全工作区相对链接调用右侧文件读取，不打开新浏览器页。
- **验证**：新增 `markdown-prose.test.tsx` 覆盖代码复制和本地文件链接；根 typecheck 通过。

### 步骤 4：Kimi 目录与图片 Artifact 预览

- **操作**：Kimi 加入 `/models` discovery、缓存与设置入口，解析供应商返回的模型能力并保留内置模型作为首次刷新前的离线 fallback。Composer 图片发送路径保持“本地文件 → Session-owned Artifact → provider wire payload”；projection 保留 Artifact ID，UserMessage 在会话重载时按需读取受控 data URL，右侧 image Tab 和上下文菜单复用同一校验边界。
- **验证**：新增 Kimi 网络目录、目录归一化/静态 fallback、图片 hydration 测试；相关 23 项测试通过。

### 步骤 5：DeepSeek Files API provider-wire

- **操作**：增加进程内的 `DeepSeekFileUploader`，以 `purpose=user_data` 上传 Session-owned Artifact，按凭据、会话、artifact 和字节长度去重并在过期后自动重新上传；直连 DeepSeek OpenAI 兼容路线将图片块映射为 `file` + `file_id`，代理请求复用代理 fetch，其他供应商不改变原有 base64 路径。
- **验证**：`@actspace/llm-pi-ai` typecheck 通过；DeepSeek Files API、直连请求体、重试和现有 vision/tool-image 回归共 39 项测试通过。

## 遇到的问题

暂无阻塞。

## 跳过或推迟的事项

- 未执行真实 DeepSeek credentialed smoke、真实 Kimi 刷新和 Electron/截图验收；这些需要外部凭据或宿主环境，自动化检查不能替代。
