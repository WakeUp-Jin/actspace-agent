# 流式事件协议：类型要早分、作用域要显式、排序要稳定

合并自：流式事件必须有明确的 Turn 作用域、为什么运行中显示错结束后却恢复正常。

来源：[`20260717-1550-fix-stream-event-turn-routing.md`](../../histories/2026-07/20260717-1550-fix-stream-event-turn-routing.md)、[`20260906-1530-plan-tool-stream-rendering-fix.md`](../../histories/2026-09/20260906-1530-plan-tool-stream-rendering-fix.md)

同一段会话有两个读取入口：运行时消费增量事件、完成后从持久化记录重建。两条路径语义不同时，“最终状态正确”证明不了“实时过程正确”。流式事件需要三层约束：类型、作用域、排序。

## 1. 类型要在最早知道的地方保留

工具参数被流式收集器标成正文，前端把 JSON 交给 Markdown；完成后 Journal 里的 `assistant/message` 和 `tool/result` 是结构化的，重新投影就恢复正常——问题在事件分类与桥接，不在 Markdown 渲染器。text、reasoning、tool arguments 必须在源头分开；不要在前端用正则删“看似工具参数”的 JSON（合法正文也可以是 JSON）。执行层发送事实，Host 把事实变成预览，React 只渲染预览；运行中和历史共用一个预览构建器，调用者提供不同阶段：生成参数不代表开始执行，审批通过也不代表完成，只有实际执行和结果提交才产生对应事实。

## 2. 作用域：订阅生命周期不绑请求 Promise，事件带 `sessionId + turnId`

实时文字出现 `TheThe sandboxbox` 逐 token 重复时先别怀疑模型复读，更常见的是同一广播事件被多个存活订阅者消费并写入同一份可变 UI 状态：

1. Turn A 开始，注册监听器 A；2. A 等待工具审批，Promise 未结束，A 仍存在；3. 用户切换会话，UI 改成“未运行”但没销毁 A；4. Turn B 开始，注册监听器 B；5. Turn B 的 `text_delta` 被 A 和 B 都收到，向同一字符串追加。

文本是追加语义所以重复；工具卡片按 `toolCallId` 做 Map upsert，重复事件只会覆盖同一对象——“文字重复、工具不重复”是有价值的诊断信号。错误：`const unsubscribe = stream.subscribe(appendDelta); try { await invokeAgent() } finally { unsubscribe() }`，把广播订阅生命周期绑在请求 Promise 上，请求可暂停、后台继续、与其他请求重叠时监听器数不再等于当前可见 turn 数。

稳定模式：组件/应用生命周期内只订阅一次；所有 turn 级事件携带 `sessionId + turnId`，消费者不靠闭包猜归属：

```ts
useEffect(() => stream.subscribe((event) => {
  const active = activeTurnRef.current;
  if (!active || event.sessionId !== active.sessionId || event.turnId !== active.turnId) return;
  applyEvent(event);
}), []);
```

后台任务状态在 turn 结束后仍可能变化，可只用 session 级作用域，但要把这个例外写进协议。只过滤 delta 不够：旧请求的结果恢复与 `finally` 也可能在新 turn 启动后执行，所有会覆盖共享界面的异步继续点（IPC 返回后恢复 session record、catch 里设失败、finally 里清 streaming blocks/busy/工具计时器、延迟 timer 更新工具完成状态）都要同样的身份检查 `isCurrentVisibleTurn(sessionId, turnId)`。

## 3. 排序：提交顺序与到达顺序

- **提交顺序**：并行工具后发先完成时，确定性的 Journal 仍可按调用顺序提交；移除整批等待屏障能改善首个结果延迟，但消除不了前序提交等待。要区分 body 结束与可恢复的结果事实。
- **到达顺序**：前端可能先收到结果、后收到迟到的进度或审批。用稳定的 `callId` 更新同一条目，让终态优先；结果事件自身必须能创建条目。

## 验证

用真实执行循环、内存 Session、假模型串起整条转换链，在工具函数、工具结果、下一段正文之间放可控停顿，分别检查：参数没进入正文、工具已出现、单个结果停止运行状态、最终重建没有重复条目。竞态回归要同时验证：Turn A 未结束时启动 Turn B，底层只有一个 stream listener；B 的单个 delta 只出现一次；A 的迟到事件不进入 B；A 完成后 B 的内容和运行状态仍在。只测“正常单 turn 显示文字”和只手工发 `tool_started/tool_finished` 给组件，都绕过了最易出错的生产链路——bug 的前提正是两个生命周期重叠。

## 自检

1. 模型只在 done 返回工具时会有工具行吗？进度晚于结果会重新闪动吗？展示订阅者抛错会让成功工具变失败或重试吗？
2. 广播订阅生命周期绑在了请求 Promise 上吗？旧 Promise 的结果与 `finally` 做过身份隔离吗？
3. 并发与切换类 bug 有交错时间线测试吗？
