# Bash 前缀授权执行摘要

状态：功能实现完成；真实 Electron 后端链路未验收。未提交。

## 已实现

- pnpm/npm/yarn/cargo/go/make/tsc/vitest/eslint/prettier 程序级，以及 git status/diff/log/show 子命令级会话授权。
- 复杂 shell 语法、参数排除项、显式 no_sandbox 和工作区外 cwd 不复用；既有硬拒绝优先，未扩展沙箱。
- Session/Agent/audience/version/workspace 边界、签发与使用审计、恢复、撤销、workspace 变更回收；执行前资源和授权复验。
- 前端正式类型与 requestId 绑定建议；approval-prefix 显式 mock。

## 验证

- runtime/client 依赖闭包构建、完整 typecheck 通过；最终局部类型检查通过；Desktop renderer + Electron/preload 完整构建通过（保留既有 chunk 大小及 CSS highlight 警告）。
- 审批相关前端定向测试 25 个通过。
- 后端：shell-tools 70、tools-runtime 32、journal 14、projection 14、agent-service 33、core-agent-loop 37、agent-host 44、runtime 54 个测试通过。
- contract matrix 生成与测试、packages、harness-events 检查及测试、IPC、renderer bridge、前端 token/主题、docs/current-docs 通过。
- Desktop 首轮全量 1711 通过、21 失败、2 跳过（8 个文件失败），包含多项超时及后续 DOM/context 异常。降低到 2 workers 后全量结果为 1726 通过、6 失败、2 跳过（3 文件失败）：消息流 4 项超时、2000 事件 IPC 1 项超时、workspace watcher 1 项断言失败。单 worker 隔离复测（未调整超时阈值）中，消息流和 IPC 相关选择用例全部通过；workspace watcher 仍失败，位置 `apps/desktop/src/main/test/review-workspace-watcher.test.ts:66`，断言所有回调参数均为字符串，实际含无参数回调。该模块未被本轮修改，未确认基线是否已有此问题，不扩展修复范围。因此桌面全量门槛仍未通过。
- [Computer Use 逐项报告](computer-use-acceptance.md)：mock 三按钮操作、提示文案、浅深主题、480px 通过；真实 Electron 使用另一 checkout，本轮真实授权 IPC、复用、重启恢复与新会话隔离未覆盖。日志恢复和身份隔离的自动化证据不能替代实机验收。

## 交付边界

仓库原有上下文引擎、清理和 UI 改动保留。真实 Electron 验收需启动本 checkout 的应用并使用独立测试会话；未中断其他工作区运行中的应用。授权包含项目脚本，不是沙箱或只读保证。

## 对照原计划验收点

子报告编号为局部操作编号，下表对应方案原始 A1–A7，避免混淆覆盖范围。

| 原计划 | 结果 |
| --- | --- |
| A1 首次/单次/拒绝 | mock UI 通过；真实执行未覆盖 |
| A2 同前缀复用/不同程序 | Runtime 自动化通过；真实 Electron 未覆盖 |
| A3 git 子命令隔离 | 工具规则与匹配自动化通过；真实 Electron 未覆盖 |
| A4 复杂/排除/no_sandbox | 工具规则、symlink 和 Runtime 自动化通过；真实 Electron 未覆盖 |
| A5 主题/窄窗/异常状态 | pnpm 三按钮浅深/480px通过，提示属性通过；长前缀/忙碌及真实失败交互未覆盖，建议请求失败由单测覆盖 |
| A6 恢复/新会话 | Journal 恢复与身份匹配单测通过；Electron 重载/重启未覆盖 |
| A7 撤销/切工作区 | Runtime 与 application 单测通过；真实 API/UI 场景未覆盖 |
