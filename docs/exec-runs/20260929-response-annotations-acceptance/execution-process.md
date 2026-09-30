# 回复批注增量验收过程

- 基线：main@9b70765；增量：6263be7..9b70765。
- 用户已批准 A01–A15、G1–G5 验收计划；仅验收，不修改产品代码。
- 环境：真实 Electron，ACTSPACE_DATA_DIR=/tmp/actspace-main-acceptance-20260929/data；测试 workspace；pnpm dev:log。
- 保留原有五份无关文档改动。临时凭据不输出、不进入报告，结束时清理。
- G1–G5：选区与草稿、发送与历史、会话与模式、异常与契约、视觉复查。

## 启动与工程补验

- 当前 main 无漂移；依赖和 main/preload 本轮构建成功，窗口正常加载。
- 桌面定向测试 9 文件、123 条通过（选区、托盘、编号、App 恢复/隔离、IPC、文件引用校验）。
- Computer Use 浏览器连接不可用（unsupported Codex auth method: apikey）；使用原生 macOS Electron 控制，不影响真实桌面验收。
- 正在 G1 新建真实 Agent 会话，生成多格式回复样本。

## G1–G3 已执行与环境干扰

- 真实会话：4a9fa08b-8931-49ec-9f50-700e29d63fdf，模型 deepseek-flash。
- 首段跨粗体/链接/行内代码/中文/emoji 拖选准确进入托盘；列表跨两项保留换行。
- 评论 Shift+Enter 换行、Enter 保存、Escape 取消正常；超 2000 字提示并禁用保存。
- 展开/收起、同选区去重、单条移除通过。A/B 切换草稿隔离并保留。
- 仅批注发送成功；模型按评论回答颜色和 emoji。用户摘要定位、高亮、编号卡片、Tab 到复制按钮通过。
- 复制到草稿自动进入评论编辑；改评论并加正文发送成功，返回 ANNOTATION_SECOND_OK。
- Plan 与 Chat 各添加批注发送，返回 PLAN_ANNOTATION_OK 与 CHAT_ANNOTATION_OK。
- 工程补验：desktop 定向 123 + shared 137 + core-agent-loop 24 + compaction 7，共 291 条通过。
- 尚未完成：附件组合、完整边界、重启、视觉矩阵、实际异常恢复。

### 基线污染与纠正

验收中同一工作区有其他任务修改 Composer/App/ConversationView/WorkbenchLayout 等。日志多次出现 HMR invalidate 和 page reload（含 22:08–22:17），造成设置退出、浮层关闭、索引失效。此前观察到 Escape 后焦点回页面，只记疑点，不能确认为产品问题。上述受干扰阶段的 UI 结果不能严格归属于固定提交。保留原有全部外部改动；转固定 9b70765 隔离 worktree 继续并复核核心结果。

## 固定基线复核与补验

- 在 managed worktree response-annotation-acceptance 固定 9b70765 构建并启动真实 Electron，沿用隔离测试数据。
- 重启后历史引用、编号、摘要恢复；Chat 与 Plan 分别返回 STABLE_CHAT_OK、STABLE_PLAN_OK。request/header 分别记录 chat、plan。
- 代码块选区不出现批注按钮；引用段落和表格跨单元格可添加，表格文本保留换行；两条引用清空后发送按钮禁用。
- 测试 PNG + 正文 + 引用发送成功，返回 ATTACHMENT_COMBO_OK；历史同时保留三类内容。
- 深浅主题下定位、高亮、卡片、摘要可读。窄窗拖动未成功，不能声称验证。
- 确认缺陷 B01：点击可见编号，Tab 进入复制按钮，Escape 返回编号但卡片仍显示。深浅主题均复现；截图和 AX 证据在当前 Computer Use 会话。
- 类型检查、frontend tokens、theme contracts 通过。
- 浏览器 connector 认证不可用；原生 CU 多数观察耗时约 60 秒，偶有屏外 AX 点击偏差和文件对话框剪贴板超时。通过定位后点可见编号、setValue 输入文件路径绕过后两者。
- 本轮为阶段结果，未达到完整验收；未覆盖边界在摘要逐项列出。未修改产品代码。
- 结束时恢复隔离数据主题为 system，停止本轮 dev orchestrator，删除临时 secrets.json；保留测试会话及 worktree 供续验。
