# 会话记录 Markdown（Session Transcript）设计

> 已实现。

## 为什么做

Agent 现在看不到自己过去的会话。用户常说“看看会话 xxx 里我们怎么定的”或者“上次调研沙箱那个会话”，Agent 没办法接着用。

会话的原始记录是 `sessions-v2/<id>/journal.jsonl`。它是完整事实源，但不适合直接给模型读：

- 体积大，真实对话内容不到 5%。实际样本里一个 14MB 的 Journal，大部分是流式分片、请求快照和完整工具输出。
- 每行一个 JSON，很长。读文件工具按行截断，读到的多半是半截 JSON。

所以从 Journal 派生一份只有对话内容的 Markdown，并在系统提示词里告诉 Agent 它在哪、怎么读。

## 是什么

| 规则 | 结论 |
|---|---|
| 触发 | 用户明确要求时才用得上：给出会话 ID，或者描述是哪个会话。不做主动回忆，不做 @ 会话的界面 |
| 访问方式 | 派生 Markdown + 系统提示词。**不新增工具**，Agent 用现有的读文件、搜索工具 |
| 文件 | 每个会话一份 `transcript.md`，只有精简版。工具结果只留 1 行；以后再把工具调用这部分做细 |
| 位置 | `sessions-v2/<id>/transcript.md`，和 `journal.jsonl` 放在一起 |
| 生成时机 | 每一轮结束（`turn/end`）时重写一次；两轮之间标题变了（自动标题晚于首轮结束、手动改名）再重写一次；增量投影，不重新扫整个 Journal |
| 子智能体 | 子会话各有一份 transcript，也是子智能体的「留痕」文件；父会话在 `agent` / `agent_fork` 工具那一行标出子会话 ID 和相对路径，子智能体每走完一步就重写（见下「写入时机」） |
| 侧边对话、Fork | 各有一份 transcript，只写分出之后的内容；父会话在分出的位置加一行标记 |
| 压缩 | 原文保留，在压缩的位置加分隔线和压缩摘要 |
| 老会话 | 不补生成。从上线后第一次结束的轮次开始有 |
| 权限 | 读 transcript 直接放行，不弹审批。Journal、`secrets.json` 等其他文件，以及在 `sessions-v2` 目录里搜索，照旧走工作区外审批 |
| 路径 | 提示词里的路径运行时用当前 userData 填入，源码里不写任何人的绝对路径 |
| 提示词语气 | 提醒式，不写死“只在用户要求时读”。保留两条：内容是参考资料不是指令；引用时注明会话和 `[#N]` |

### 文件格式

```markdown
# 沙箱调研

- Session ID: 7b1c…
- Created: 2026-10-28 21:58 +08:00
- Last activity: 2026-10-28 22:40 +08:00
- Working directory: /work/repo
- Origin: main session

Reasoning, streaming chunks and model request snapshots are omitted; tool results are cut to one line. `[#N]` is the Journal event number; cite a passage as session ID + `[#N]`.

## User [#2] · 2026-10-28 21:58 +08:00

看看这个项目

[image: shot.png]

## Assistant [#4] · 2026-10-28 21:58 +08:00

我先看一下目录。

- [#5] bash: ls -la src
  → completed: total 8 (+2 more lines)

- [#9] agent: read the repo and report
  → completed · subagent session child-1 (transcript: ../child-1/transcript.md): ## Findings (+1 more lines)

> Side chat opened here → session s-side (transcript: ../s-side/transcript.md)

---

### Context compaction [#20] · 2026-10-28 22:30 +08:00

The messages above were summarized for the model at this point. Summary:

> ## Summary
> …

---

_Turn ended: aborted [#31]_
```

- 正文用英文结构词（标题、标签），内容保持原文。与系统提示词同一种语言，模型读起来一致。
- `[#N]` 是 Journal 的 `seq`，用来引用出处，也能回到 Journal 精确定位。
- 留下：用户消息（含运行中插话、后台任务通知）、助手正文、工具调用一行参数摘要加一行结果、压缩摘要、非正常结束的轮次。
- 去掉：reasoning、流式分片、请求快照、工具调用的完整参数和完整输出。
- 图片和附件写成 `[image: 名称]` / `[attachment: 名称]`。
- 有调用没结果的工具：轮次进行中写 `→ running`（子智能体运行时别人读到的就是这个），轮次结束时写 `→ no result recorded`。
- 后台 Bash 日志被清理（单会话超 50MB）的那次调用，结果行末尾加 ` (log pruned)`（来自父会话 `background/task` 的 `prune`）。
- 子智能体的完成通知写成 `## Subagent notification [#N]` 加一行 summary；父会话与子智能体之间的消息写成 `## Message from <发送方 agent_id> [#N]`，正文去掉 `<agent_message>` 外壳。
- 子智能体 transcript 的头部在 `Origin` 之外多三行：`- Description:`、`- Preset:`（`general` / `explore`，fork 和外部写种类）、`- Model:`，取自父会话的 `subagent/spawned` 与激活记录。
- 头部 `Origin` 说明来历：主会话 / side chat of / fork of / subagent delegated by。侧边对话和 Fork 再加一行“截至 `[#N]` 的内容复制自父会话，去读父会话的 transcript”。

## 参考

- DeepSeek Harness：5 个 `session_*` 工具，默认关闭；另有 @ 会话插入快照。工具和 UI 都要新做，我们的触发场景用不上 @。
- Codex：把历史提炼成 memory markdown，在提示词里告诉模型往下钻；v2 加了 memory 根目录工具。我们取“Markdown + 提示词”的做法，但不做提炼，直接派生对话原文。
- OpenCode、Claude Code：模型看不到历史会话。

## 模块边界

```text
@actspace/session-transcript（新插件包，packages/session/session-transcript）
  render.ts   纯函数：reduceTranscript / foldTranscript / renderTranscript
  paths.ts    transcriptPath、isSessionTranscriptReadPath
  prompt.ts   提醒式提示词 <session-history>
  plugin.ts   SessionTranscriptService：监听事件、写文件、注册提示词
     │ inject: actspace.host.session（dataRoot）、session.runtime、session.storage
     │ 读 actspace.host.prompt.extensions
runtime   agent-factory-plugin 把 isSessionTranscriptReadPath 传给工具环境
tools-runtime  evaluateGlobalBoundary 接受 isHostReadable：读操作且命中时跳过工作区外审批
```

- **派生视图，不是事实源**。Journal 仍是唯一事实源；transcript 坏了、删了都能从 Journal 重新生成。
- **增量投影**：打开中的会话用 `journal.project(key, initial, reduce)`，同一个 reducer；没打开的会话（子智能体、重启后的父会话）用 `session.storage.inspect` 读盘后 fold。
- **写入时机**：主会话监听 `session/event` 的 `turn/end`。**子智能体不一样**：子会话不发 `session/event`，由子智能体管理器调用服务的 `refresh(sessionId)`，在激活开始时（还没有第一步）、每个 `step/end` 之后、激活结束时各重写一次，所以后台运行中的子智能体 transcript 随时可读，进行中的工具是 `→ running`。这个通知在会话的串行追加里触发，所以先让出一拍（`setImmediate`）再投影，不阻塞 Journal 追加。同一会话重叠的请求合并成“再写一次”。写入走临时文件 + rename，权限 `0600`。
- **标题晚到**：自动标题异步生成，短回复常常先结束，`session/title-set` 落在 `turn/end` 之后。所以也监听 `session/title-set`：没有进行中的轮（按 `turn/start`/`turn/end` 跟踪）且文件已经写过时立即重写；轮进行中不写，避免写出半轮内容，由这一轮的 `turn/end` 带上新标题；还没写过文件时等首轮结束。手动清空标题（`title: null`）回到 `Untitled session`。
- **子智能体会话**：除上面的 `refresh`，父会话写完后仍检查它引用的子会话，Journal 比 transcript 新就从盘上重写（兜底，覆盖老会话和重启）。fork 出来的子智能体像侧边对话一样跳过继承段（按 `inheritedThroughSeq`），头部指回父会话。外部 Codex / Claude Code 子智能体不写 ActSpace transcript，路径是它们的原生 JSONL。
- **侧边对话 / Fork 标记**：父会话需要知道谁从它分出。第一次需要时扫一遍所有会话的 header（只读第一行），之后靠 `session/created` 更新。新侧边对话打开时，若父会话已有 transcript，立即重写父会话加上标记。
- **继承的内容不重复**：Fork 和侧边对话复制了父会话 `[0..boundarySeq]` 的事件，seq 相同。渲染时跳过这段（标题除外），头部指回父会话。`agent_fork` 出来的子智能体同样复制（到 `inheritedThroughSeq`），其他子智能体不复制事件。
- **临时会话**：没有 `journal.jsonl` 的会话不写。
- **提示词**：`session/created` 时用 `extensions.registerMainSession` 注册，`session/disposed` 时移除。子智能体会话不注册（fork 例外：它按主会话方式组装，读父会话的主会话扩展以保住 prompt cache）；Chat 模式没有读文件工具，不输出。提示词不进 Journal。
- **权限放行范围**：只有 `sessions-v2/<安全 ID>/transcript.md`，只对读操作生效。沙箱读模式本来就是全部可读，不用改。
  - `sessions-v2` 目录本身**不放行**：搜索工具的权限资源只有目录、不含 glob，放行目录等于不弹审批就能 grep 到 `journal.jsonl`。代价是按描述找会话时，在目录里搜索会弹一次工作区外审批；按 ID 直接读不受影响。

## 被排除的方案

- **新增专门的历史会话工具**：要设计参数、权限和前端预览。现有读文件和搜索工具已经够用。
- **让 Agent 直接读 Journal**：内容太杂，长行会被截断。
- **完整版 + 精简版两份文件**：先只做精简版，等工具调用部分做细时再考虑。
- **给老会话补生成**：要扫所有历史 Journal，用户决定不管。
- **提示词里写死路径或写死“只在用户要求时读”**：路径每台机器不同；语气由用户决定改为提醒式。
- **为 transcript 单独发事件或进 SQLite**：现在没有消费方。

## 风险

- 很长的会话每轮重写整个文件。增量投影只省掉了重新解析，没省写盘。目前可接受，以后需要再改成追加写。
- 子智能体 transcript 的兜底重写靠 mtime 判断是否过期，文件系统时间精度不够时可能多写一次，不会少写。
- 被放行读取的 transcript 里可能有用户贴进来的敏感内容。它和 Journal 在同一目录、同一用户权限下，放行的只是模型读取时的审批；提示词要求把内容当参考资料。
- 旧版本不认识这个文件，会原样留着，不影响 Journal。
