# 轨迹系统提示词与工具显示：Computer Use 验收

日期：2026-10-18。结论：**整体未通过；30 个验收点中 21 项通过、2 项失败、7 项未完整覆盖（含部分通过）**。

本次重点修复在已覆盖的真实场景中有效：两个旧会话重载后都有完整初始系统提示词、正确的 21 项工具目录，没有假的“已更新”行；实际点开的 15 个早期、中段和末尾工具 Schema 全部可用。换模型、手动压缩及重载也未产生假的系统更新行。发现的两个 P2 问题为上下文概述缺开始时间、父轨迹缺子工具展示，详见 [问题记录](acceptance-issues-20261018.md)。本轮仅验收，未修复代码、未提交或推送。

## 方法与覆盖边界

按验收说明 A 系统行、B 工具行、C 消息与上下文、D 请求详情、E 历史和实时运行、F 特殊场景逐项核对；操作分为旧会话重载、新会话实时运行与重载、模型切换及压缩和委派三组。`gpt-6.1-sol` 子智能体完成真实 Electron 原生 Computer Use，主智能体负责构建、Journal 真值对照、问题归档与清理。没有使用浏览器 mock 或 Playwright。

使用当前分支的未提交实现构建依赖、生产 renderer、Electron main/preload，以 `file://` 页面启动独立数据目录，不运行 Vite/watch。复制两个旧会话（下表简称 8e、075），新建 S-new 会话只操作隔离只读工作区。原会话不写入，不修改原用户提示词文件。版本与产物哈希记录在本地 `build-manifest.json`。

截图、AX、原始真值及审计结果位于本地 `tmp/codex-acceptance/20261018-trajectory-system/`。这些证据可能包含私人会话内容，保留本地、不加入 Git；下表文件名均相对该目录。通过仅表示表内明确范围，不外推到未触发场景。

## 逐项结果

|编号|结论|证据及范围|
|---|---|---|
|A1|通过|075-C1-A1-top.png、8e-A1-top.png、new-E2-reloaded.png；三个会话重载后仅一初始系统行，位于第1轮之前|
|A2|通过|075-A2-search.png、8e-A2-search.png均搜索已更新无行；S-new完整AX单系统行|
|A3|通过|075-A3-A4-head.png、8e-A3-A4-head.png、new-A3-A4-head.png，仅系统提示词/工具|
|A4|通过|三个会话A4-head/tail.png；开头结尾与truth核对，Markdown渲染非空。注意文件名head合并A3|
|A5|通过|075/8e/new-A5-tools-ax.txt，均21工具，与truth逐一相符；075-A5-tools.png、8e-A5-tools.png|
|A6|通过|075-A6-expanded.png、8e-A6-expanded.png及AX：各展开agent/bash/bash_kill，完整描述与参数JSON树。默认21项收起。S-new只验证列表未重复展开|
|A7|通过|new-A7-actual-duration.png：实际时长时间线系统无长条；旧会话顶部图亦无系统耗时长条。0时长由主代理runtime审计辅助|
|A8|通过|new-A8-D2-model-switch.png：DeepSeek→Kimi K2.6，请求11 kimi-k2.6，回复成功，无新增系统行|
|A9|未覆盖|隔离Settings工具页关闭图片生成后第4轮仍21tools，主代理journal证实工具集合未变化，因此未触发差异场景|
|A10|未覆盖|Settings Agent指令引用原用户绝对prompt文件，为遵守原数据不改未编辑|
|A11|未覆盖|同A10，且工具变化未触发|
|A12|未覆盖（部分通过）|new-A12-reloaded.png，已触发的模型切换重载仍只有初始行；A9–11变化未发生，不能称完整覆盖|
|B1|通过|075-B2-01-bash.png及各B2截图：概述/参数/结果/Schema/计时顺序|
|B2|通过|共15个真实点开：075 ordinal1,2,3,11,12,13；8e ordinal1,2,3,27,28,29,53,54,55。各*-B2-*.png及AX，全部名称/描述/参数结构，无Schema不可用|
|B3|通过|075 bash Schema与075-A6-expanded定义描述、properties/required/additionalProperties相同|
|B4|通过|new-B4-参数.png/new-B4-结果.png；075-B4-denied.png状态失败，结果user-denied。首bash结果(no output)非空|
|B5|通过|075-B4-denied.png→075-B5-parent.png；跳到第4轮第2步助手，请求6，包含对应bash|
|C1|通过|075-C1-A1-top.png/075-C1-middle.png/075-C1-bottom.png+075-C1-all-ax.txt；逐条7用户均在1..7轮内首行|
|C2|通过|075-C2-preview.png；概述/预览/原始内容/来源，预览用户原文|
|C3|失败|8e-C3-{1..6}-overview.png/.txt：六条概述均无开始时间字段；时长均0毫秒；各-source.txt有消息来源JSON及kind/id/lifetime|
|C4|通过|075-C4-thinking-preview.png，思考默认展开；only-tool行显示仅工具调用；075-C4-thinking-search.png搜索independent命中请求15思考（时间线对应框突出，列表保留上下文）；有正文助手正常|
|C5|通过|new-C5-before.png/.txt与-after.png/.txt同请求10：首token499毫秒、生成307毫秒、吞吐316.0tok/s，重载一致；计时呈于助手概述的请求计时分区|
|D1|通过|075-D1-D2-request6.png；概述/选项/用量/计时，无系统/工具tab|
|D2|通过|旧请求default/deepseek-flash；new-A8-D2-model-switch.png新请求kimi-k2.6|
|D3|通过|075-D3-request1/17.png、8e-D3-request1/23.png，首尾均明确输入输出Token|
|E1|未覆盖|现有最大7轮，未制造20+真实付费轮次|
|E2|未覆盖（部分通过）|new-E2-running.png真实运行中仅一系统行及新增工具；new-E2-running-schema.png点击Schema时调用已完成；new-E2-reloaded.png一致。未抓到第一次请求刚出现瞬间及工具完成前Schema，不扩展慢工具|
|F1|通过|new-F1-compacted.png/.txt；/compact真实生成非空摘要，仅概述/原始输出；压缩后第五轮及重载仍一初始系统行|
|F2|失败（通知子项未覆盖）|new-F2-parent-detail.png成功agent结果与成功explore；new-F2-success-no-child.png、new-F2-final-ax.txt、new-F2-after-reload.txt未见子工具行/完成通知上下文，主代理F2-runtime-evidence.json证实成功子Session各真实read_file一次，父投影未接线，缺子工具行；同步委派没有后台完成通知因此通知子项未覆盖。前两Explore失败后模型自动换Agent再Explore成功|
|F3|未覆盖|没有真实LLM请求失败/重试；Explore工具失败不能冒充请求失败|


## 辅助工程验证

这些检查不替代上表真实界面验收：

- 当前依赖闭包、renderer 与 Electron 构建通过；renderer 有 CSS `highlight` 优化警告和 bundle 体积提示，构建未失败。
- 本轮重跑 renderer `trajectory-real-journal.test.ts` 5 项、runtime `session-projection.test.ts` 17 项，共 22 项通过。没有重跑开发者上轮报告的 Desktop 全量 1954 项。
- 两个旧会话完整 Journal 与精简历史窗口经过当前轨迹 builder 对照，初始系统行和 Schema 一致：55/55、13/13；7 条用户消息归属正确轮次，指定 6 条上下文均有开始时间和零时长。界面仍缺少时间字段，因此 C3 判为失败。
- 成功委派对应的两个子会话均有真实 `read_file` 事件，但父轨迹没有子工具行，因此 F2 判为失败；同步委派不能用于证明后台完成通知是否正确。
- 前两次 Explore 的 `DURABILITY_BLOCKED` 只记为观察项，未定位根因，不归因于此次修复。

## 后续验收范围

修复 TRJ-01、TRJ-02 后定向复验 C3、F2。另需准备真实改变工具与提示词的隔离场景补测 A9–A12，20 轮以上历史补测 E1，较慢工具补测 E2 的完成前 Schema，以及后台委派通知和真实模型请求失败重试。源码测试已覆盖的变化文字不能替代这些真实界面验收。

隔离环境退出与原文件完整性检查结果见本地 `cleanup.json`；临时会话及凭据随独立数据目录删除，截图和审计证据继续保留本地。
