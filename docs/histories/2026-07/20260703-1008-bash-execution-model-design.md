# Bash 工具设计文档（设计先行，未实现）

## 用户诉求

希望把 bash 工具设计得更完善：沙盒要考虑；后台运行要考虑（如项目启动命令长时间运行、持续输出日志，输出如何稳定传递给模型上下文）。要求先调研 Cursor / Claude Code / OpenCode 三个参考实现，本轮只确定设计规范，不实现。后续多轮讨论确定：通知机制取两家之长、沙盒优先执行模型、前端沙盒标签；并要求把调研分析归档到 references、正式设计落为独立文档。

## 主要改动

- 新增 `docs/design-docs/agent-bash工具设计文档.md`：Bash 工具设计事实来源——工具契约（blockMs / notifyOnOutput / requiredPermissions）、输出管道（头部内联 + 条件落盘）、后台任务生命周期与 turn 边界通知注入、沙盒优先执行模型（含"为什么有些命令沙盒里跑不了"的机理说明）、前端沙盒标签三态、E1–E5 分阶段路线。
- 调研底稿移至 `docs/references/bash-tool-reference-analysis.md`（原 `docs/design-docs/agent-bash-execution-model-design.md`），标注正式设计以设计文档为准。
- 更新 `docs/design-docs/index.md` 与 `docs/references/README.md` 索引。
- 设计文档追加附录：Seatbelt profile 模板与生成契约（生成器而非静态文件、`-D` 参数传路径、域名过滤须靠本地代理、sandbox-exec 探测降级）。
- 附录追加沙盒实现路线决策：对 `@anthropic-ai/sandbox-runtime`（srt）做源码分析后确定**抽取式自研**——srt ~11.5K 行中我们只需约 1K（macOS profile 生成 + 违规监听 + 域名层代理），其 TLS MITM、凭据掩码、三平台支持均超出需求；Apache-2.0 允许抽取（保留归属声明）；srt 源码参考副本落在 `back-code/sandbox-runtime`。同时修正附录早前错误：profile 基线应为 srt 同款 `(deny default (with message tag))` 全拒 + essential allows（源自 Chrome 策略），而非 `(allow default)` 黑名单式。

## 调研结论（来源：本地源码 + Cursor 编译产物）

- Cursor：`block_until_ms` 超时转后台（不杀进程）、"终端即文件"输出契约、`notify_on_output` 正则订阅、Seatbelt 沙盒 + `required_permissions` 逐条升级。
- Claude Code：超时自动转后台、`DiskTaskOutput` 流式落盘（append 队列、O_NOFOLLOW）、`<task_notification>` 结构化终态通知（去重 + 竞态处理）、交互式卡死看门狗、sandbox-runtime（Seatbelt/bubblewrap）+ 违规标注进输出。
- OpenCode：无后台，超时杀进程但 `<bash_metadata>` 错误语义精确；tree-sitter 提取路径实参做外部目录独立授权；恒定内存滚动窗口。

## 关键设计决策

- `blockMs`（到点转后台）替换 `timeoutMs`（到点杀进程）；**不做后台二次超时击杀**，常驻进程只有显式 kill / 会话收割 / 磁盘看门狗三种死法。
- 后台事件三件套：终态通知（一次性命令）+ `notifyOnOutput` 输出订阅（常驻进程永不退出，终态通知不会来）+ 卡死看门狗（无增长且尾行像交互提问才报）。
- 通知在 turn 边界注入，复用 `engine/loop.ts` steering messages；loop 结束后滞留队列随下轮用户消息注入。
- 沙盒优先执行模型：hard reject → 沙盒自动跑（跳过 ask）→ 证据驱动升级 → 强制 ask 重验（授权前提变了要重新获取）；违规必须标注进输出防模型误归因。
- 前端沙盒标签三态（沙盒 / 真实环境 / 沙盒→升级）：沙盒优先让大量命令跳过审批，执行约束必须对用户可见。
- 输出管道保持现有 sink 模式（头部内联 + 条件落盘），不采用 Cursor 无条件落盘。
- 沙盒实现抽取式自研而非依赖 srt：沙盒规则是安全边界本身不能黑盒化、srt 需求覆盖仅约 10% 且自标 Beta、Cursor 同为自研；域名过滤停在 CONNECT/SNI 层不做 MITM，凭据保护改用子进程 env 白名单。

## 受影响文件

- `docs/design-docs/agent-bash工具设计文档.md`（新增，设计事实来源）
- `docs/references/bash-tool-reference-analysis.md`（由 design-docs 移入并改标题）
- `docs/design-docs/index.md`
- `docs/references/README.md`
