# 真实桌面验收记录

执行日期：2026-10-06。执行者：gpt-6.1-sol Computer Use 子智能体。仅测试、收集问题，不修复业务代码。

## 环境与证据

- `pnpm dev:log` 启动真实 Electron，绑定 `com.actspace.desktop.dev.w3624b697` / `Actspace Dev 956e-3624`，未使用浏览器或 mock。
- 当前独立数据目录 `/tmp/actspace-context-real-acceptance-logged-20261006`；启动日志 `/tmp/context-real-acceptance-dev.log`；临时值日志 `/tmp/context-real-acceptance-values.jsonl`。
- 首轮目录 `/tmp/actspace-context-real-acceptance-20261006` 保留暂停问题证据。
- 截图由 CUA 返回内联图像；当前工具文档没有截图文件保存 API，因此没有声称存在本地截图文件。AX 与关键截图在本任务 CUA 输出中。
- 数据对照由主 Agent 独立读取诊断/Journal，本报告明确区分 UI 直接观察与运行数据核对。

## 逐项覆盖

| 项 | 当前状态 | 真实界面证据及缺口 |
| --- | --- | --- |
| A1 | 通过 | fixture 会话 `09bea104-e3ca-4a5a-b428-49fb8fff5c2e` 两次分页 read_file 回复包含 PAGE_ONE_END、PAGE_TWO_START、PAGE_TWO_END；Kimi图片附件回复左绿右蓝；Chat notes.txt附件实际返回正文用途，三阶段artifact→image/text匹配。 |
| A2 | 通过 | 真实切换 Agent→Chat→Plan→Agent；Chat 工作区入口消失，Plan/Agent 恢复；每模式已发送独立 marker。数据边界由主 Agent 补充。 |
| A3 | 通过 | FRESH 会话 `d0e09872-8688-43ab-8ed9-230faf6abeef` 成功回复；Popup ~6K / 1M Token，详情23条含system/tools/历史；切Kimi K2.6真实回复marker，Popup~8K/256K，prepared容量256000对应。 |
| A4 | 失败 | 目标父会话英语学习开关无法开启，刷新再试仍off，红字“无法更改目标会话，请刷新列表后重试。”（B6）；真正双语/关闭/另一会话作用域受阻，语音未覆盖。 |
| A5 | 部分通过 | 长回复运行中点击停止，UI Stopped/空闲；后续短请求须“继续发送”后实际完成marker。曾大量推理旧长任务但最终正确（B7候选）。provider自动重试未覆盖。 |
| A6 | 部分通过 | 三次手动压缩均观察进行中、禁用发送及完成按钮；首压缩23条/4s，二次5条/4s，三次6条/6s。摘要Relevant Files由真实数据核对保留；独立空会话/compact无LLM/事务/周期变化（数据通过），UI没有看到明确无需压缩反馈；压缩失败/取消未覆盖。 |
| A7 | 失败 | manifest真实9分页包含106路径，压缩仅收集3条（B2）。以用户正文明确引用路径的独立路线验证107文件/active100/sleeping7及计数清零。 |
| A8 | 通过 | file-106读取回复标记正确；读取后日志仍sleeping/count1，第三次成功压缩后active/count0，未立即唤醒。 |
| A9 | 失败 | 索引审批允许后可读，file-001压缩后重读正文可达；权限拒绝返回user-denied且不计数。原Journal导航缺失（B3），旧索引在再次压缩后加入active（B4）；显式Journal路径审批允许后读到header和task事件，原历史正文可达，但不代替缺失的自动导航。 |
| A10 | 失败 | 隔离Chat设置50%并实际落盘；Kimi256K发送60000个单字“验”，UI24%后自动压缩5条/2s，实际input60148+cache512，低于50%容量（B9）。自动candidate/core/applied及下周期短回复均通过；已恢复80%并观察“已保存”。准备阶段长会话累计任务投影超限阻断提交（B8）。 |
| A11 | 通过 | 正常GUI退出→同数据根重启→恢复原fixture会话，全部历史/压缩按钮可见，首次新请求回复“恢复验收正常”；真实state109路径/cycle3/计数及索引恢复一致。 |
| A12 | 失败 | GUI右键“分叉”成功、继承历史可见，子file-002读取独立且父Journal未变化；typed索引复制到子目录。子首次组装误把旧索引历史读取重新计为本周期热度（B5）。 |

## 问题候选 B1：首次发送及继续发送静默暂停

- 严重性：P1 候选，实际阻断请求；原因尚需主 Agent 运行数据核对。
- 关联：A1/A11。旧目录 Session `2e4c252f-ddae-4c76-b803-009bda987ce1`，marker `CUA-A1-20261006`。
- 步骤：新会话选择 actspace-agent 工作区→输入只读分页任务→发送→等待→点击“继续发送”。
- 期望：开始执行或呈现明确失败原因。
- 实际：首次及继续发送后均显示“1条排队 已暂停”“继续发送”，侧栏空闲，消息区无错误原因；标题最终生成但正文未运行。
- UI证据：发送后截图及继续发送后的AX，均在本任务 CUA 输出。
- 新目录最小请求正常，故不能归因为配置缺失；暂保留为旧持久 Harness/启动环境相关候选，不据此认定 Context 引擎失败。受控重启的临时 writer lock 不列为已确认 Bug。

## 运行数据确认的问题

详细请求/压缩ID、计数和源码解释见[真实数据证据](./real-desktop-data-evidence-20261006.md)。以下均没有修复。

- **B2 / P2：read_file带行号输出的路径未在压缩时收集。** 9分页manifest含106路径（UI实际回复106），首压缩candidate仅file-001/file-002/manifest共3；期望保留所有已进入历史的明确文件引用。复现：分页读manifest→`/compact`→检查导航。
- **B3 / P2：压缩后的原Journal精确引用缺失。** A9请求模型实际回复“没有”精确原Journal路径，首三次压缩数据亦无历史引用，原Journal仍存在。期望导航提供当前可用的原历史路径和event seq；Host实际storageClass=JsonlSessionStorageService/isJsonlStorage=false，包装未通过instanceof检查，已确认。
- **B4 / P2：旧sleeping索引被压缩重新收集为普通active文件。** UI的A9模型回复把file-106和旧索引同时列为活动路径，真实state确认active2/sleeping106；期望索引始终仅作为入口。复现：>100引用→压缩→读索引→再压缩→新请求。

- **B5 / P2：fork 首次组装重放旧索引读取并增加当前周期热度。** 子Session `95fd4c1c-5035-45ee-a58e-285a7f52cd8e`，子file-002读取前，旧索引2bab... reads已变1，fact sourceSeq=1609来自父cycle2历史索引读取；期望继承压缩后count0。父Journal与fork前相同，故父子隔离通过，但继承/recovery热度错误。详情见真实数据证据。

- **B6 / P2：闲置目标会话英语学习无法开启。** 扩展→能力→英语学习→选中父会话→点击开关，仍off且红字“无法更改目标会话，请刷新列表后重试。”；刷新后再次点击同样失败。真实请求 df28c99c-4796-4573-8fee-7f0b7aa22bee 无English来源；开发日志三次set-target通用失败，具体内部异常未捕获。截图保留在CUA输出。
- **B7 / 观察候选：停止后短请求受到旧长任务影响而大量推理。** 停止5000句任务→新输入只回marker→继续发送，UI Thinking仍大量计划旧5000句，最终约9分钟后正确回复“停止后继续正常”。停止/继续功能终态通过，不认定转换丢消息；真实输入最后user正确，输出5539 tokens中reasoning5534。第二次stop点击时已完成，不声称再次取消成功。

- **B8 / P1：长会话累计 TaskSnapshot 超过 1MiB 后半提交并阻断后续执行。** 隔离Chat `91c127...`，两条短请求→63118字符材料请求完成→126K字符第二块材料发送。UI草稿保留、“提交尚未确认，再次发送将核对同一次提交。”；同标识一次核对仍不执行。期望正常接受，或在落事件前明确拒绝并告知原因。实际 submit-task DURABILITY_BLOCKED：单event715129bytes未超限，但累计task内容1094046bytes，task seq254已append、snapshot仍revision253，无request/Run。没有删数据或修复；新Chat可正常请求，故不认定全局失效。具体完整SessionID/日志见数据证据。
- **B9 / P2：自动压缩比例不按实际模型容量计算。** 新Chat `d750...`，Kimi K2.6真实容量256000，阈值设50%，两短轮后输入60000个单字“验”。UI显示24%，真实usage input60148/cache512/output54（约23.7%），随后自动压缩完成。期望接近当前256K容量的50%才触发；实际固定128K策略减16K余量得到约48K触发，与设置描述不符。自动压缩事务 `465585...` 与下一短请求cycle1正常，不能把链路成功写为比例正确。

## 收尾与限制

本轮共有35次普通真实请求完成三阶段转换核对；图片、文本附件、模式边界、模型容量、手动4次与自动1次压缩均有实际运行证据。确认问题为B2/B3/B4/B5/B6/B8/B9；B1、B7保留候选，未冒充已定位问题。

未覆盖：provider自动重试；压缩失败/取消；英语成功启用后的双语、关闭、跨会话作用域与语音。空压缩实际no-op已验证，但未看到明确无需压缩反馈。未测试多尺寸/多主题，不将代表性截图作为全量视觉验收。

测试配置自动压缩阈值已恢复80%，UI“已保存”及实际配置0.8均确认。无产品修复，无提交；临时诊断已由主Agent按验收前字节撤除，闭包与Harness重建通过；实例已正常退出。保留独立数据目录、Journal、诊断日志与故障现场供Astra修复后定向复验。
