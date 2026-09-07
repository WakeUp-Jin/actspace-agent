# v1 历史设计归档

本目录保存 ActSpace v1 时代、已退役能力、已被 v2 方案替代的设计文档与原型资产。

## 阅读规则

- 这里的内容只用于历史追溯、迁移复盘和理解旧实现，不是当前产品或架构的默认事实来源。
- 新功能、代码修改和 Agent 规划不得从本目录推导当前 API、包边界、持久化格式或产品入口。
- 当前架构优先阅读 [`../index.md`](../index.md)、[`../agent-index.md`](../agent-index.md) 和 [`../agent-plugin-runtime/README.md`](../agent-plugin-runtime/README.md)。
- 当前实现仍未覆盖的 v2 能力，以对应的 v2 execution plan 和 `agent-plugin-runtime/` 公共契约为准。

## 归档范围

| 前缀 | 内容 | 当前替代入口 |
|---|---|---|
| `agent-runtime-*` | 旧 Agent Core、宿主 Runtime、CLI 和测试模块设计 | `../agent-plugin-runtime/`；当前运行事实以 `packages/runtime/` 与领域 workspace packages 为准 |
| `agent-plugins-fs-watch.md` | 已删除的 v1 fs-watch 插件 | 当前没有对应产品能力；插件准入原则见 `../agent-plugin-runtime/` |
| `model-context-*` | 旧上下文压缩方案和已退役的 DuckCoding 文字模型方案 | 当前模型架构见 `../model-context/agent-multi-provider-llm.md` |
| `tool-system-agent-todo-tools.md` | v1 Todo 工具方案 | v2 Todo durable events 见 `../agent-plugin-runtime/agent-spec-agent-and-subagent.md` |
| `agent-kairos-*`、`front-Kairos监控页规范.md` | 已删除的 Kairos Runtime、Prompt、通知和监控页 | 当前不提供 Kairos 产品入口 |
| `lab-*`、`prototype*.html` | 暂停的 Lab 产品、Runtime、版本路线和原型 | 当前不提供 Lab 产品入口 |
| `evaluation-agent-evaluation.md` | 旧评估 CLI 与独立评估仓库边界 | 当前 CLI Host 入口为 `apps/cli/`；独立评估仓库按自身契约维护 |
| `model-context-agent-cache-loss-audit.md` | v1 Cache Audit sidecar 与低缓存排障目录 | 当前观测只从 Journal request snapshot / usage 派生 |
| `execution-safety-*` | v1 Bash、动态 allowlist、ApprovalGate 与暂停恢复实现 | `../execution-safety/README.md` 与 `../agent-plugin-runtime/agent-spec-tool-runtime-abi.md` |

## 归档约定

归档文件直接平铺在本目录，文件名前缀保留原专题，避免与当前专题混淆。历史 execution plan 和 history 可以继续引用这些文件，但引用只表示当时的设计依据，不表示当前实现仍然遵循该方案。
