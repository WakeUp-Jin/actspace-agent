# 上下文验收问题修复过程

- 用户批准跨包修复计划；保留原 Session、验收数据及未提交实现。
- B8：新增聚合超限/重开/去重用例先复现 DURABILITY_BLOCKED，再将投影改为独立不可变 JSON 快照。追加 envelope 超限用例，确认验证回滚不应封锁 Ledger；仅对未 append 且 seq 未变的 INVALID_EVENT 放行，其余持久失败仍封锁。原故障 Journal 只读重建得到 revision254、5任务、1097120字节、1个 pending，原始数据未改写。
- B2/B3/B4/B5：行号路径、真实 Cordis 包装存储、摘要索引排除、旧周期读取四个用例先失败后修复。新增 indexPaths 可选字段，空 fact 与 compaction/end 恢复边界；正在补实际工具事件恢复覆盖。
- B6：实际 Cordis root + 已打开 Session + 空 Agent registry 的测试复现“目标会话尚未就绪”。目标绑定改为 Session，读取扩展要求明确 main descriptor。空闲开启、跨 Run 保留、关闭及其他会话隔离测试通过。
- B9：256K/50%/60660输入用例先误触发，再按实际容量修正；独立缓存桶只累加一次，reasoning 不叠加。覆盖模型容量变化、未知容量和保留空间上限。
- 构建 Runtime 依赖闭包通过；9个受影响包 typecheck 通过。Context、Compaction、English、AgentLoop、AgentService及 Runtime 定向测试通过，后续新增覆盖继续执行。
- pnpm dev:log 启动全新隔离桌面，复制已授权模型配置，未使用旧持久 Harness。gpt-6.1-sol 子智能体负责实际操作，主 Agent 核对三阶段值。仅临时、环境变量控制的日志，不记录 credential；最终移除。

## 同类调用点核查

- snapshotSessionJson：task event/content/config、Journal envelope/header均为单记录，保留限制；唯一累计投影调用已改。
- 路径候选入口：observe、prepare、hydrate/applied统一排除索引；工具读取事实按seq去重。
- PromptExtensionRegistry：原精确scope注册保留，Session注册只有明确main reader可见，utility/子Agent不匹配。
- 自动压缩：生产Loop、Context coordinator、CompactionPlugin共用实际预算；手动compact继续同一事务入口。

## 候选调查

B1 旧 Journal 只有 accept/pause/resume/pause、没有Run；当时日志缺少具体错误。源码只说明 acquiring 阶段持久 Harness/锁失败可产生这一序列，不能据此确认哪一个原因。新隔离环境首请求已成功，旧候选不作猜测修复。

B7 既有输入最后 user 正确且最终答复完成；尚未发现转换或调度错误。真实短复验与数据检查继续进行，不移除历史或篡改提示词来掩盖模型推理。

## 第一轮检查结果

- AgentService：5 files / 30 tests；包括聚合超限和 envelope 超限两个红→绿回归。
- Context：原全套7 files / 29 tests通过；新增实际 request/tool 关系的忽略索引重启/fork测试后，disclosure文件19 tests通过。
- Compaction：4 files / 17 tests；English：2 files / 20 tests；AgentLoop：7 files / 37 tests。
- Runtime完整测试：18 files / 51 tests；Prompt：5 files / 8 tests；JSONL：2 files / 5 tests；Storage测试通过。
- Runtime依赖闭包与9个受影响包typecheck通过；contract matrix重新生成，check:docs和diff检查通过。
- 真实B6：闲置开关成功，两次不同主Run的prepared system均有english-learning/v1。前三次实际转换已复算，Context→LlmInput→prepared相等，status替换不改变输出。继续做UI关闭/隔离与路径/阈值组。


## 旧验收数据回放

对原父/子会话的纯内存副本调用 hydrate，发现缓存索引分支返回整个 DisclosureState，补写 indexPaths 时携带内部 Map，JSON 校验拒绝。收窄 sleepingIndex 返回值到 index/indexDigest，增加旧事件没有 indexPaths 的恢复回归。修复后两个原会话分别追加1个派生纠正事件，普通列表没有索引；再次恢复不追加事件、不改变计数。实际原文件不写入，生成测试索引仅在隔离临时目录。

旧 manifest 9分页真实工具输出重新抽取，得到完整 file-001 至 file-106，共106文件。披露测试现20项全部通过。

## 真实路径组的中间证据

会话 `85ea5068-884b-4ba8-94bb-fc9949ff3961` 的首次候选包含106个分页文件、manifest和原Journal，首次applied（seq931）选择100个活跃文件，8个进入睡眠索引。读取索引的fact（seq1172）为空；读取file-106的fact（seq1243）后，该文件仍是sleeping、readsInCycle=1。原Journal直接读取成功（seq1402）；第二次压缩结束seq1575，applied seq1576选择2个本周期读过的文件，其余归睡眠。动态索引未混入system。以上是实际Journal与转换值，非模型自述。

## 重启时新增确认：B10 临时写锁失败被永久缓存

通过开发启动器中断并立即重启后，首次Session打开在旧writer lease的30秒保护期内失败。旧进程已退出，248秒后锁已过期，但UI重试仍得到同一个错误：AgentService将首次openSession失败的Promise永久缓存，重试没有再执行acquire。原B1缺少具体错误，不能把B10直接认定为原B1的原因。

增加并发首次失败→下一次并发成功的用例，修复前失败；随后只清除“尚未取得Session且错误为typed SESSION_WRITER_LOCKED”的缓存。已经取得Session后或其他恢复/持久化失败仍保持阻断，不改变锁保护期、不手工删锁、不自动循环重试。保留drain不会重新打开失败会话的用例，并补持久化失败持续阻断。AgentService现在5 files / 32 tests全部通过。

## B9 真实模型阈值复验

Chat会话 `ef9909bf-d761-4ce7-a9a3-efeb8bc39132` 使用实际Kimi K2.6、contextWindow256000，UI设置50%。先完成短轮，再提交60000个“验”，使历史满足minimumRegionEntries。实际input60535/output63，没有压缩；追加70000字符后，实际input130579/output134，超过128000阈值，成功compaction/end seq270及applied seq271。阈值前后由实际预算与Journal确认。

源码probe已经撤除，Runtime干净构建及AgentLoop37项测试通过。现有隔离实例的不可变验收Harness仍包含probe，继续采集最后的真实值；发布构建不包含probe。

B8同一Chat在压缩后继续60000字符输入，Task累计内容达到1141016字节，Run seq378正常完成；随后短标记也完成（seq430），累计1141244字节。单条输入均合法，真实桌面没有出现累计投影超限封锁。证据见large-input-checks.json。

最终快速重启时，Session已能在保护期后接受消息（seq431），但queue pause（seq432）暴露同类的Harness启动锁边界：SelectionStore锁仍属于已退出PID，超过306秒后HarnessControl仍保留首次STORE_LOCKED。新增两个真实HarnessControl争用同一磁盘锁的测试，先失败，修复后在旧Host释放后并发acquire恢复原revision1，selection没有重复追加。重试只发生在首次STORE_LOCKED，沿现有独占gate执行；文件缺失、契约不一致、日志校验与durability失败仍走原阻断。HarnessControl全部23项通过。B10涵盖Session与Harness两层临时获取失败。

## 最终数据复验

子会话重启请求 `a51681d2-5782-4b47-9913-f95f7a71fadf` 保持cycle2、108路径、active2，只有file-002计数1且仍sleeping，Run seq1776 completed；父seq1577未变。大会话原accept seq431只出现一次，经切换会话刷新队列后继续执行，Run seq479 completed；累计Task内容1141480字节。设置恢复0.8。19次普通请求的Context→LlmInput→prepared复算均一致，status独立、导航位置与文件上限检查均通过。

最终相关测试共227项；Harness新增修复后Runtime51项再次通过。源码及构建产物无临时日志probe；本轮隔离数据和固定验收Harness保留为测试证据。

Computer Use最终确认两条恢复短标记的界面终态后，通过Quit Electron正常退出，目标应用库存为空；开发链路结束。逐项报告已归档，计划移入completed，最终docs/diff检查通过。没有提交、推送或清空验收数据。
