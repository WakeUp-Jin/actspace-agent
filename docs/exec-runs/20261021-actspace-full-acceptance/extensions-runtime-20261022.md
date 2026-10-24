# Skill/Todo真实Runtime补测（2026-10-22）

固定主仓库CLI/Runtime，隔离workspace、无害canary Key、回环HTTP受控Provider，exit0/completed。6个真实工具调用/7次HTTP；非商业模型自主工具选择，不代签Desktop列表/投影UI。

- 相同id/name的Skill分别置于.actspace/skills和.agents/skills。当前构建discoverSkills实际扫描只保留.actspace/skills优先项，source/path与期望一致；catalog不包含正文。
- 第一条实际请求含Skill目录描述、不含任一正文；经read_file按需读取主Skill后第二条起含PRIMARY正文，始终不含SHADOW正文。不存在Skill路径返回资源不存在。
- todo_write建立in_progress/pending两项，todo_read返回2项/0完成；再次replace为1项completed，过滤todo_read返回1项/1完成，id一致。持久Journal存在Todo事件；后续跨进程恢复见下，Desktop投影仍需独立UI验证。
- present真实文件声明见[文件工具报告](filesystem-runtime-20261022.md)。插件启停/其他扩展UI仍待执行；未在该CLI profile暴露的MCP能力不当成已接入功能签收。

证据：tmp/codex-acceptance/20261021-actspace-full-acceptance/extensions-runtime-20261022/{discovery.json,results.json,requests.json,stdout.json}和同名.log。未输出凭据/用户资料。

## Todo 跨进程恢复及会话隔离

复制上述合成Journal到新dataRoot，不改原始证据。第一个全新CLI进程以原sessionId恢复，只调用todo_read，返回相同id/相同completed内容的一项；第二个全新CLI进程在同dataRoot新建Session，只调用todo_read，返回0项。两次均completed/exit0，各两次真实HTTP请求；未把历史工具结果冒充本轮回读。

证据：todo-recovery-20261022.mjs/.log及同名目录results.json，sameSessionRecovered/newSessionIsolated/bothCompleted均true。该结果签收Runtime持久恢复与Session隔离子点，仍不代表Desktop Todo投影、启停开关或通知入口通过。


## 后台任务通知的持久投递与恢复（2026-10-22 追加）

验收点先列：现有bash后台输出匹配/完成通知实际入Inbox；同Session新CLI进程恢复后消费，进入下一模型请求；消息ID与任务ID可追踪；只读确认本版装配/插件入口，不臆造MCP或通用开关。分后台命令→通知落盘→新进程恢复→现有工程集成证据核对四组；主智能体执行CLI，非Computer Use。

独立workspace/dataRoot和回环合成Provider，真实bash blockMs0运行printf ACCEPTANCE_READY→sleep1→printf ACCEPTANCE_DONE；两进程退出0/completed。首轮2次HTTP请求时通知尚未进入该请求，随后真实Journal seq22/24分别enqueue output_match/completed，任务同bash_254e05e0…；不是要求首轮已经消费。新CLI使用原session7cbdc96c…恢复，seq36/37分别claim两个原messageId，首个真实HTTP请求已含两段task_notification及READY/DONE。无直接修改Inbox/Journal、无向其他人发送消息；命令只写自己输出文件。两通知均领取一次，未声称跨所有重试/客户端组合。通知含任务/状态/输出尾部，可追踪；与系统通知、语音专项分开。

本地证据：tmp/codex-acceptance/20261021-actspace-full-acceptance/notifications-runtime-20261022/ 下results.json、requests.json、events.json与resume-results.json、resume-requests.json、resume-events.json；脚本/日志同级notifications-runtime[-resume]-20261022.mjs/.log。两次CLI PID32143/33940均退出，回环server关闭，无商业调用或产品修改。

装配/恢复采用本版本已有Runtime协议，不以不存在的UI开关为前提。已执行package-tests.log记录plugin-manager 6项全部通过（实际构建/挂载/调用/复制工具、保留旧lease、恢复binding和rollback等），runtime/src/harness/evolution.test.ts 1项通过（真实Runtime加受控Adapter、下一条消息才激活、会话隔离、重建Runtime后相同binding/工具可用），harness-hmr生命周期与既有真实Cordis opt-in亦通过。此处是工程集成验证，不声称Desktop点过插件总开关或通过公网LLM开发插件。当前Extensions只有能力/Skills/MCP占位；未实现的通用插件UI和MCP不新增验收要求。已有Skills启停交互另有Desktop证据。

结合已有Skill、Todo/present Runtime与Desktop/重启证据，D21现有功能范围可以汇总；契约矩阵文档生成漂移BUG-004仍独立失败，不能称全仓工程全绿。
