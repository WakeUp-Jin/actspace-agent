# P3：压缩策略接入与 OpenCode 摘要模板

状态：实现完成，自动化检查通过；真实模型/实机覆盖限制见执行摘要。依赖：P2；P4 消费本阶段压缩协调入口。先读[总计划](README.md)、[共享契约](shared-contracts.md)和[提示词规范](../../../design-docs/上下文管理引擎设计/agent-compaction-prompt.md)。本阶段只需现有 Session 和摘要即可交付，不等待披露目录。

## 允许修改范围

- `packages/compaction/src/{plugin,summarizer,region,policy}.ts`、新增 `prompts.ts`、`OPEN_CODE_LICENSE.txt`、现有测试与 exports/manifest。
- `packages/context/src/engine.ts`、新增 `compaction.ts` 及策略注册/协调测试。
- `packages/core/agent-loop/src/loop.ts` 自动压缩接线和 `auto-compaction.test.ts`。
- `packages/runtime/src/harness/{agent-factory-plugin,managed-runs,default-harness-definition}.ts`、相关测试与构建声明。
- 只增加 Session 压缩 golden 测试，不重定义 core 压缩事务。

## 任务

### P3.1 唯一策略入口

- [x] 引擎注册可选压缩策略，最多一个；提供 `compact(session, options)` 操作，内部建立一致 Context 并调 shouldCompact/compact，调用期间按 Session 串行。
- [x] 手动 `/compact` 的 ManagedRuns 与 Loop 自动压缩都调用此入口，保留现有进度、耗时、失败与无需压缩 UI 语义。
- [x] 取消 Factory 对 `compaction.runtime` 的硬注入；默认 Harness 启用它，但禁用时正常请求仍可运行，手动操作明确返回能力不可用。
- [x] 压缩策略产生摘要/候选路径/区间，引擎沿用 Session appendMany/flush 提交。关闭或替换行为不更换 Session 格式。
- [x] 手动压缩可能位于两个 Turn 之间：ContextRequest 的 turnId/stepId 可缺省，正常请求仍校验必填，不伪造已存在的 Turn/Step 事件身份。

### P3.2 固定提示词资源

- [x] 将设计文档中的 OpenCode 系统指令、完整模板和旧摘要更新规则落到 prompts.ts；完整保留 `Relevant Files`。代码注释记录固定 commit/源码路径，包附 MIT 原文。
- [x] 复用当前 LLM summarizer 的工具禁用、空摘要/错误处理、释放 prepared call 和 utility 路由优先；取消信号贯穿，不新增模型配置或外部依赖。
- [x] 模型输出仅摘要文本；压缩内部扩展可选 pathlist，旧返回 content/metadata 的 summarizer 继续可用。代码从明确引用、原始压缩区域收集引用，摘要文件章节只能补充，不能成为唯一来源。
- [x] 从有效 Surface 中分离前次摘要和新历史，各出现一次。原始普通 user 内容不能仅因标题相似而被当作摘要；用替换来源/compaction 身份识别。
- [x] 原样保留工具结果、错误、用户纠正和未完成事项的语义；排除可识别 Runtime 导航，不删除用户正文中的相关文件章节。

### P3.3 区间、提交与故障

- [x] 保留当前触发算法与用户配置。当前默认 policy 为 128000 tokens / 16000 reserve / 0.8 ratio / minimum 4 entries；不借此重构暗改阈值，也不把这些默认值当成模型实际容量展示。
- [x] 验证当前 region 不拆 tool-call/results；若候选边界落在工具批次中，将边界退回最近完整消息组，无安全区间则明确跳过。
- [x] 摘要开始前记录 Surface generation/来源，结束后重新校验；新输入改变区域时舍弃该候选，不替换新用户内容。
- [x] 保留 `createCompactionTransaction` 连续四事件与精确 sourceEventSeqs、durationMs；没有披露插件时不产生披露周期事件。
- [x] 摘要错误/取消/空输出不产生 Surface 替换。持久化故障不继续发送下一请求；观察者回调不能改变提交语义。

## 验证

新增或扩展 `packages/compaction/src/test/{compaction,prompt}.test.ts`、Context 策略测试、Loop auto-compaction、Runtime managed-runs 测试。

样例覆盖：首次压缩；连续两次压缩仍保留早期约束；新事实纠正旧结论；完成/计划/未验证不混淆；Relevant Files 存在；摘要遗漏文件仍在候选 pathlist；工具组边界；手动/自动共用入口；关闭策略；中途用户输入；摘要取消/错误/写失败。

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/compaction test
pnpm --filter @actspace/context test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/runtime test
pnpm check:packages
pnpm check:docs
```

真实模型质量验收：通过已有 utility/provider 路由执行上述固定双次压缩样例，保存脱敏输入摘要、输出和逐项结果；人工检查约束、纠正、未完成事项、错误与文件章节。没有可用 provider 时记录“真实摘要质量未验证”，不能用 fake 模型输出代替。

## 回退与交付

提示词可回退到前一内置版本，已提交摘要仍留在 Session；不重新写历史。策略接线故障可以禁用自动压缩但必须保留 Context/Codec，长对话届时受已有模型窗口限制，不能声称已恢复完整能力。本阶段交付完整压缩路径，P4 只接入引用整理，不再次迁移手动/自动入口。

## 实施证据与限制

本阶段代码已完成。实际命令结果、首次测试异步异常及复跑结果见[执行摘要](../../../exec-runs/20261006-context-management-engine/execution-summary.md)。勾选表示工程任务完成，不表示所有产品场景已用真实 Provider 验收；U1–U8 的状态以 Computer Use 报告为准。故障注入使用真实 Journal 编码/投影及模拟失败和持久前缀，未声称执行了每个切点的操作系统掉电实验。
