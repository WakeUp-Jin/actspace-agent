# 设置持久化的所有权分层与派生读模型

## 背景

设置中心重构同时参考了 Maka 的页面组织和 DeepSeek Harness 的配置机制。真正需要迁移的不是字段名称，而是“谁拥有数据、谁能写入、哪份数据可以重建”这三个问题。

## 核心模式

ActSpace 将数据分成四类：

```text
settings.json
  非敏感、可迁移的用户和运行配置

secrets.json
  Main-only 凭据

prompts/main-agent.md
  长文本 System Prompt

sessions-v2/<sessionId>/journal.jsonl
  Session、LLM usage、Tool 和 Trace 事实
```

页面可以把这些对象组织成一个连续的设置流程，但不能因为 UI 合并就把物理所有权合并。模型连接与模型定义可以在一个“模型”页面完成，存储仍然通过稳定 `connectionId` 和 `modelKey` 关联。

## 为什么 Usage 不能写回设置

Usage 页面中的时间范围、状态筛选、模型筛选和当前 Tab 是用户偏好，可以写入 `settings.json` 的 `activity.usage`。Token、成本、请求状态和延迟则是已经发生的运行事实，必须从 Session Journal 投影得到。

这样做有两个好处：

1. 删除或重建派生读模型不会影响会话恢复和历史事实。
2. 页面偏好变化不会伪造或覆盖 provider 返回的 usage。

未来可以增加 SQLite 作为查询缓存，但它必须可删除、可重建，并且不能成为第二个恢复事实源。

## 常见陷阱

- 把所有设置页面的字段直接堆进一个没有 namespace 的对象，导致迁移和权限边界不清晰。
- 把 API Key 放进 renderer 可见的 settings snapshot。
- 用展示名称而不是稳定 ID 关联 Provider、Model 和 Usage。
- 为了模仿参考项目，提前加入运行时尚未支持的配置字段。
- 把 Usage 汇总表当成不可重建的主数据库。

## 关联变更

本知识点来自 [`20260830-1933-settings-center-redesign-spec.md`](../../histories/2026-08/20260830-1933-settings-center-redesign-spec.md)。
