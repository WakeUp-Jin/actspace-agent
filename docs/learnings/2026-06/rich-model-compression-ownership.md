# 压缩这类「自我改写」操作的执行权应该归数据所有者（贫血 → 充血）

> 提炼自：`docs/histories/2026-06/20260610-1910-conversation-compress-rich-model-refactor.md`

## 问题长什么样

主 Agent 历史压缩最初的调用链：

```
ContextManager.compactIfNeeded()
    └─► compactHistory({ conversation, ... })     // compression/ 下的自由函数
            ├─► conversation.planCompaction()      // 指挥别人的数据
            ├─► summarizer.summarizeHistory()
            └─► conversation.applyCompaction()
```

`ConversationContext` 明明是 messages 的所有者，却把 `planCompaction` / `applyCompaction`
两个"手术步骤"暴露出去，让一个外部函数来编排自己的手术——典型的**贫血模型**：数据和
行为分离，对象退化成数据袋。

两个气味可以帮你在别处识别同款问题：

1. **成对暴露的 plan/apply、begin/commit 类方法**：如果一对方法只有按固定顺序连用才有意义，
   而编排顺序写在别的文件里，说明编排权放错了地方。
2. **工具目录反向依赖领域模块**：`compression/ → modules/` 这种"工具 import 数据所有者"
   的边，几乎总是编排逻辑站错了位置的信号。

## 重构后的形状

```
ContextManager.compactIfNeeded()        // 指挥者：只判断「要不要压」（阈值 + 防抖）
    └─► conversation.compress(opts)     // 所有者：编排「怎么压」
            ├─► this.planCompaction()           // 内部步骤
            ├─► serializeMessagesForSummary()   // compression/ 纯函数工具
            ├─► summarizer.summarizeHistory()   // 外部服务
            └─► this.applyCompaction()          // 内部步骤
```

- 依赖方向翻正：`modules/conversation → compression/*`，compression 退化为无状态工具库。
- 指令与执行分离：调用方的语义从"我来操作你的数据"变成"你该压缩自己了"。

## 怎么想（可迁移的判断框架）

- **改写自身状态的复合操作，编排权给状态所有者**。外部只保留触发决策（何时/是否），
  因为触发条件往往依赖所有者之外的信息（token 水位、用户指令），而改写步骤只依赖
  所有者自己的不变式（安全切点、消息配对）。
- **扩展时复制模式而不是提前抽象**。"将来要压长期记忆"的正确准备不是现在定义
  `Compressible` 接口，而是保证模式可复制：每个需要压缩的模块在自己身上长出
  `compress()`，指挥者处加一条指令分发。只有一个实现时抽接口是 YAGNI。
- **单测友好不等于全部 public**。plan/apply 作为细粒度步骤保留 public 以便独立测试
  切点策略，但 JSDoc 标注它们是 `compress()` 的内部步骤——这是 TS 中务实的折中。

## 自检问题

1. 你的代码里有没有"一对必须按顺序连用的方法 + 编排在别的文件"？编排该搬回所有者吗？
2. 如果明天加第二个压缩目标（长期记忆），你的设计需要改几处？改在谁身上？
3. `ContextManager` 还知道"安全切点"这个概念吗？（不应该知道——它只认得报告字段。）
