# 英语辅助学习 — 执行过程

- 计划：`docs/exec-plans/completed/20260906-actspace-english-learning/README.md`
- 模式：交互模式；2026-09-06 用户明确要求开始实施。

## 执行时间线

### 开始与基线

- 已读取计划、设计、仓库协作、编码、安全和主题规则；确认既有 Scope、Prompt、Session 和设置入口仍可使用。
- 工作区含其他任务的未提交修改，保留当前状态；实施前 tracked diff 保存在本机临时目录用于对照，不写入仓库。
- 本轮按已确认计划直接实施，不创建额外任务或并行代理。

## 当前状态

S1–S6 代码与记录已完成，实机验收边界见执行摘要。

## S1–S5 实施

- 新增 `@actspace/english-learning` 独立包、manifest、behavior、静态 prompt 资源与 build 复制；shared 只包含跨进程 DTO 与默认配置。
- 目标监听按真实 ScopeKey 注册，事件输入的 Agent subject 校验后再变换 `next()` 的候选。真实 AgentLoop 集成曾捕获“候选不保留 subject 导致不注入”的问题，已修正并检查实际请求与 Journal。
- 完成事件以成功 turn/end 为界读取最终消息，只接受当前绑定真正注入过的 step。英文过滤、有界队列、AbortController 与版本检查共同防止历史/迟到结果播放。
- Desktop 主进程拥有 Settings secret store、随机临时目录和 afplay；退出逻辑接入实际 before-quit 清理链，未依赖会被 app.exit 跳过的 will-quit。
- IPC 校验当前窗口主 frame，控制面恢复目标主 Agent、校验可用性、串行保存/绑定，错误使用脱敏文案。renderer 收到快照后再更新开关，忽略旧 revision。
- 通用设置语音分组与扩展能力卡完成；设置跳转等待内容加载再定位分组。浏览器桥接不可用时英语卡片仍独立显示。

## S6 验证与调整

- Loader 的 Node fallback 会从 Loader 自身包位置解析裸 specifier；仅在 Runtime 添加依赖不足。补充仓库根显式插件依赖，并通过真实 CLI 启动测试。未引入跨包 src 导入或自定义 Loader。
- Desktop build:deps 先构建 Runtime 的完整依赖闭包，保证新插件、Desktop Bundle 及静态 prompt 能由 dist 使用。
- 独立插件 12 项、Runtime 5 项、Desktop 新增 5 项通过；类型与构建通过。全量 Desktop 的超时分别缩小并发/单独复测，最终失败项复测通过，没有扩大范围改现有测试。
- 根测试的包边界门禁被已有两处工具测试深导入阻断，记录在摘要；保留其他任务内容。
- `pnpm dev:log` 先遇 sandbox listen 限制，按权限流程重试；5173 已占用后改为 5187。Electron 开发身份准备成功，但启动返回失败且没有窗口；单独启动同样失败。没有签收真实 IPC/播放器。
- 浏览器显式 fixture 经 CUA 检查浅/深主题、窄面板、开关、默认最新会话、未配置状态；首次遇其他任务生成文件暂不可解析，刷新后恢复。没有修改其他任务的生成文件。
- 实际 MiniMax/自然语言输出/系统音频列为人工门禁；未使用任何有效凭据或原项目配置。
- 设计、架构、设置规范、索引与 history 同步，计划移到 completed，保留未验收项。学习文档聚焦事件身份与组装结果的区别。


## 收尾复核

- 插件新增“stop 尚未完成时 enqueue 新回答”的竞争测试，等待最近一次 stop barrier 后才启动新合成，插件共 12 项通过。
- 根 typecheck 在 2026-09-07 通过。后续全量 build 重跑遇到同时进行的费用目录改动：main/preload 使用 getPricingCatalog / refreshPricingCatalog，但 shared 尚无对应 channel；初次完整 build 已通过，这次失败保留为当前工作区限制，不改其他任务代码。
- `pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:frontend-theme` 通过。已移动总索引条目到“最近完成”，文档状态与外部门禁一致。

- 播放器退出增加强杀后的完成兜底：即便子进程不发 close，dispose 也能结束并清理音频；测试模拟该场景。最后关闭本任务的本地预览服务。

## 2026-09-07 模型选择追加

用户确认方案后，将 SpeechSettings.model 扩展为 8 个版本共享白名单，SettingsService 不再覆盖有效值，语音设置增加选择器。请求层已消费 settings.model，无需修改合成网络路径。扩展现有测试覆盖所有模型持久化、请求版本、默认值、选项和保存；19 + 3 项通过，Desktop 类型、renderer / Electron 构建通过。浏览器浅深主题及保存反馈已验证。
