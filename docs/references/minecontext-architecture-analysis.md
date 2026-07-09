# MineContext 架构分析：上下文分类体系与主动推送机制

> **参考来源**：[MineContext](https://github.com/anthropics/MineContext)（字节跳动开源的主动式上下文感知 AI 个人助手）
>
> **本地源码位置**：`/Users/wakeup-jin/Desktop/code-project/back-code/MineContext`

---

## 一、六种上下文分类体系

MineContext 的核心设计是将所有用户数据（截屏、文档、操作等）统一处理为六种认知维度的上下文。这套分类体系对齐人类认知模型，是整个系统的基底。

### 1.1 分类定义

| 类型 | 枚举值 | 认知对齐 | 回答的问题 | 典型内容 |
|------|--------|---------|-----------|---------|
| **实体上下文** | `entity_context` | 语义记忆（概念网络） | 谁/什么？ | 人名、项目名、工具名、组织关系 |
| **活动上下文** | `activity_context` | 情景记忆（事件记录） | 发生了什么？ | 用户正在编辑代码、浏览网页、参加会议 |
| **意图上下文** | `intent_context` | 前瞻记忆（目标规划） | 打算做什么？ | 用户可能要提交 PR、准备演示、学习新框架 |
| **语义上下文** | `semantic_context` | 语义记忆（知识存储） | 这意味着什么？ | 代码逻辑、文档要点、对话关键信息 |
| **过程上下文** | `procedural_context` | 程序记忆（操作技能） | 怎么做？ | 操作步骤、配置流程、部署方法 |
| **状态上下文** | `state_context` | 元认知（状态感知） | 进展如何？ | 任务完成度、情绪状态、工作连续时长 |

> 源码定义：`opencontext/models/enums.py` 中的 `ContextType` 枚举（另有 `KNOWLEDGE_CONTEXT` 但实际系统以上述六种为核心）。

### 1.2 分类是如何发生的

分类不是规则匹配，而是由 VLM（视觉语言模型）驱动的。核心流程：

```
原始输入（截屏/文档）
    ↓
screenshot_processor.py
    ↓  pHash 去重 → 批量合并
    ↓
VLM 分析（prompts_zh.yaml → processing.extraction.screenshot_analyze）
    ↓  提示词明确指示：一条输入可以同时产出多种上下文类型
    ↓
ProcessedContext（带 context_type 标签）
    ↓
存入 ChromaDB（向量库）
```

关键设计点：**一条原始输入可以同时被分类为多种上下文类型**。例如一张截屏中用户在写代码，VLM 会同时生成：
- `activity_context`：用户在使用 VS Code 编辑 Python 文件
- `semantic_context`：代码涉及数据库连接池配置
- `entity_context`：提到了 PostgreSQL、SQLAlchemy
- `intent_context`：用户可能在优化数据库性能

### 1.3 设计评价

**优点**：
- 六种类型覆盖了"理解一个人的数字世界"的全部维度，做到了分类正交且完备
- 与人类认知科学中的记忆分类（情景记忆、语义记忆、程序记忆等）对齐，语义自然
- VLM 驱动的分类方式灵活，不需要硬编码规则，适应性强

**可改进方向**：
- 分类完全依赖 VLM 提示词的质量，需要精心调优
- 对非视觉输入（纯文本、API 事件）的分类路径不够完善

---

## 二、主动推送机制：四大定时任务

MineContext 的主动推送不是简单的通知系统，而是一个**级联式信息精炼管线**。四个任务按不同频率运行，且上游任务的产出会被下游任务消费。

### 2.1 调度中心

`ConsumptionManager`（`opencontext/managers/consumption_manager.py`）统一管理四个定时任务：

| 任务 | 频率 | 对应类 | 消费的上下文类型 |
|------|------|-------|-----------------|
| **活动快照** | 15 分钟 | `RealtimeActivityMonitor` | Activity + Intent（2种） |
| **智能待办** | 30 分钟 | `SmartTodoManager` | Activity + Semantic + Intent + Entity（4种） |
| **智能提示** | 1 小时 | `SmartTipGenerator` | 全部六种 |
| **日报** | 每天 08:00 | `ReportGenerator` | 全部六种 + 已生成的 Activities/Todos/Tips |

每个任务通过 `threading.Timer` 循环调度，有 `_should_generate` 机制防止重复触发。

### 2.2 任务一：活动快照（RealtimeActivityMonitor）

**角色**：系统的"眼睛"，每 15 分钟扫描一次用户在做什么。

**流程**：
1. 从 ChromaDB 取最近 15 分钟的 `activity_context` + `intent_context`
2. 序列化为文本，连同时间信息发给 LLM
3. LLM 输出结构化 JSON：

```json
{
  "title": "代码优化与架构设计",
  "description": "用户过去15分钟在进行...",
  "category_distribution": { "work": 0.7, "learning": 0.2, "communication": 0.1 },
  "extracted_insights": {
    "potential_todos": [{"content": "完成数据库迁移脚本", "urgency": "high"}],
    "tip_suggestions": [{"content": "连续编码45分钟，建议休息"}],
    "key_entities": ["PostgreSQL", "MineContext"],
    "focus_areas": ["后端开发"],
    "work_patterns": {"continuous_work_time": 45}
  }
}
```

4. 存入 SQLite `activity` 表，发布 `ACTIVITY_GENERATED` 事件

**关键设计**：`extracted_insights` 中的 `potential_todos` 和 `tip_suggestions` 是**预提取的候选信息**，供下游 Todo 和 Tips 任务消费。

### 2.3 任务二：智能待办（SmartTodoManager）

**角色**：从用户活动中自动识别"应该做的事"。

**流程**：
1. 从最近的活动快照中提取 `potential_todos`（来自活动任务的预提取）
2. 用候选待办作为查询词，到 ChromaDB 中搜索相关上下文（补充背景信息）
3. 从 SQLite 查询历史待办（去重用）
4. 三类信息拼接后发给 LLM 生成待办列表
5. 后处理：
   - 根据优先级自动补全截止时间（高→明天，中→3天，低→一周）
   - **向量去重**：为新待办生成 embedding，与历史待办做相似度比较，>0.85 的被过滤
6. 存入 SQLite `todo` 表 + embedding 存入 ChromaDB

### 2.4 任务三：智能提示（SmartTipGenerator）

**角色**：阶段性工作评价和前瞻性建议。

**流程**：
1. 获取**全部六种类型**的上下文（时间范围内）
2. 分析活动模式（从 SQLite `activity` 表提取工作时间分布、高频实体、连续工作时长、任务切换频率等）
3. 获取最近 24 小时 Tips 历史（避免重复提醒）
4. 三类信息拼接后发给 LLM，**同时开启工具调用能力**（`tools=ALL_TOOL_DEFINITIONS`）
5. LLM 可以主动调用检索工具获取更多背景信息后，生成 Markdown 格式的建议
6. 存入 SQLite `tips` 表

**特殊之处**：Tips 是唯一一个允许 LLM 在生成过程中**反向调用检索工具**的任务。

### 2.5 任务四：日报（ReportGenerator）

**角色**：一天结束时的综合总结。

**流程（Map-Reduce 架构）**：

```
Map 阶段：按小时并发
  00:00~01:00 → LLM → 小时总结1    ┐
  01:00~02:00 → LLM → 小时总结2    │  并发度 = 5
  ...                               │
  23:00~24:00 → LLM → 小时总结24   ┘
  
  每块输入 = 该时段的上下文 + Tips + Todos + Activities

Reduce 阶段：合并
  所有小时总结 → LLM → 完整日报
```

**输入范围最广**：不仅消费原始的六种上下文，还消费了前三个任务的所有产出。日报是整个信息管线的终端汇聚点。

### 2.6 四个任务的级联信息流

四个任务不是孤立运行的，它们形成了一个逐层提纯的信息管线：

```
原始截屏/文档
    ↓  VLM 分类
六种上下文（ChromaDB）
    │
    ├──→ Activity 快照（15min）
    │        │
    │        ├─ potential_todos ──→ Todo 任务（30min）
    │        ├─ tip_suggestions ──→ Tips 任务（1h）
    │        └─ work_patterns   ──→ Tips 任务
    │
    ├──→ Todo 任务 ──→ 存入 SQLite ──┐
    ├──→ Tips 任务 ──→ 存入 SQLite ──┤
    └──→ Activity   ──→ 存入 SQLite ──┤
                                      ↓
                              日报（每天 08:00）
                              = 上下文 + Activities + Todos + Tips
```

信息逐层提纯：**原始像素 → 结构化上下文 → 活动快照 → 待办/提示 → 日报**。

---

## 三、检索机制：双通道设计

MineContext 的检索不是纯 RAG，而是双通道并存：

| 通道 | 触发条件 | 实现 | 适用场景 |
|------|---------|------|---------|
| **语义检索（RAG）** | 用户提供了 `query` | 文本 → embedding → ChromaDB 向量搜索 | "我之前看过的那篇关于缓存的文章" |
| **结构化过滤** | 无 `query`，只有时间/类型等过滤条件 | 直接从 ChromaDB 按元数据筛选 | "最近一小时的活动"、"所有待办" |

```python
# base_context_retrieval_tool.py 核心逻辑
if query:
    vectorize = Vectorize(text=query)
    return self.storage.search(query=vectorize, context_types=[...], filters=..., top_k=...)
else:
    return self.storage.get_all_processed_contexts(context_types=[...], limit=..., filter=...)
```

主动推送场景主要使用**结构化过滤**（按时间范围取数据），而用户主动提问场景才走 RAG。

---

## 四、对 actspace-agent 的参考价值

### 4.1 值得借鉴的设计

1. **六种上下文分类体系**：认知对齐的分类方式普适性强，可以直接复用或微调
2. **级联式主动推送**：任务之间存在信息流依赖，避免每个任务从零开始分析，降低 LLM 调用开销
3. **Activity 预提取洞察**：高频任务（Activity）为低频任务（Todo/Tips）预提取候选信息，减少重复分析
4. **日报的 Map-Reduce 架构**：解决长时间范围数据超出 token 限制的问题
5. **向量去重**：避免生成重复内容（特别是 Todos），embedding 相似度 > 0.85 过滤

### 4.2 可改进的方向

1. **触发机制偏生硬**：纯定时器驱动，不管用户是否在使用电脑都会触发。可以引入**事件驱动 + 定时器混合**的方式，根据用户活跃度动态调整生成频率
2. **Workflow 预组装上下文**：所有上下文在进入 Agent 之前已经被 Workflow 的各节点按固定流程组装好，Agent 本身没有自主获取上下文的能力。可以让 Agent 拥有更多的上下文获取自主权
3. **缺乏用户反馈回路**：生成的 Todos/Tips 没有反馈机制来影响后续生成质量。可以加入用户"采纳/忽略"的信号来优化生成策略
4. **上下文窗口管理粗糙**：按固定 `limit` 取数据，没有根据上下文的重要性/相关性做精细排序

---

## 五、关键源码文件索引

| 文件 | 作用 |
|------|------|
| `opencontext/models/enums.py` | `ContextType` 六种上下文枚举定义 |
| `opencontext/models/context.py` | `RawContextProperties`、`ProcessedContext` 数据模型 |
| `config/prompts_zh.yaml` | 所有提示词模板（分类、生成、检索分析） |
| `config/config.yaml` | 定时任务频率、存储后端配置 |
| `opencontext/context_processing/processor/screenshot_processor.py` | VLM 分类核心逻辑 |
| `opencontext/managers/consumption_manager.py` | 主动推送调度中心 |
| `opencontext/context_consumption/generation/realtime_activity_monitor.py` | 活动快照生成 |
| `opencontext/context_consumption/generation/smart_todo_manager.py` | 智能待办生成 |
| `opencontext/context_consumption/generation/smart_tip_generator.py` | 智能提示生成 |
| `opencontext/context_consumption/generation/generation_report.py` | 日报生成（Map-Reduce） |
| `opencontext/tools/retrieval_tools/base_context_retrieval_tool.py` | 双通道检索基类 |
| `opencontext/context_consumption/context_agent/core/workflow.py` | Agent 四节点工作流 |
