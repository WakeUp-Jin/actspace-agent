# Main Chat 形态 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260924-main-chat-form.md`
- **执行过程**：`docs/exec-runs/20260924-main-chat-form/execution-process.md`
- **执行模式**：交互
- **执行结果**：代码、自动化与文档完成；外部人工门禁待验收

## 核心变更清单

- 固定 Session 形态：`actspace.main` / `actspace.chat`，Header 持久化、Projection 恢复、fork 继承。
- Chat Prompt 与工具隔离：无 workspace/Skills，工具严格为 `web`、`generate_image`。
- Prompt cache 修复：`modelFacts` 与审计 `facts` 分层，动态 mode 持久化到消息末尾。
- 首版附件：图片、TXT、Markdown、JSON、CSV；严格边界、持久化正文和 Artifact 回滚。
- Chat 压缩设置：80% 默认，50%～95%，保存后无需重启影响下一次自动判断。
- Desktop：顶部与 workspace 新建入口均支持 Agent/Chat；Chat Composer 使用固定控制面。

## 人工验证指引

1. 使用 `pnpm dev:log` 启动真实 Electron。
2. 分别从顶部和某个 workspace 的 `+` 创建 Agent 与 Chat；确认切换会话后 Composer 控制不串，`Command+N` 仍默认 Agent。
3. 退出并重启应用，确认 Chat 仍恢复为 Chat；fork Chat 后子会话仍为 Chat。
4. Chat 依次上传 PNG/JPEG/WEBP/GIF、TXT、MD、Markdown、JSON、CSV 并提问；确认消息显示附件而非全文。
5. 尝试 PDF、DOC、DOCX、非法 UTF-8、含 NUL 和超限文本；确认出现可读错误且消息未发送。
6. 配置可用 provider 后验证 `web.search`、`web.open`、`generate_image`；确认 localhost/私网 URL 被拒绝，未配置服务时错误不可重试且可读。
7. 在设置中把 Chat 自动压缩阈值从 80% 改为 50%/95%，不重启 Runtime，使用长会话或诊断 fixture 确认下一次判断使用新值。
8. 在浅色、深色、跟随系统与 ≤600px 窗口检查新建菜单、Chat pill、附件 chip 和设置输入无溢出。

## Agent 已完成的验证

- `pnpm --filter @actspace/runtime... build`
- Prompt、core-agent、core-agent-loop、session-journal、session-persistence、tools-core-tools、compaction、runtime、desktop-app、client 测试通过。
- `pnpm --filter @actspace/desktop test`：107 files / 759 tests 通过。
- `pnpm typecheck`、`pnpm build` 通过。
- `pnpm check:packages`、`pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:secrets`、`git diff --check` 通过。

## 已知风险和遗留事项

- 真实 Electron 验收已尝试两次，但本机 `electron@39.8.10` 缺少安装产物，启动在窗口创建前报 `Electron failed to install correctly`；`pnpm rebuild electron` 未补齐 `path.txt`。因此真实文件选择、多模态能力、重启恢复与主题截图仍未验收，自动化不能替代这些门禁。
- production renderer build 仍报告既有大 chunk warning，不是本功能引入的构建失败。
- 用户同时存在另一份尚未实施的 Anthropic active plan；本任务未实施、归档或纳入本次提交。

## 后续建议

- 先完成上述 8 项人工验收，再决定是否发布 2026-09-25 首版。
- Provider cache 只有 system prompt 字节稳定的自动证据；在拿到真实 cache read/write usage 前，不宣称缓存命中率已经提升。

## 2026-09-25 真实 Electron 补验与创建修复

- 使用 `pnpm dev:log` 启动并由 Computer Use 操作真实 Electron，不使用 renderer mock。
- 修复前：顶部和工作区两个 Chat 创建入口均触发 `compaction.withTriggerRatio is not a function`。Cordis 注册的是 `CompactionService`，而新增方法只在内部 `CompactionPlugin` 上；补齐 Service 转发，保持实例隔离与动态阈值 resolver。
- 自动回归：新增真实 Cordis 注册/获取服务测试，修复前 1 failed / 5 passed，修复后 6 passed；覆盖数值阈值、动态阈值、不修改基础 Agent policy 和 dispose。Runtime 13 tests 与两个包的 typecheck 通过。
- 重建依赖并退出/重新启动 Electron 后，顶部与工作区入口均成功创建 Chat。真实模型完成算术和测试词两轮对话；切换会话后历史和 Chat 标识保持。
- Journal 验证：测试会话 preset 为 `actspace.chat`，两轮 `turn/end` 均为 `completed`，两个 request snapshot 工具集合均严格为 `web`、`generate_image`；本次对话未调用工具。
- 本轮没有更改权限实现。前序同轮 Computer Use 已覆盖 full-access 外部普通文件读取、default 审批、exact Session Grant 复用、撤销后重新审批、deny、once；未覆盖完整权限安全矩阵。
- 新发现但未纳入此次局部修复：Chat 仍显示顶部权限/授权入口、空态 workspace 控件及有变更时的 Review 控件。这是独立的 UI 边界问题，不影响此次创建崩溃修复，但不应标记 Chat UI 已完整验收。
- 剩余门禁：附件/多模态、真实搜索与生图、fork、完成对话后的进程重启恢复、三态主题与窄窗口、真实长上下文压缩。此前 Electron 安装缺失是历史阻塞，本次启动已成功；本轮结果不代表这些剩余项目通过。

## 2026-09-25 第二轮 Computer Use 验收

本轮继续操作真实 Electron，未修改生产代码或测试代码；保留上一轮未提交修改。

| 项目 | 结果与证据 | 边界 |
| --- | --- | --- |
| 进程重启恢复 | 退出并通过 `pnpm dev:log` 重启；手动重新打开已有 Chat，历史和 Chat 标识保留，继续提问能回复原测试词 | 启动后默认选中的是另一个空 Chat，不宣称恢复最后选中会话 |
| 会话级 fork | 子 Journal 已生成，preset 为 `actspace.chat`，lineage 为 fork | **失败**：子会话发送消息触发 writer lease 冲突；消息级“分叉会话”入口还显示禁用 |
| 公开网页读取 | 实际 `web action=open` 读取 example.com，Journal 为 completed，UI 展示摘要 | 未覆盖重定向、下载、大页面 |
| 搜索 | 实际 `web action=search` 返回结果，Journal 为 completed，UI 展示候选链接 | 搜索返回量与中文裸链接解析另有观察，未单独复现定位 |
| localhost 拒绝 | 实际访问 loopback 地址被拒绝，无页面内容返回，无重试；UI 显示安全错误 | Journal 将 `WEB_FETCH_FAILED` 标记为 `retryable: true`，安全拒绝的分类需检查 |
| 图片生成 | 实际调用一次 `generate_image`，UI 显示错误并回到空闲 | **未通过产图验收**：`IMAGE_GENERATION_INVALID_RESPONSE`，服务返回 HTML 而非 JSON；不可重试，无图片产物；未判定是配置、路由还是服务端原因 |
| 压缩设置 | 50% 保存并离开/返回后保留；95% 保存；96% 出现范围错误；最终恢复 80% 并重新打开确认 | 仅 UI 设置持久化与范围校验，不证明真实长上下文压缩触发或 policy 热更新 |
| 主题 | 深色设置页截图、跟随系统设置页截图；最终恢复原浅色 | 未完成 Chat/附件/审批卡三态矩阵、系统外观动态切换、窄窗口验收 |
| Context popup | 显示系统提示词、工具、规则、Skills、摘要和会话内容；规则/Skills 为 0，折叠面板未显示内部运行 ID | 未逐项展开完整上下文 |
| 附件入口 | Chat 添加菜单仅显示“图片与文件”，没有 Skills 选项 | 尚未上传；四份无敏感合成 TXT/MD/JSON/CSV 已在临时目录准备，待确认上传后执行 |

### 分叉失败的局部诊断

日志调用链：`SessionWriterLease.acquire → SessionStore.open → RuntimeSessionController.resume → DesktopAppService.runTurn`，报当前运行实例已经持有子会话。源码中 `forkMainSession` 直接调用 `sessions.store.fork()` 再 attach，而 controller 的 `resume` 仅从自己的 `#open` 复用，否则重新 open。与“fork handle 未纳入 controller 持有集合、后续发送重复获取 lease”的假设一致；本轮没有补测试或改实现，不标为已修复。

### 当前仍需处理

1. 分叉后发送被 lease 冲突阻塞。
2. 图片生成的真实 provider 返回 HTML；需独立排查连接配置/协议路由，不能用其他生图工具代替本产品验收。
3. Chat 仍暴露权限、workspace、Review 等 Agent 控件。
4. 私网拒绝的 retryable 分类。
5. 附件正负向、多模态、完整主题与窄窗口、真实长上下文压缩仍未完成。

当前应用保持运行，阈值与主题已恢复为验收前的 80% / 浅色。没有清理历史会话、删除失败 fork 或更改 provider 凭据。

## 2026-09-25 图片服务更新后的复测

- 用户更新图片连接后，设置 UI 显示新的服务主机与已保存凭据；未读取或回显密钥，未修改用户连接配置。
- 不重启时再次调用一张图片，仍返回 HTML 错误。源码确认 Desktop core tool ports 在 boot 时快照读取 `getToolEnvironment()`，保存图片配置的 IPC 不刷新该快照，图片工具持有旧 credential 对象。
- 正常退出并重新运行 `pnpm dev:log` 后，实际调用一张图片约 50 秒结束，Journal 为 `IMAGE_GENERATION_INVALID_RESPONSE / fetch failed`，无 Artifact；真实 UI 也显示本次失败。
- 与旧 HTML 错误不同：按 `generateImage` 的错误分支，此状态/消息来自 payload materialization 循环；上游响应已解析并产生可用 payload，图片下载或后续 Artifact 保存失败。精确网络子原因未被现有错误摘要保留，不能宣称新服务整体不可用或已经稳定。
- 无凭据 POST 连通性探测返回 JSON 401，证明该时刻 API 主机可达；此探测不调用付费生成，不证明返回图片的域名可达。
- 本轮未修改生产代码，未重复付费生成来代替定位。建议独立修复按调用读取图片配置，以及图片下载/保存阶段的脱敏错误分类与确定性回归，再进行一次真实 Chat 生图验收。

## 2026-09-25 图片配置与错误分阶段修复完成

- 用户批准局部修复后，Desktop 图片调用改为按次读取当前配置；未修改用户 provider、密钥或其他工具配置。
- 请求、下载、解码、保存错误分别报告；安全诊断只保留已知系统码，下载/保存失败不触发重新付费生成。补充下载 fetch/body 超时，保留原地址安全限制。
- Red：核心新增 6 tests 中 4 failed / 2 passed；Desktop 同实例配置新增/替换/移除测试失败。Green：核心工具全套 25 passed，Desktop 全套 108 files / 769 passed，Desktop typecheck、核心 build 通过。
- `pnpm dev:log` 重建并重启加载代码后，Computer Use 在既有 Chat 中实际调用一次 `generate_image`。约 42 秒完成，Journal 为 `completed / Generated 1/1 image`，保存 737571 bytes PNG 产物，turn 为 completed。
- Computer Use 点击产物入口打开右侧预览，真实截图确认白色背景的蓝色圆形。不是模型口头声称成功，也未使用替代生图工具。
- 本轮成功覆盖单图生成、保存、UI 打开。不能推导服务持续稳定；此前 fetch failed 的瞬时网络原因未重新出现，未声称通过放宽网络安全边界解决。
- 分叉 lease、Chat UI 控件边界、附件正负向及其他剩余矩阵未纳入本次修复。
