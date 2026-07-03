# Plan 03：E4 输出订阅与卡死看门狗

## 目标

补齐常驻后台进程的两类事件回流：`notifyOnOutput` 输出订阅（dev server「ready / 编译报错」这类中途事件，进程永不退出、终态通知覆盖不到）和交互式卡死看门狗（命令阻塞在 `(y/n)` 类提问时通知模型）。

## 范围

- 包含：bash 参数 `notifyOnOutput`、订阅匹配引擎（增量扫描 + debounce）、看门狗（输出停滞 + 尾行模式双条件）、通知类型扩展（`output_match` / `stalled`）、工具描述引导。
- 不包含：沙盒（E5）；PTY / 交互输入支持（设计文档已排除，看门狗只通知不代答）。

## 背景

- 相关文档：设计文档「三个事件源」表、「模型引导」节。
- 相关代码路径（全部是 Plan 02 产物，本计划开工前先确认已合入）：
  - `packages/agent-core/src/tools/tools/bash/task-registry.ts`（BashTask、通知队列、`formatTaskNotification`）
  - `packages/agent-core/src/tools/subprocess/run-process.ts`（`spawnDetachedProcess` 输出写盘回调处）
  - `packages/agent-core/src/tools/tools/bash/definition.ts` / `executor.ts`
- 已知约束：
  - 匹配必须在输出写盘的数据流上做增量扫描（不能定时重读整个文件）；跨 chunk 的行需要行缓冲。
  - debounce 最小 5_000ms（设计文档），同一订阅在 debounce 窗口内只通知一次。
  - 看门狗两条件缺一不可：≥ 45s 无输出增长 **且** 尾行匹配交互提问模式（`[yY]/[nN]`、`Press Enter`、`password:` 等），避免慢构建误报。

## 风险

- 风险 1：模型写出灾难性回溯正则（ReDoS）拖死主进程。
  - 缓解：pattern 长度上限 256；编译失败直接工具报错；匹配在行级、行长截到 4KB 再匹配。
- 风险 2：订阅通知风暴（如每行都匹配）。
  - 缓解：debounce 下限强制 5s + 单任务未消费通知队列上限（保留最新 20 条，丢弃时计数）。

## 任务

1. `definition.ts` + `executor.ts`：接受 `notifyOnOutput { pattern, reason, debounceMs? }` 参数，校验（正则可编译、reason ≤ 5 词、debounce ≥ 5000 clamp），存入 BashTask。仅在任务实际转后台时生效；前台完成的命令忽略订阅（输出已全量返回）。
2. `task-registry.ts` 订阅匹配：在 `spawnDetachedProcess` 的输出回调链上挂行缓冲扫描器——按行匹配 pattern，命中且过 debounce → 入通知队列（status `output_match`，`summary` 带 reason 与命中行）。
   - 验证：单测——脚本每 100ms 输出一行，订阅 `ready`，命中后收到一条通知，5s 内重复命中不加条。
3. 看门狗：registry 内每任务一个 45s 定时器，输出回调即重置；触发时读落盘文件尾行，匹配交互提问模式集合才入队（status `stalled`，summary 引导「bash_kill 后改用非交互参数重跑」）。
   - 验证：单测——`read -p "continue? (y/n) "` 类脚本（或 mock 定时器 + 尾行 fixture），45s（fake timer）后收到 stalled 通知；纯慢速无输出脚本不触发（尾行不匹配）。
4. 工具描述与模型引导：definition 描述补「dev server / watcher 用 `blockMs: 0` + notifyOnOutput 订阅就绪或报错日志；禁止 sleep 轮询」。
5. 前端：`bash_task_update` 事件的 status 联合类型加 `output_match` / `stalled`（shared），BashRunBlock 徽标区分显示；订阅 reason 显示在块上（用户知道模型在等什么）。

## 验证方式

- 命令：`pnpm typecheck`；`pnpm test`。
- 手工检查（`pnpm dev:log`）：让 agent 用 `blockMs: 0` + `notifyOnOutput: { pattern: "ready", reason: "dev server ready" }` 启动本项目 dev server，确认 ready 日志出现后下一轮对话收到 `output_match` 通知。
- 失败回退：订阅与看门狗都是 registry 内附加物，可独立禁用（不注册扫描器/定时器）而不影响 Plan 02 功能。

## 进度记录

- [x] 任务 1 参数接入（executor `parseNotifyOnOutput` 校验：正则可编译、长度 ≤ 256、reason 必填、debounce ≥ 5000；permissions sanitizedArgs 透传）
- [x] 任务 2 订阅匹配（`output-monitor.ts` TaskOutputMonitor：行缓冲增量扫描、debounce、attach 前命中暂存上限 20 条并在转后台时补投）
- [x] 任务 3 看门狗（45s 无输出 + 尾行匹配交互提问模式双条件；每静默期只报一次；输出恢复发 stall_recovered 复位前端徽标）
- [x] 任务 4 模型引导（definition 描述补 notifyOnOutput 用法与禁止 sleep 轮询）
- [x] 任务 5 前端状态（shared BashBackgroundStatus 增加 "stalled"；main subscribeNotifications 推送；BashRunBlock 徽标「疑似等待输入」）

验证结果：`bash-output-monitor.test.ts` 8 用例（fake timers）+ `bash-background.test.ts` 订阅集成 3 用例全绿；全仓 typecheck 通过。

实现偏差记录：
- 尾行检查用内存中的行缓冲（monitor 自己维护 lastCompletedLine / 未完成行），不读落盘文件——交互提示通常无换行结尾，文件尾行反而拿不到未完成行。
- output_match 不推前端徽标（转瞬即逝且 running 态未变），只有 stalled / stall_recovered 推 `bash_task_update`。

## 决策记录

- 2026-07-03：订阅只对后台任务生效；前台完成的命令输出已全量回填，订阅无意义。
- 2026-07-03：看门狗触发不自动 kill，只通知——决策权留给模型（可能确实在等一个慢步骤）。
