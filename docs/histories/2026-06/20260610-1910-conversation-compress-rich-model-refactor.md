# 主 Agent 历史压缩改为充血模型（conversation.compress）

## 背景

原压缩调用链是反的：`compression/history-compactor.ts` 的自由函数 `compactHistory` 拿着
`ConversationContext` 的引用指挥它 `planCompaction → applyCompaction`——数据所有者沦为被
外部函数编排的"贫血"数据袋，依赖方向也别扭（`compression/ → modules/`，工具库反向依赖数据模块）。

## 变更

- `context/modules/conversation.ts`：新增充血入口 `compress({ summarizer, sessionJsonlPath, keepRatio })`，
  自编排 `planCompaction → serializeMessagesForSummary → summarizer.summarizeHistory → applyCompaction`，
  内置兜底（摘要缺省/失败 → 丢最旧 + session.jsonl 指针）。摘要消息合成 helper
  （`buildCompactionMessage` / `buildFallbackBody`）一并收进本文件。`planCompaction` / `applyCompaction`
  保持 public 作为可独立单测的细粒度步骤。
- `context/compression/history-compactor.ts`：删除。序列化部分拆出为纯函数文件
  `compression/history-serializer.ts`（`serializeMessagesForSummary`）。`compression/` 目录自此
  退化为被 conversation 消费的工具库（serializer / prompts / summarizer），无编排职责。
- `context/manager.ts`：`compactIfNeeded` / `compactNow` 改为向 `conversation.compress()` 发指令；
  两处重复的报告组装收敛为私有 `dispatchCompression`。`ContextCompactionReport.reason` 类型改引
  `ConversationCompressionResult["reason"]`。
- 测试迁移：`compression/test/history-compactor.test.ts` 拆为
  `context/test/conversation-compress.test.ts`（compress 四用例）+
  `compression/test/history-serializer.test.ts`（序列化用例），断言不变。

## 设计意图

- **压缩执行权归数据所有者**：`ContextManager` 只判断「要不要压」（token 阈值 + 调用间隔防抖），
  「怎么压」全部封装在会话历史模块自身。
- **为多压缩目标铺路但不预设抽象**：将来长期记忆等模块需要压缩时，在该模块自身上提供它自己的
  `compress()`，`ContextManager.dispatchCompression` 处增加指令分发即可；当前只有一个压缩者，
  不引入 `Compressible` 接口（YAGNI）。
- 依赖方向修正为 `modules/ → compression/`，与「工具库被领域模块消费」的直觉一致。

## 影响面

仅 context 域内部：`compactHistory` 从未经 `index.ts` 导出，desktop / engine / kairos 调用的
`compactIfNeeded` / `compactNow` 签名与行为不变。

## 验证

- `vitest run`（agent-core 全量）：88 文件 / 631 用例全过。
- `tsc --noEmit`：通过。

## 文档同步

- `docs/design-docs/agent-context-compression.md`：治疗层示意、手动 /compact、「压缩算法」一节、文件清单。
- `docs/design-docs/agent-current-module-map.md`：conversation / manager / compression 三条目。
- `ARCHITECTURE_MAP.html` context 表格、`ARCHITECTURE_GRAPH.html` context 子图（节点与依赖边方向）。
- 学习沉淀：`docs/learnings/2026-06/rich-model-compression-ownership.md`。
