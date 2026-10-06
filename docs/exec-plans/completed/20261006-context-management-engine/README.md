# 上下文管理引擎执行计划

状态：2026-10-06 P1–P4 实现与自动化检查完成；真实 Provider/U1–U8 验收边界见执行摘要。执行模式：交互模式；用户授权执行本计划后按依赖顺序推进，不重复询问已确认的产品规则。

## 目标与范围

将当前散落在 Prompt、Agent Loop、工具与 Compaction 的上下文组织收敛为 `Context → toLlmInput → LlmInput`，由 Cordis 管理一个引擎、六个来源和两个策略。复用现有包与 Session 事实模型，支持动态补充、按周期管理的最多 100 条活跃文件引用及睡眠索引。

包含 Context/转换器、来源注册撤销、模型 Prompt 扩展点、AGENTS 刷新、现有 Skill、动态信息、会话和工具来源、OpenCode 摘要模板、披露状态与历史访问、恢复/fork/请求快照兼容。保持 `Relevant Files` 章节，允许摘要与独立路径列表重复。

不包含新的模型专用 Prompt 内容、记忆或质量检查 Agent、工作流沉淀、文件版本库/监听、历史摘录格式、业务状态驱动的工具许可、新设置页面、Session 格式迁移、提交/推送/发布。

这是跨包重构，预计超过 8 个文件；新增一个引擎服务入口，复用现有 `@actspace/context` 包，不创建九个 workspace package。来源与策略具有独立注册/撤销生命周期，不等于各自拥有持久服务、数据库或配置页。

## 必读与唯一契约

执行任一子计划前先读根 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/CODING_BEHAVIOR.md`、`docs/design-docs/agent-plugin-runtime/agent-testing.md`，再读：

- [共享实施契约](shared-contracts.md)：字段所有权、持久化、重试、压缩、fork 与依赖约定，各阶段不得另造契约。
- [Context 数据结构](../../../design-docs/上下文管理引擎设计/Context数据结构和模型输入数据结构的设计规范.md)。
- [插件拆分](../../../design-docs/上下文管理引擎设计/上下文管理引擎的插件拆分和上下文的插件拆分.md)。
- [渐进式披露](../../../design-docs/上下文管理引擎设计/agent-progressive-disclosure.md)。
- [压缩提示词](../../../design-docs/上下文管理引擎设计/agent-compaction-prompt.md)：固定 OpenCode `f03046d9f558bc54a090363fea48441b05f522bf`，实现不自动追踪上游。

阶段开始还要读取 `docs/HISTORY_GUIDE.md` 与 `docs/QUALITY_SCORE.md`。保留当前未提交设计文件和其他无关工作区修改。

## 设计复核结论

没有需要重新选择产品方向的阻塞；以下不是“已实现”，而是本计划明确承担的实施修正。

| 源码发现 | 实施决定 | 落点 |
| --- | --- | --- |
| Context 包目前只有 contributor assembler，模型消息转换仍在 Loop | 先建立兼容转换，保持原消息、附件和快照语义 | P1 |
| AGENTS 源按工作区永久缓存；Chat 只加载用户规则 | 按用户 Turn 刷新；Agent/Plan 加载两处，Chat 保留用户规则和无工作区 Skill 的边界 | P2 |
| 动态补充不是合法的新 Surface 消息种类 | 使用纯插件事件，组装时合并，锚点不拆开 tool-call/results | P2 |
| Context 没有持久 Codec；默认 Harness 的执行入口与 Host 解码路径不同 | Host 先发现纯 Codec；行为停用仍保留解码，不能只在 Harness 激活时注册 | P2 |
| Agent Factory 硬依赖 compaction.runtime；手动 compact 单独调用 | 改为引擎可选策略，手动/自动共用唯一压缩入口 | P3 |
| 压缩提交当前是四条连续 core 事件，后续计数更新不是磁盘原子事务 | 压缩前保存有身份的候选引用，只有有效 compaction/end 推进周期，重放恢复缺失派生状态 | P4 |
| read_file 缓存只看文件与范围；旧正文压缩后仍可能返回 unchanged | 缓存键加入有效 Surface replaceGeneration，不改文件内容版本管理 | P4 |
| 原始 Journal 位于工作区外；fork 只自动处理类型化 artifact 引用 | Host 提供受控只读原始路径；睡眠索引保存 artifact 身份，fork 重建子会话导航 | P4 |
| Context 面板由现有 request/context 与实际模型 facts 派生 | 保留快照字段，补充内容计入最终请求；容量缺失仍为未知，不猜固定值 | P1/P4 |

## 阶段与可运行检查点

```text
P1 Context 与转换兼容
  → P2 独立来源、补充与持久化
  → P3 压缩策略与 OpenCode 模板
  → P4 渐进式披露、历史读取与完整验收
```

| 计划 | 完成后的可用状态 | 依赖 |
| --- | --- | --- |
| [P1 数据契约与转换](phase-1-context-conversion.md) | 生产请求经过 Context，现有 Prompt/历史/工具/重试行为保持；无新持久事件 | 无 |
| [P2 来源插件与动态补充](phase-2-sources-and-state.md) | 六来源可独立管理，AGENTS 刷新、动态尾部和插槽可用；现有压缩继续工作 | P1 |
| [P3 压缩策略与摘要](phase-3-compaction.md) | 手动/自动压缩统一，可关闭压缩，完整 OpenCode 摘要可用；还不展示披露目录 | P2 |
| [P4 引用披露与集成验收](phase-4-disclosure.md) | 文件引用、100 条上限、睡眠索引、周期恢复及原始历史读取全链路可用 | P3 |

按顺序执行，不安排并行修改共享契约。每阶段都有生产用途，可独立验证和合并；不设“先写空框架，等最后一阶段才启用”的交付点。P1 的旧来源桥接在 P2 删除，旧转换器不保留为第二条长期生产路径。

## 成功标准与追踪

| 用户设计要求 | 任务/证据 |
| --- | --- |
| 对外只理解 Context/LlmInput，保留 Session | P1.1–P1.4；旧 Journal golden 与转换对照 |
| 一个引擎、六来源、两策略，低耦合 | P2.1/P3.1/P4.1；注册撤销、构建依赖及 Harness 装载测试 |
| AGENTS/Skill/动态内容分开，模型 Prompt 可扩展 | P2.2–P2.4；模式与跨 Turn fixture |
| 请求尾部补充、缓存前缀、插槽 | P2.3/P2.5；完整工具批次、重试、压缩和 fork fixture |
| 完整 OpenCode Relevant Files + 独立 pathlist | P3.2/P4.2；两次压缩样例与引用抽取测试 |
| 周期计数、睡眠下一次压缩恢复、最多 100 文件 | P4.1–P4.3；100/101 边界、目录与并列排序测试 |
| 原始历史可访问，不生成摘录 | P4.4；真实 JSONL + 工具权限集成 |
| 取消注册不删历史，已有界面可用 | P2.1/P4.5；卸载重启、投影及实机验收 |

## 风险、依赖与回退

最大风险是把 `appendMany` 成功误认为所有上下文状态已原子落盘。共享契约明确以有效、持久的压缩完成记录恢复周期；故障注入必须覆盖每个提交边界。不得修改 core 事件协议来绕过此要求。

第二个风险是临时桥接永久化。P2 完成时 Loop 只调用引擎，来源不再通过 `createCoreContributors` 汇总后第二次组装；旧类型仅在已有快照兼容模块中使用。

回退代码不得删除或改写用户 Journal。P1 无新事件，可直接回退该切片。P2 起保留新增 Codec，再停用行为/回退实现；不认识 required 事件的旧二进制只能 browse-only，不承诺无损向旧二进制写入回退。

实现依赖当前 pnpm/TypeScript/Vitest、Cordis 和已有 Host/LLM 服务，无新增外部服务或包安装计划。自动测试使用 fake provider，不需要密钥。真实摘要验收使用用户已配置的 LLM provider，由现有凭据解析器读取；未配置则明确记录未验证，不请求把密钥写进文件。OpenCode 仅为固定版本提示词来源，构建/运行不依赖本地参考仓库或网络拉取。

## 验证和交付

每阶段先执行自己的定向测试；P4 执行整体检查和实机范围。当前计划编写只验证文档，不把源码阅读当作行为测试通过。

执行开始创建 `docs/exec-runs/20261006-context-management-engine/execution-process.md` 和 `execution-summary.md`，遵循模板。每阶段写入实际命令、失败、修复及未覆盖范围。全部代码完成后按仓库规则将计划移动到 completed，修正链接；人工未覆盖项明确保留在摘要。代码变更记录继续当前专题 history；满足学习文档条件时按写作指南另记。

- [x] 设计、源码边界与实施风险复核。
- [x] 执行计划、共享契约、阶段任务和验收矩阵编写。
- [ ] P1 实施及验证。
- [ ] P2 实施及验证。
- [ ] P3 实施及验证。
- [ ] P4 实施、完整验证及交付。

下一步：获得执行授权后，从 P1.1 的旧行为固定测试开始，不重新讨论已确认的设计。
