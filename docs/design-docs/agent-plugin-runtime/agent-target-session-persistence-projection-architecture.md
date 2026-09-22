# Session 持久化事实源与投影架构

状态：2026-09-21 生产读取路径完成切换；验证结果与外部验收边界见[执行摘要](../../exec-runs/20260921-session-projection-cutover/execution-summary.md)。

## 事实源与分层

Session Event Journal 是唯一 Session 事实源。Host 统一维护跨冷读、跨重连复用的派生事实；Client 对同一事件窗口分别生成 Chat、Trajectory 和 Tool Card，不要求它们共享视图结构。

```text
Session Event Journal
├─ Host Projection Registry
│  ├─ metadata（title、pinned、archived）
│  ├─ todos、sessionStats、providerUsage、pendingInbox、delegations
│  └─ surface、tools、workspaceRoot、updatedAt、requestContext
├─ Projection Cache
│  └─ projection-checkpoint.json（状态 checkpoint、JSONL 字节偏移与窗口索引）
└─ Client Raw Event Window
   ├─ Chat projection
   ├─ Trajectory projection
   └─ Tool Card projection
```

Goal 当前没有业务 producer 或 Session event，不预置空壳兼容实现；未来先定义事件与 codec，再注册纯 projection definition。

## Journal 与持久化水位

Session Core append 校验事件并分配连续 seq，accepted watermark 与 durable watermark 分离。`session/event` 表示事件已被 Journal 接受，不能据此宣称已经 fsync。Persistence coordinator、checkpoint policy 和 flush barrier 决定 durable prefix；参见[Session Core / Persistence](./agent-spec-session-core-persistence-separation.md)和[Session 格式](./agent-spec-session-format-v1.md)。

Live Host model 可以反映 accepted prefix。冷读缓存只能从磁盘 Journal 构建；flush callback 在 durability barrier 后刷新缓存。通知、投影或 cache 失败不能撤销已经接受的 Journal 事实。Live progress 是可丢失 overlay，不是第二份恢复日志。

## Host Projection Registry

`packages/session/projection/src/registry.ts` 提供 `register`、`sync`、`apply`、`snapshot`、`checkpoint`、`restore` 和变更订阅。每个 definition 有稳定 key、stateVersion、init、apply、view。

- apply 与 view 必须同步、纯、确定；不相关事件返回原 state reference。
- 状态被冻结，禁止 reducer 原地修改既有状态；所有 definitions 成功后才提交新水位。
- 输出与 checkpoint 使用 detached JSON，不传递 live handle、闭包或 Provider 对象。
- 增量事件必须连续；事务使用 effectiveSessionEvents，未闭合事务保留在 pending，不提前形成有效派生事实。
- restore 验证 definition 版本；checkpoint 保存内部 reducer state，不用展示 value 反推状态。
- 未知事件遵守 codec 的 required/ignorable 策略，不把不完整恢复伪装成可写会话。

`facts.ts` 注册通用 metadata、todos、sessionStats、providerUsage、pendingInbox 和 delegations。Runtime 的 `SessionReadModel` 注册 Surface、tool lifecycle、workspaceRoot、updatedAt、requestContext，并组合 `RuntimeV2SessionSnapshot`。Surface append/replace 继续使用 SessionSurface 语义；Chat 不能仅凭 user/assistant 事件类型重新推断有效历史。

Provider usage 来自持久化请求结果；requestContext 来自请求快照与模型容量事实。累计 tokens 不等于当前上下文占用，不能拿累计值除以模型窗口。容量缺失时不虚构固定默认容量。

## 缓存与冷读

`packages/session/projection-cache/src/journal-cache.ts` 读取 Journal Header、文件身份和长度，校验 codec digest、definition stateVersions、checkpoint 水位与 anchor。命中时恢复 reducer state 并 replay 新增尾部，同时维护事件字节偏移、Turn 起点、Request 编号和 callId 索引。

缺失、格式损坏、版本变化、文件替换或截断等失效条件触发 Journal 重建。checkpoint 文件采用临时文件写入后 rename；写缓存失败不阻止 Journal 读取。缓存可删除，不能参与 Agent resume、canonical export 或修复事实。

首轮冷读或缓存失效仍需完整扫描。列表逐会话取得摘要，未引入后台索引调度；不能宣称超大历史首读无成本。追加检测以 Journal 的 append-only 约束为前提。

## IPC 与事件窗口

`RuntimeSessionController.readProjection` 返回：

- `sessionId`、`throughJournalSeq`：全 Session 派生事实的共同水位；
- `snapshot`、`values`：Host facts，以及当前窗口需要的 Surface 和 ToolView；
- `window`：events、fromSeq、throughJournalSeq、beforeSeq、turnOffset、requestOffset；
- `activeMessageIds`：全 Session 当前有效 Surface 身份，用于清除被 replace 的旧消息；
- `deferredToolCalls`：从普通页剥离的大工具正文，通过 detail API 按需读取。

默认最近 10 个完整 Turn。`beforeSeq` 向前分页；`afterSeq` 读取尾部补齐。窗口包含 turn/start 前的 Inbox claim。全 Session 水位与历史页末尾水位是不同概念，客户端不能用历史页尾覆盖最新 facts。

单个大工具事件超过 24,000 字符时移除传输页中的 modelOutput/detail 和 Surface 正文，Journal 原文不变。该阈值不是整个 IPC envelope 的硬字节上限。完整复制对话使用完整读取，不依赖屏幕已加载页。

`journal-update` 通知携带事件、changed values 与相应 ToolView。客户端发现缺口、runtimeInstanceId 变化或 resync-required 后重新读取；通知不是持久历史。

## Client 与 Desktop 边界

`packages/client/src/sessions/session.ts` 按 sessionId 管理 snapshot、raw window、projection values、请求 generation 和 live overlay。相邻或重叠页按 seq 去重合并；旧响应不覆盖新 facts；Surface replacement 按有效 messageId 收敛。

- `chat.ts`：根据有效 Surface、工具结果和错误事实生成聊天展示；
- `trajectory.ts`：保留原始执行事件、source、surface 和绝对 seq；
- `tool-card.ts`：从结构化 args/result/detail 生成卡片；后台 Bash taskId 来自 detail，不解析模型输出文字；
- `selectors.ts`：Context、Usage、Composer 等消费适配；
- `usage-aggregates.ts`：活动与费用展示聚合。

Desktop main 保留 Runtime 调用、权限、IPC 和 live stream adapter；preload 暴露 typed API，必要的 Chat 适配复用 Client 包。Renderer 的 SessionProjectionProvider 复用 App 的 store，避免二次读取和双 store。组件可有各自视图结构，但不建立独立历史文件或主进程 renderer projection。

## 已移除与保留边界

已删除独立 browse index、旧 Main fixed renderer projection/tool preview/usage aggregates、session revision observer、旧 product projections 和 Host trajectory projector，以及被替代的 checkpoint/cold-restore/restore-floor 实现。没有保留旧 IPC cursor fallback 或双轨读取。

仍被 persistence/compaction 使用的 `session/projection/src/projection.ts` 是运行时恢复投影，不因文件名相近而删除。仍使用的流式 adapter、权限系统和工具执行器也不是冗余兼容层。

## 验证与入口

验证重点：重放与增量一致、reducer 失败不污染状态、缓存可删除及损坏恢复、25 Turn 的 10/10/5 分页、冷读不打开 writer、Surface replacement、请求身份、重连与过期响应、大工具详情、流式与后台会话隔离。

- `packages/runtime/src/runtime/session-projection.test.ts`
- `packages/session/projection/src/test/registry.test.ts`
- `packages/session/projection-cache/src/test/cache.test.ts`
- `packages/client/src/test/session-store.test.ts`
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `apps/desktop/scripts/verify-trajectory-electron.mjs`

DSH 本地对照：`tmp/deepseek-harness/packages/session/session-projection/src/index.ts`、`packages/client/runtime/src/client/sessions/session.ts` 与 `packages/client/ui-trajectory/src/client/trajectory-snapshot-builder.ts`。它们作为设计参考，不是 ActSpace 的运行依赖。
