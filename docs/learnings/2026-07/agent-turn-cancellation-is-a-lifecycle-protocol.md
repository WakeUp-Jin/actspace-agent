# Turn 终态协议：取消、空结果、拒绝调用都要完成结算

合并自五篇：Agent Turn 取消是生命周期协议（原 HTML，已转 md）、为什么停止任务也需要返回结果、空结果也需要完成事件、拒绝工具调用也必须完成协议结算（重试尝试的终态见 [LLM 重试与错误契约](20260705-streaming-llm-retry-layer-choice.md)）。主线：**每个被接纳的单位（turn、request、tool call）必须恰好有一个终态，终态是持久事实，不是最后一条消息的属性或页面内存**。

## 1. 取消是一份跨层协议，不是一个 boolean

一次 Stop 跨过 UI、IPC、审批等待、工具进程、Agent loop、持久化：Renderer 恢复输入框 → Main 找到当前 turn → Approval 结束等待 → Executor 停止前台进程 → Storage 记录终态。任何一环没观察取消，用户感知“卡住”；任何终态没落盘，重进会话感知“历史丢失”。只在某一层设 boolean（`abortButton.onclick = () => agent.abort()`；`status = lastAssistant.stopReason`；`ui.push("Stopped")`）只能“看起来停止”：审批 Promise 仍可能等到超时、最后一条消息可能仍是 `toolUse`、Stopped 只在当前 renderer 内存里。

三个不变量：
1. **取消作用域一致**：同一 turn 的 Agent、pending approval、前台 executor 观察同一个取消事实（`abortTurn(turnKey) { agent.abort(); approvals.abortTurn(turnKey) }`）。
2. **终态独立建模**：aborted 是 turn 的状态，不是最后一条 assistant message 的属性；`result.status = "aborted"`，`append({ type: "turn_aborted" })`。
3. **UI 从事实恢复**：streaming state 只用于运行中展示；完成、失败、中止都回到持久化 SessionRecord，`ui.reloadSession()`。

竞态：用户点 Allow 的同时点 Stop。registry 让 pending entry 只被第一次有效 decision 消费；scheduler 拿到 Allow 后也要在启动 executor 前再查一次 signal——“入口检查 + 等待后复检”适用于锁、队列、网络授权等一切异步门禁。后台任务：Bash 一旦转为 background task，生命周期就不该再绑定原 turn，否则用户停止下一轮会误杀长期任务。abort 发生在第一条模型回复之前，系统也要返回合法终态而不是抛“没有 assistant message”。

## 2. 取消也要返回结果；取消不吞故障

Run 可成功、失败、被取消。AbortSignal 底层常用异常跳出，但“中断机制”与“任务最终结果”是两层。Loop 已把 aborted 终态写入日志却继续向上抛取消异常，调度器可能只记 cancelled 而没有结果；客户端适配层要求每个结束的 Run 有结果，就把用户正常停止误报失败——消息显示“已停止”、侧栏显示“失败”，两处各自忠实反映了不同层收到的信息。

正确顺序：中断当前请求 → 关闭未结算的 step/turn → 持久化 checkpoint → 返回含 Run 身份与 `reason: "aborted"` 的结构化结果（可无完整文本，不能缺结束原因）；上层据此持久化 cancelled 并向客户端返回停止状态。例外：写终态/checkpoint 失败不能包装成正常停止，要继续抛持久化错误，阻止调度器基于未可靠保存的状态继续；已进入 durability blocked 的会话同样不能报告收尾成功。

贯穿调度层：执行器已把正常取消转成返回值，调度器就不能在 catch 里仅看 `signal.aborted` 吞掉所有异常——取消与故障可同时发生，异常可能是 checkpoint/清理失败；执行前的信号中断（可取消接纳）与执行开始后的故障（保留失败事实）要区分。取消的身份：一次调用绑定一个 task/run，调用返回延迟时会话可能已执行下一任务，处理旧调用的取消应查询原任务对应的 Run，不是“会话当前活跃的 Run”；测试要构造“原任务已完成、后续 Run 活跃、旧调用仍未返回”的时序。验证三条路径：正常停止有结果且不发错误通知；取消遇结算失败仍抛错；真实客户端停止后不刷新也显示正确状态。

## 3. 空结果也需要完成事件

结果载荷与操作是否完成是两个维度。模型成功返回空字符串仍完成了一次请求；只在非空时记录消息，会留下永远没有终态的请求。关系：`request/header → assistant/message → step/end → turn/end`，`assistant/message` 同时承载内容与请求终态，即使 `content=[]` 也要保留 request 身份、真实结束原因、用量，否则下一步结束时校验器看到的仍是 open request。反例：`if (output.content.length > 0) await appendAssistantMessage(output); await endStep();`——把“有内容”当“需要结束请求”的条件。让生命周期由请求完成决定，让内容照实为空；不补造文字，不关闭关系校验掩盖缺失终态。

验证：空值与关系同时检查——正常完成、终态恰好一次、结束原因与用量准确、终态先于 Step 结束、下一轮仍能写入；再从持久事件冷重放确认关系闭合。父任务退出成功不足以证明子任务成功（父任务可能接到失败工具结果后继续完成），要分别查子任务终态、父工具状态、最终父任务结果。消费制品：领域包测试与构建通过后，生产入口可能仍加载 Runtime 预打包的旧实现；测试绿、源码新、运行中的实现新是三份不同证据（BUG-049，[修复记录](../../histories/2026-10/20261022-0746-acceptance-small-fixes.md)）。同理适用于空查询、零行导出、无改动操作。

## 4. 拒绝的工具调用也要完成协议结算

工具没执行不代表能从对话协议里消失：模型返回带 call ID 的工具调用后，后续请求必须提供对应结果，否则 provider 判整段历史不完整，下一轮普通文本也可能失败。顺序：记录调用 → 判断权限 → 写入明确拒绝结果 → 继续；权限拒绝是一种工具结果，不是跳过结果的理由。批次里一个调用不允许而选择整批拒绝，就要为整批每个 call ID 都写结果，并证明执行次数为零。

历史上已缺结果：不伪造成功，也不为续聊删原日志；在请求投影层补充“没有记录结果、执行结果未知”的反馈，保留原 Journal 用于诊断。这与新调用的明确 denied 不同——旧历史缺记录不能证明从未执行。验证：越界无副作用、每个 call 都有结果、下一轮可继续、旧历史可恢复、正常结果不重复；只测“权限检查抛错”会漏掉整个对话被损坏的后果。

## 自检

1. abort 发生在第一条模型回复之前能返回合法终态吗？approval 刚返回 Allow 时 abort 仍能阻止 executor 启动吗？
2. 应用重启后 Stopped 从事件事实恢复，还是靠上一次页面内存？
3. 消息显示“已停止”而侧栏显示“失败”，说明哪一层没拿到结果？
4. 拒绝一个调用后，下一轮请求里每个 call ID 都有对应结果吗？

来源：`docs/histories/2026-07/20260717-1601-fix-turn-abort-recovery.md`，及 2026-09/10 取消、空结果、拒绝调用相关修复。
