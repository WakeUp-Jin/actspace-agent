# Context 修复后的真实 Electron 复验

日期：2026-10-06。执行者：明确委派的 gpt-6.1-sol Computer Use 子智能体，仅 UI 验收，不改产品代码。定向复验已完成。

## 环境与证据边界

- 主智能体通过 `pnpm dev:log` 构建并启动新实例；CUA 绑定 `Actspace Dev 956e-3624` / `com.actspace.desktop.dev.w3624b697`，窗口标题 `actspace`。
- 新隔离数据根 `/tmp/actspace-context-bugfix-20261006`；未操作旧故障目录、未读取密钥。
- 文件 fixture：`tmp/context-real-acceptance-fixture/manifest.txt`（106行）及编号文件。只读验收，不写 fixture。
- UI 证据为本任务 CUA AX 和内联截图。CUA 没有声明截图文件保存 API，不声称存在本地截图文件。
- 精确 active/cycle/usage/Task 字节与 Context→LlmInput→prepared 对照由主智能体独立核对；下表明确区分 UI 直接所见与数据核对，静态检查不代替真实交互。

## 验收点

1. B2：真实 read_file 九页路径进入披露。
2. B3：当前导航能定位原 Journal 并实际读取前两行。
3. B4：读取 sleeping 索引后连续压缩，索引不成为普通文件。
4. B5：fork 首次组装不重计旧读取；新读仅计一次；父子隔离；重启不重放。
5. B6：闲置目标开启英语，连续两轮持续；关闭撤销；其他会话无泄漏。
6. B8：累计 Task >1MiB 后正常请求、后续提交、重启恢复。
7. B9：实际 Kimi 256K、Chat50%阈值前后，60K不压缩、累计130K压缩。
8. B1/B7：候选补查，不将正常新请求声称旧候选已修复。

## 操作分组

- 英语：建立 `BUGFIX-B6-TARGET-20261006` →扩展能力选择目标→闲置开启→RUN1/RUN2→关闭→OFF请求。文件组独立会话复用其他会话隔离检查。
- 文件：在 actspace-agent 工作区创建父会话→manifest按13行九页 read_file→`/compact`→索引/普通file-106/原Journal导航读取（外部路径逐次允许）→再次`/compact`→GUI右键分叉→子file-002新读取→协调重启→短标记。
- 容量与累计任务：新会话选择 Chat/Kimi K2.6→设置50%→短seed→60K“验”→追加70K→自动压缩→再60K→短标记→阈值重置→协调重启→短标记。
- 重启由主智能体协调，最终由 CUA 正常退出；不清锁、不删除或改写 Journal。

## 逐项结果

| 项 | 状态 | 真实 UI 与数据证据 |
| --- | --- | --- |
| B2 | 通过 | `BUGFIX-B2-FILES`要求1–13至105–106九页，真实完成`BUGFIX-B2-106-PAGED`；手动压缩显示11条/3s。主智能体确认candidate108（106编号文件+manifest+原Journal）、active100、sleeping8。 |
| B3 | 通过 | 模型依据导航找到原路径 `/private/tmp/actspace-context-bugfix-20261006/sessions-v2/85ea5068-884b-4ba8-94bb-fc9949ff3961/journal.jsonl`，CUA批准单次只读后工具卡显示1–2，最终`BUGFIX-B3-B4-NAV-DONE`及原路径。主智能体确认读取成功。 |
| B4 | 通过 | sleeping索引`d002505b-5b04-42ef-9b35-3d7b0fb7eda6`真实读取；file-106真实读；第二次压缩显示9条/5s。主智能体确认索引fact paths=[]、未入文件表；file-106压缩前仍sleeping/count1，压缩后active。 |
| B5 | 通过 | GUI右键分叉成功，继承两次压缩历史；子`42c071ab-45ad-4e4b-a49c-13182577c162`读取file-002完成`BUGFIX-B5-CHILD-DONE`。主智能体确认首次cycle2所有count0，子Journal路径重映射，第二次只有file-002计数1、父seq1577不变。临时写锁问题修复后，最终重启真实完成`BUGFIX-B5-FINAL-RESTORE-DONE`；主智能体确认cycle2、只有file-002计数1且仍sleeping，父seq1577不变。 |
| B6 | 核心通过，部分未覆盖 | 闲置目标开关真实on，显示“双语已开启 · 等待新回答”；RUN1缓存/RUN2队列均英文随后中文。关闭后OFF请求完成；主智能体确认两轮有english-learning/v1，关闭后三个阶段均无规则，文件父子其他会话english=false。目标切换、子Agent与语音队列未专门覆盖。未主动试听语音。 |
| B8 | 通过 | Chat按60K+70K+60K发送，第三块完成`BUGFIX-B8-60K-DONE`，后续短请求完成`BUGFIX-B8-AFTER-DONE`。主智能体确认Task累计1141016字节>1MiB且正常完成，无DURABILITY_BLOCKED。最终重启后切子会话再切回以重新订阅，点击唯一队列“继续发送”，真实完成`BUGFIX-B8-RESTORE-DONE`，关键终態截图已保留；主智能体确认唯一accept431、completed finish479。原故障副本由主智能体验证，非本子智能体UI证据。单条超限拒绝仅由主智能体自动测试覆盖。 |
| B9 | 通过 | UI Chat/Kimi K2.6，50%设置“已保存”；seed短轮完成后60K回复完成，Popup23%/~60K/256K，无压缩；追加70K运行中51%，完成后“上下文已压缩 · 5条 · 4s”。主智能体确认实际容量256000、60535输入无compaction，130579输入自动end/applied且cycle推进。随后阈值点重置，持久0.8由主智能体确认。未补其他模型/容量或失败取消。 |
| B1 | 未覆盖旧候选 | 新独立会话和首请求成功不能证明旧持久Harness暂停候选已修复。 |
| B7 | 未覆盖 | 未重新制造5000句停止场景。 |

## 新发现：重启后的临时写锁失败被缓存

主智能体第一次通过开发启动器终止后，同数据根重启，首次UI短请求`BUGFIX-B5-RESTORE`草稿保留，显示：`Session 42c071ab-45ad-4e4b-a49c-13182577c162 is owned by runtime 745969bb-00e6-4c5d-a59b-af7b7a004cf8 pid 12747.` 重选子会话、超过保护期后仍失败。未清理锁或数据。

主智能体已定位为首次openSession临时锁失败的rejected Promise永久缓存，完成精确修复与回归。该新问题不等同于原B1静默暂停候选。

第二次重启后大会话 `BUGFIX-B8-RESTORE`已接受、UI“1条排队/即将发送”随后“已暂停”。主智能体确认Session锁重试已恢复（accept seq431），但HarnessControl启动STORE_LOCKED也被永久保留，补充修复同类边界。UI子智能体暂停操作，没有重复排队；一次基于延迟旧树的继续发送尝试返回“element ID no longer valid”，未执行成功。

最终修复版Host再次启动后，首次绑定仍只有历史、没有队列控件；同项点击不重新订阅。按主智能体指示先切子会话、发无工具短标记，再切回大会话后队列出现，点击“继续发送”完成唯一RESTORE。此路线真实验证Session/Harness两层临时写锁过期后重试均可继续；未删锁/未改Journal。主智能体19次Context→LlmInput→prepared转换均一致。

另一个独立行为观察：大会话重启后模型选择器从 Kimi K2.6 显示为默认 deepseek-flash；未主动切模型。主智能体只读确认选择为前端内存状态、重启按配置默认初始化，是否需要跨重启持久化未约定；不列为Context转换Bug。B9阈值结论只使用重启前真实Kimi256K阶段。

## 收尾

CUA通过应用菜单 `Quit Electron`正常退出测试实例。自动压缩阈值已重置，主智能体确认持久值0.8。未继续扩展B1/B7候选、provider自动重试、压缩失败/取消、多主题/多尺寸、语音或子Agent隔离；对应内容不得视为已通过。最后两个恢复短标记的UI终态均已确认。
