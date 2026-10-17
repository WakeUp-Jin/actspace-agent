# 执行摘要

状态：实现、定向工程验证及真实 Electron A1–A7 验收完成。用户已授权提交、推送修复分支并创建 PR，合并由用户审核后执行。

## 已实现

- 完全权限下通过既有硬规则的 Bash 自动执行；自动模式保持审批/前缀授权。
- 等待中切换模式：按 requestId 关闭旧请求并重新评估，保留拒绝/过期优先级，执行前再次检查模式。移除 Desktop 切换前将请求提前标为 timeout 的旧路径（真实 UI 发现后补回归）。
- 取消在异步准备期间发生时，不再创建 Bash 子进程。
- 权限说明、设计规范、回归与隔离验收 Provider 场景同步更新。

## 工程证据

| 检查 | 结果 |
| --- | --- |
| Shell | 75/75 通过，含真实沙箱/非沙箱、后台输出/终止、前台取消 |
| Tool Runtime | 38/38 通过，含等待切换、拒绝/过期/取消竞态、硬拒绝复查和执行前降权 |
| Desktop 定向 | 10/10；另有审批恢复/远端审批 12/12，通过 request 清理隔离、权限菜单、恢复与停止路径；另有 registry/Broker 9/9（含重复 3 项），覆盖切换不提前 expireAll |
| Agent Host 审批 | 2/2 通过 |
| Runtime 全量 | 55/56；tool-composition 在 15 秒超时。原始 26175b4d 独立源码副本同样失败，非本次引入 |
| Desktop | build、typecheck 通过 |
| Runtime/CLI 依赖构建 | 通过；Tool Runtime/Shell typecheck 通过 |
| 文档检查 | 314 个旧验收图片缺失链接；本次变更文档未在失败列表 |
| diff 格式 | 通过 |

先失败后通过的回归：完全权限判断、审批等待中切换、取消前 spawn。测试与构建无并发清理依赖产物时通过；首次 Desktop 类型检查恰遇 shared 重建，顺序重跑通过。

## 原现场边界

原用户仓库 git status 超时未复现。隔离仓库真实 printf/git status 在几十毫秒内返回；空仓库 git log 返回 128，沙箱阻止 git init 写 .git/config 属既有保护。不能宣称原现场超时已修复。完全权限仍保留 Shell 硬拒绝与沙箱，含格式字符串中的管道字符拒绝也未调整。

## 界面验收

按[计划](../../exec-plans/completed/20261017-bash-full-access.md) A1–A7，由 gpt-6.1-sol 操作真实 Electron，使用隔离数据和确定性 HTTP Provider。它验证真实 UI/IPC/工具链路，不证明真实模型服务。逐项结果见[验收记录](acceptance.md)。真实交互已覆盖自动允许/拒绝、完全权限连续运行、等待中切换恢复、硬拒绝、后台输出/终止、停止待审批、刷新保持与会话权限隔离。原始 A3 曾因 Desktop expireAll 失败，修复并重启后复验通过。

验收使用的隔离 Electron、Provider 与 Agent Host 已关闭，测试数据保留。摘录的工具/权限事实见 [Journal 证据](journal-evidence.json)，不包含请求上下文或凭据。

## PR 交付检查

- 同步 2026-10-17 用户更新日志；站点 23/23 测试及构建通过。
- `npm run ci` 在文档检查阶段遇到同样的 314 个历史图片缺失链接，后续步骤未执行，不宣称基础 CI 全绿。
- 本次仅提交源码与文档，推送 `codex/bash-full-access` 并以 `main` 为目标创建 PR；没有版本发布或自动合并。
