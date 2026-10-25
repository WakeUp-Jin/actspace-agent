# 对话压缩显示验收与 Bug 原因

日期：2026-10-25。基线：`feat/compaction-display` / `bb18a77c`。

结论：**暂不全量通过。界面主要展示和真实手动压缩完成通过，确认两项 Token 数据问题；真实失败重试、自动压缩及部分恢复路径尚未覆盖。** 本轮只验收和定位，未修改产品源码、测试，未提交或推送。

## 验收依据与执行边界

- 依据：[功能计划](../../exec-plans/completed/20261025-compaction-display.md)中的 A1 展示、Token 口径和历史兼容约定。
- Computer Use 委派 `gpt-6.1-sol` 执行，主智能体负责源码、Journal、构建、现有测试及诊断探针。
- mock：IAB 实际点击、键盘和连续截图；1280×720 与 480×800，浅色及深色。
- 真实应用：Electron 39.8.10，`com.actspace.desktop.dev.w2067fa05`；独立数据与工作区，真实 DeepSeek 请求。用户原数据和设置未修改。
- 操作分组：完成态→轨迹；进行中→失败；复用路线检查主题、宽度和键盘；隔离 Electron 手动压缩→恢复与旧记录→自动压缩。后两段受原生绑定阻塞，未用静态检查代签。
- 本地完整过程：[CU 记录](../../../tmp/codex-acceptance/20261025-compaction-display/cu-results.md)。`tmp` 是忽略产物，不保证长期存在；关键结论与复现条件已写入本文。

## 逐项覆盖

| 编号 | 验收点与预期 | Computer Use 结果 | 其他证据 / 限制 |
| --- | --- | --- | --- |
| C1 | 进行中计时递增、两侧扫光朝中间；完成显示条数、Token、耗时 | **通过** | mock 连续帧约300ms间隔，左右亮带向中间移动；计时递增。真实手动完成显示5条、7.1K→约7.1K、2s。统计的特殊数据边界见 B1/B2。 |
| C2 | 失败原因可读，重试入口可用，真实重试能重新压缩 | **部分通过** | mock 失败文案、Tab焦点及Enter响应通过；mock返回普通回复，不能证明真实重试。真实 Provider 失败→恢复→重试未覆盖。 |
| C3 | “在轨迹中查看”选中对应压缩行 | **mock通过；真实未覆盖** | 点击与键盘Enter均选中第24/25轮之间的压缩行。真实应用点击后CU读取超时，不能判为跳转通过或失败。 |
| C4 | 轨迹概述显示触发方式、条数、Token、真实耗时及摘要 | **mock通过；真实未覆盖** | 自动、48条、182400→约9100tok、23.0秒与摘要完整；对话本身不展开摘要。真实手动轨迹概述未读到。 |
| C5 | 浅深主题、480px及必要键盘焦点可用 | **通过（列出的代表位置）** | 完成、进行中、失败、轨迹详情均覆盖，窄屏自然换行；重试和轨迹链接Tab/Enter通过。未扩展成全应用全位置通过。 |
| C6 | 旧记录缺少新字段时，不编造Token或触发方式 | **未覆盖** | 已生成不含trigger/beforeTokens/afterTokens的完整旧Journal fixture，并检查字段确实缺失；未进入真实界面，不算CU通过。 |
| C7 | Electron真实手动压缩、实时和重开后的记录一致 | **手动完成通过；重开UI未覆盖** | 真实3轮对话后 `/compact` 成功，Journal与界面条数/Token/耗时一致。进行中0s和禁用发送来自当场AX观察。重开后CU仍无法绑定，未完成恢复UI核对。 |
| C8 | 真实自动压缩显示“自动”，字段与Journal一致 | **未覆盖** | 已在隔离配置降低容量准备触发，但CU阻塞后未执行新对话。生产AgentLoop确定性探针确认B2，不冒充真实Provider或CU自动压缩通过。 |

## B1 · P2：最后一条助手消息无有效 usage，手动压缩丢失已有 Token

**影响**：会话之前已有有效实测 Token，最近一次回复却没有 usage 或只有 unknown/null 字段时，新手动压缩不写前后 Token，完成分隔条和轨迹将缺少这组数据。

**期望**：计划要求读取“最近一条带 usage 的 assistant/message”，拿不到有效记录才省略。

**根因**：[latestRequestUsage](../../../packages/context/engine/src/compaction.ts#L115)只取最近一条 `assistant/message`，遇到缺失/无有效数值立即返回null，没有向前寻找有效usage。`compactionTokens(null, …)`随后返回空对象，Journal中永久缺失两个字段；前端按字段缺失省略显示，属于下游正常行为。

**确定性复现（生产类，内存Session；非CU）**：

1. 创建可压缩Session，追加5条用户消息。
2. 追加助手消息，usage为input100、cacheRead20、cacheWrite5、output10，总计135。
3. 分别测试：不再追加助手消息；再追加无usage的助手消息；再追加 `EMPTY_LLM_USAGE` 的助手消息。
4. 通过生产 `CompactionPlugin.compact` 和 `ContextCompactionCoordinator` 提交摘要。
5. 对照组end记录before135、after122；后两组end仅有trigger/manual及耗时，before/after均不存在。

`EMPTY_LLM_USAGE`是LLM服务正式支持的unknown状态，不仅是旧数据才可能出现。三组均成功完成压缩，因此不是摘要失败导致字段缺失。

本地原始结果：[manual-usage-probe.json](../../../tmp/codex-acceptance/20261025-compaction-display/manual-usage-probe.json)。未加入或修改测试文件。后续修复方向是回溯有效usage并补边界回归，本轮未实施。

## B2 · P2：自动压缩把估算触发压力作为实测 beforeTokens

**影响**：工具结果较大或Provider无usage时，自动压缩仍会写出没有“约”标记的压缩前值。它可能包含本地估算，无法代表Provider实测请求用量；afterTokens也沿用此基数。

**根因链路**：

1. [AgentLoop](../../../packages/core/agent-loop/src/loop.ts#L279)为了让新工具结果参与安全触发，使用 `max(完整内容估算 − output, 实测input + 新工具结果估算)` 构造usage。这一触发策略本身有合理目的。
2. 此对象直接传给 `autoCompact` / `maybeCompact`，协调器把它作为 `cause.usage`。
3. [协调器](../../../packages/context/engine/src/compaction.ts#L98)优先用cause.usage，[compactionTokens](../../../packages/context/engine/src/compaction.ts#L126)直接求和写beforeTokens，未保留“估算压力”与“实测用量”的区别。
4. [完成条](../../../apps/desktop/src/renderer/components/messages/CompactCommandBlock.tsx#L65)只给after加“约”，因此前值呈现为实测口径。

**确定性复现（生产AgentLoop + 生产协调器，确定性LLM适配器；非CU、非真实Provider）**：

- 适配器实报input100、output50；工具随后产生20000字符的结果；触发并提交一次自动压缩。
- `assistant/message.usage`实报合计150，`compaction/end`却记录before5157、after126、trigger/auto。
- 对照使用 `EMPTY_LLM_USAGE`：Provider完全没有有效实测数，end仍记录before5105、after74。
- 本地原始结果：[auto-usage-probe.json](../../../tmp/codex-acceptance/20261025-compaction-display/auto-usage-probe.json)。

计划同时写了“beforeTokens实测”和“自动取触发判断时用量”，但当前触发用量实际混合估算；这里按“实测前值”的约定判定口径问题。后续可将触发压力与展示用量分开传递；若产品决定展示压力，则需要明确估算口径和标记。本轮未修改触发策略或展示。

## 真实手动压缩核对

真实会话ID：`83bc33f3-6e4d-4cfc-b6d3-5e36aee38c67`。3轮短对话分别要求记住“青山 / 河流 / 白云”，随后从界面执行 `/compact`。

| 字段 | Journal | 实际界面 |
| --- | --- | --- |
| 替换范围 / 条数 | start0、end5，即5条 | 以上5条消息已压缩 |
| trigger | manual | 对话完成条不展示trigger；真实轨迹未覆盖 |
| beforeTokens | 7125 = input210 + cacheRead6912 + output3 | 7.1K |
| afterTokens | 7121 | 约7.1K |
| durationMs | 1909 | 2s |

事务start/end为seq113/116，compactionId为 `0e6b9aa9-7b55-4df9-90d1-1df452220a62`。此次7125→7121符合当前公式，不因四舍五入显示相同就判定压缩失败。

本地截图，不随仓库分发：[真实手动完成](screenshots/20-electron-manual-completed.png)、[mock轨迹概述](screenshots/02-mock-light-trajectory.png)、[深色480px轨迹](screenshots/10-mock-dark-480-trajectory.png)、[扫光帧1](screenshots/21-mock-sweep-1.jpg)、[帧2](screenshots/21-mock-sweep-2.jpg)、[帧3](screenshots/21-mock-sweep-3.jpg)。原始19截图虽然文件名带running，落盘时已经完成，不作为进行中截图证据。

## 原生 Computer Use 阻塞与剩余验收

真实手动完成后点击轨迹，原生CU调用30秒超时；按精确bundle重新绑定30/60秒超时。采集主进程及renderer各2秒sample后，重开同一隔离实例一次，绑定仍60秒超时。

- `cua.getState()`正常返回；Finder绑定0.18秒成功，说明不是所有原生CU入口都失效。
- 目标主进程与renderer存活，CPU约0.4%/1.4%；采样主线程主要等待事件循环，没有捕获到应用主线程卡死证据。
- 应用日志未见这次点击对应的新错误。目标应用AX/绑定路径阻塞已确认，具体是产品、Electron AX还是CU绑定服务原因，**尚未定位**；不把工具超时计成产品Bug。
- 清单未提供Electron WebContents浏览器入口，未用未文档化手段替代CU验收。
- 首次旧数据fixture制作错误留下的writer-lock报错属于验收环境问题，已排除；它不是本功能Bug。完整旧fixture为 `compaction-legacy-complete`，不得使用半成品 `compaction-legacy-acceptance` 判兼容性。

恢复原生绑定后，定向补验：旧记录无新字段→真实手动记录轨迹及重开恢复→真实自动压缩→真实失败后恢复并点击重试。自动触发准备仅修改隔离数据中的DeepSeek容量20000/maxOutput1024；因未实际运行，不宣称此配置已验证自动触发。

## 本轮执行的自动检查

**167项现有测试通过**，没有新增测试：

| 范围 | 通过数 |
| --- | ---: |
| Desktop：compact-command-block、trajectory-compaction-overview、trajectory-reveal、runtime-v2-tool-stream | 23 |
| client | 51 |
| session-journal | 37 |
| context-engine | 27 |
| context-compaction | 20 |
| core-agent-loop：auto-compaction | 9 |

主要命令：

```sh
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/compact-command-block.test.tsx src/renderer/test/trajectory-compaction-overview.test.tsx src/renderer/test/trajectory-reveal.test.ts src/main/test/runtime-v2-tool-stream.test.ts
pnpm --filter @actspace/context-engine --filter @actspace/context-compaction --filter @actspace/session-journal --filter @actspace/client test
pnpm --filter @actspace/core-agent-loop exec vitest run src/test/auto-compaction.test.ts
pnpm --filter @actspace/desktop run build:deps:dev
pnpm --filter @actspace/desktop run build:electron
```

依赖及Electron构建成功。两个Bug来自额外诊断探针，现有通过测试没有覆盖其边界，不因测试通过而忽略。本轮未重跑全部仓库测试、全部守卫或签名分发验证。

已关闭本轮启动的隔离Electron和Vite，并移除隔离目录中复制的secrets文件；保留测试Journal、截图与诊断产物。工作区唯一受版本管理的新增内容为本文。

## 修复跟进（2026-10-25，Claude Code）

用户选定 B2 方案 B：压缩前 = 最近一次有效实测 + 之后新增内容的估算，含估算时标记并显示「约」。

- **B1**：协调器往前找最近一条用量有效的 `assistant/message`，跳过没有 usage 或 `EMPTY_LLM_USAGE` 的回复。探针场景（135 → 再追加无 usage / 全 null 回复）现在会记录压缩前后 token，并因追加回复的估算标 `beforeEstimated`。
- **B2**：协调器不再使用 loop 传入的触发压力，手动和自动都从 journal 计算；基准之后新增的条目（如工具结果）按估算累加，并写 `compaction/end.beforeEstimated: true`。完成分隔线和轨迹 Token 行在压缩前也加「约」。探针场景（实报 150 + 20000 字符工具结果）应记录「150 + 工具结果估算」并带「约」，不再冒充实测；该探针本身未重跑，由新增回归测试覆盖同一路径。
- **附带**：两次压缩之间没有新请求时，第二次以上一次的 `afterTokens` 为基准，避免沿用已过期的实测数。
- **回归**：`packages/context/compaction/src/test/compaction.test.ts` 新增手动实测、回溯无效 usage、自动不用触发压力、连续压缩四项；client / shared / agent-loop / desktop 补 `beforeEstimated` 透传和「约」显示断言。
- 仍待复验：真实 Provider 下的自动压缩与 CU 未覆盖项（重试、旧记录、重开）。
