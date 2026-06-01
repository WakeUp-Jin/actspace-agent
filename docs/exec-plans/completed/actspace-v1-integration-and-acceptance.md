# actspace V1 集成与验收计划

## 目标

定义 `actspace` 首版从桌面壳、Agent 运行层到工作台 UI 的端到端集成路径和验收标准，确保“可运行骨架”不是孤立模块，而是真正能完成一次本地 Agent 回合的系统。

## 范围

- 包含：
  - IPC 通道命名与职责
  - 本地数据目录与 `jsonl` 布局
  - 启动流程
  - 端到端验收场景
  - 失败模式与最小回退策略
- 不包含：
  - 云端部署
  - 远程同步
  - 生产监控平台
  - 多用户协作

## 背景

- 相关文档：
  - `docs/exec-plans/active/actspace-v1-foundation.md`
  - `docs/exec-plans/active/actspace-v1-agent-runtime.md`
  - `docs/exec-plans/active/actspace-v1-workbench-ui.md`
  - `docs/design-docs/front-index.md`

## 本地数据目录

- 应用数据根目录：
  - `sessions/`
  - `tmp/`
  - `logs/`（可选）
- 每个会话目录：
  - `meta.json`
  - `session.jsonl`
  - `attachments/`

## `jsonl` 文件布局

- `session.jsonl` 每行一个 `SessionEvent`
- 至少支持：
  - `user_message`
  - `assistant_reply`
  - `thinking`
  - `tool_call`
  - `tool_result`
  - `diff_preview`
  - `context_snapshot`
- 必须可通过事件流重建中间消息区

## IPC 通道职责

建议最小命名集合：
- `session:list`
- `session:create`
- `session:get`
- `session:appendAttachment`
- `agent:runTurn`
- `context:getSnapshot`
- `file:preview`
- `diff:getSessionDiff`

原则：
- renderer 不直接接触文件系统和 provider
- 所有跨进程返回值都走 shared contracts

## 首版启动流程

1. 打开应用。
2. 初始化数据目录。
3. 读取会话列表。
4. 用户新建会话。
5. 输入消息并可附加文件。
6. 触发一次 Agent turn。
7. 展示：
   - thinking
   - read/search
   - edit diff
   - final reply
8. 写入 `session.jsonl` 和 `meta.json`
9. 刷新或重启后从本地恢复

## 验收命令

- `pnpm install`
- `pnpm typecheck`
- `pnpm dev`
- `pnpm build`

如果后续加入测试脚本，还应补充：
- `pnpm test`

## 验收场景

- 空会话启动
- 新建会话后首条消息发送
- 有附件输入
- 一次完整包含：
  - `thinking`
  - `read/search`
  - `edit diff`
  - `final reply`
- Context popup 正确显示 token 与分类统计
- 点击文件引用后可打开右侧预览
- 重启应用后旧会话可恢复

## 失败模式与回退

- provider 错误
  - UI 显示失败态
  - turn 写入失败事件
- 工具调用失败
  - 保留 tool error event
  - 不阻断 session 落盘
- session 写盘失败
  - UI 提示本地持久化异常
  - 运行态结果仍可临时展示
- renderer 与 main 不同步
  - 以 main 侧 session store 为真源
  - 提供 reload session 能力
- 非法附件或不存在文件路径
  - 返回可解释错误，不写脏事件

## 风险

- 风险：前后端各自可运行，但端到端链路断裂
  - 缓解方式：所有验收围绕“一次真实 turn”组织
- 风险：session event 与 UI 组件语法对不上
  - 缓解方式：在 shared contracts 里显式编码事件结构
- 风险：错误状态没有落盘，重启后无法追溯
  - 缓解方式：失败事件也要进入 `jsonl`

## 里程碑

1. 固定 IPC contracts 与 session layout。
2. 打通一次真实 turn 的端到端链路。
3. 完成本地恢复和错误场景处理。
4. 通过可运行骨架验收。

## 验证方式

- 命令：
  - `pnpm install`
  - `pnpm typecheck`
  - `pnpm dev`
  - `pnpm build`
- 手工检查：
  - 按启动流程完整走一遍
  - 验证所有关键 UI 组件渲染
  - 验证 session 恢复
- 观测检查：
  - IPC request/response 日志
  - provider 调用日志
  - session write/read 日志

## 进度记录

- [x] 固定 IPC 通道和 shared contracts。
- [x] 固定本地 session 目录与 `jsonl` 布局。
- [x] 打通完整首版 turn。
- [x] 验证 Context popup 数据。
- [x] 验证右侧文件预览与 session diff。
- [x] 验证失败场景与恢复能力。

## 决策记录

- 2026-05-21：首版验收线定义为“可运行骨架”，必须能完成一次真实 Agent turn，而不是只启动空 UI。
- 2026-05-21：所有失败模式都优先要求可解释、可追溯，而不是静默吞掉。
