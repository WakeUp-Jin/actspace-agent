# 基础技术

本文件夹包含 Agent 后端的基础设施模块——它们不属于四大核心支柱，但为核心模块提供必要的支撑。

## 本模块包含

| 文件 | 关注点 |
|------|--------|
| `rag-strategy.md` | RAG 全链路：分块向量化、索引类型（向量/分层/HyDE）、上下文增强、融合检索、查询转换与路由 |
| `skill-integration.md` | Skill 集成全流程：发现/解析/使用/管理/快速构建，渐进式披露策略 |

## 何时需要读这些

- 需要为 Agent 添加外部知识检索能力 → `rag-strategy.md`
- 需要让 Agent 集成 Skill 系统（发现、解析、渐进式加载、上下文管理）→ `skill-integration.md`

会话存储相关内容已迁移至 `references/context/session-storage.md`，因为会话历史是上下文的核心组成部分。

Agent 评估相关内容已独立为 `references/agent-evaluation/` 模块，参阅 `references/agent-evaluation/overview.md`。
