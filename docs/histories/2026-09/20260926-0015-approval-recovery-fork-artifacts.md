# 2026-09-26 00:15 | 审批恢复与 Chat fork 修复

## 用户诉求

修复实机验收发现的审批重载后卡片/停止丢失、Chat fork 首次发送写锁错误；随后确认采用复制附件的简单方案，解决带附件 fork 的会话归属错误。

## 改动

- pending approval IPC 补足运行与工具预览信息；Renderer 重建审批运行状态，拒绝和停止后正常收尾，防止过期查询复活卡片。
- Desktop fork 释放临时 Store writer，通过 Controller 接管，避免首次发送重复获取 lease。
- JSONL fork 按边界复制引用制品，去重生成新 ID，并替换 data/surface/请求快照中的结构化引用。
- DesktopArtifactStore 提供校验归属与完整性的复制接口；副本 owner 属于子会话。
- 独占新目录；可捕获的文件复制或 Journal 写入错误触发副本/目录清理；清理失败明确报告。保留原父会话及旧失败子会话。

## 关键文件

- `packages/session/persistence/src/session-persistence.ts`
- `packages/session/persistence/src/test/fork-artifacts.test.ts`
- `apps/desktop/src/main/runtime-v2/artifact-store.ts`
- `apps/desktop/src/main/test/runtime-v2-artifact-store.test.ts`
- `packages/desktop-app/src/service.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`

## 验证与范围

前轮定向 46 项通过；附件续修持久化 45 项、制品 3 项、writer 1 项通过。Desktop 类型检查、Electron 构建通过。Computer Use 已实测重载拒绝/停止、纯文本与带附件首次 fork 发送、图片预览、重载与再次 fork 发送。完整权限矩阵和真实长上下文压缩不在本修复签收范围。

取舍是用独立文件空间换取父子隔离与简单生命周期；未引入共享引用计数或旧会话迁移。命中可迁移、陷阱与模式，学习记录见 [Fork 的文件所有权](../../learnings/2026-09/20260926-fork-artifact-ownership.md)。

详细证据见 [执行摘要](../../exec-runs/20260925-approval-reload-chat-fork-fixes/execution-summary.md)。
