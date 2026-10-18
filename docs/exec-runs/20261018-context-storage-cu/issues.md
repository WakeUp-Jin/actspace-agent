# 联合验收问题

首次验收只记录、不修改业务代码。后续用户已授权修复 CU-01/CU-02，修复记录见下文。界面由 gpt-6.1-sol 在真实 Electron 中操作；使用回环测试 Provider。

## CU-01：自动压缩时无法通过前端取消（P2，已确认）

- 场景：Context 自动压缩已进入摘要模型请求，Provider受控保持响应。界面显示“正在总结较早的消息”。
- 复现：发送 FIXTURE_LONG；第1个 read_file 完成后跨过阈值；摘要响应保持；查看 Composer 停止入口，并按 Escape。
- 实际：停止按钮灰色，AX明确disabled，名称“正在压缩上下文，压缩完成后可继续”；Escape后仍在压缩。用户不能主动取消慢摘要，只能等请求完成/超时。
- 预期：后端已支持取消信号，前端应提供可用的取消入口，并正确结算运行与队列；不应继续沿用“压缩不可中止”的界面假设。
- 位置：`apps/desktop/src/renderer/components/composer/ComposerToolbar.tsx:48` 的 stopBlockedByCompaction，50行参与 disabled；`apps/desktop/src/renderer/session/active-session-context.tsx:18` 注释仍声明停止置灰。后端 `packages/core/agent-loop/src/loop.ts:398` 已传 signal。
- 证据：本地 [压缩等待截图](evidence/c2-compaction-hold.png) 与同名AX文本（由CU执行者保留）。主机确认 Provider 请求14为真实摘要调用，工具结果与Step已完成，非普通模型等待。
- 影响：C3取消子项失败；取消后的队列、状态和持久化结算无法从当前UI执行，因此未覆盖。

## OBS-01：附加图片后再输入文字的首次发送未带附件（待复现）

首次操作曾看到 valid.png 已附加，随后发送文字时 task.original.attachments=[]、Provider hasImage=false、无正式附件。第二次原生选择图片后直接点击发送图片-only，UI、正式artifact、JSONL引用及模型图片输入全部成功。两次输入顺序不同，且首次未保存发送前同屏证据，不能认定已确认的产品Bug；保留待复现，不能归因于存储重构。

## CU-02：自动压缩失败后，回合结束界面没有持续提示（P2，已确认）

- 场景：已成功压缩一次的会话，再发送 FIXTURE_LONG；将本地摘要服务设为HTTP400，工具正常完成。
- 实际：主机记录请求16–27中6次摘要调用，均为受控HTTP400。主运行完成后，真实界面显示第7轮19步、Fixture completed、Context约23K/70%，没有持续的“压缩失败”或重试提示。未实际观察错误提示从运行态消失，不能将“消失过程”写成已验证。
- 预期：自动压缩失败应让用户在运行结束后仍能知道失败原因和恢复方式；正常回答完成不应掩盖压缩未成功。
- 定位：`packages/client/src/live/live-run.ts:180` 将失败块存入activeCompactions；`apps/desktop/src/renderer/App.tsx:793` 完成后释放live run；`apps/desktop/src/renderer/session/task-queue.ts:80` 仅为手动操作保留compactionFailure。此为源码关联解释，未在本轮修复。
- 证据：本地 [失败终态](evidence/c3-auto-failure-final.png) 与同名AX文本；Provider请求16–27及JSONL终态为主机运行时证据。
- 影响：C3失败可见性子项失败；运行正常结算，没有发现此场景死锁。

## 后续修复与回归

- CU-01：按取消能力决定停止入口。自动压缩保留 `onAbort`，独立 `/compact` 不暴露无效的 Run 取消动作；取消中与 Host 不可达保护保持。
- CU-02：从已归并的压缩 live block 同步对应 Session 的 `compactionFailure`，释放 live run 后仍可展示；下一次压缩状态更新或发送新消息时清除旧提示。忽略不匹配与已终结 Run 的压缩事件，不新增持久化格式。
- 新回归测试在旧代码上出现 4 项预期失败；修复后 193 项相关前端测试、8 项后端自动压缩测试、Desktop 类型检查通过。
- 真实界面复验见 [修复复验](bugfix-computer-use.md)。保留上方原始失败证据，不把首次验收回写成通过。
