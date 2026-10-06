# P1：Context 数据契约与请求转换

状态：实现完成，自动化检查通过。依赖：无；产物由 P2–P4 消费。先读 [总计划](README.md)、[共享契约](shared-contracts.md)及总计划必读文档。本阶段不增加持久事件，也不启用新路径策略。

## 目标与检查点

让现有生产请求经过 Context 和唯一转换器；旧 Session、消息顺序、Prompt、附件、工具、请求快照与重试行为不变。阶段结束后用户可以正常运行 Agent/Plan/Chat；后续阶段不落地也不影响使用。

## 允许修改范围

- `packages/context/src/{types,engine,conversion,request-snapshot}.ts`（新增），现有 `assembly.ts`、`plugin.ts`、`manifest.ts`、`index.ts`、package exports/依赖及对应测试。
- `packages/prompt/src/{assembler,request-snapshot}.ts`：抽取可复用渲染/冻结和内部旧 contributor 桥接，不新增第二份公共数据模型。
- `packages/core/agent-loop/src/{loop,testing}.ts`、`src/test/`：转换调用及 fixture。
- `packages/runtime/src/harness/{agent-factory-plugin,default-harness-definition}.ts` 与相关测试、默认 Harness 构建声明。
- `packages/shared/src/context-projection.ts` 及对应测试：仅在最终快照兼容确有差异时修复映射，不改 UI 布局。
- 对应 package README、设计和 history。其他 Session/LLM 实现不在本阶段重写。

## 任务

### P1.1 固定现有行为

- [x] 在 `packages/core/agent-loop/src/test/context-conversion.test.ts` 新建转换回归 fixture，从当前 `surfaceMessage`、`toMessage`、`toLlmContent` 行为固定预期。
- [x] 覆盖 user/assistant/tool、多个 tool-call/result、错误结果、图片 artifact、普通附件、file-reference、response-excerpt、reasoning signature/replay、已有 runtime-context、旧摘要。
- [x] 使用 `packages/prompt/src/test/assembler.test.ts` 和现有 Loop 请求 mock 固定系统段排序、tools、options、实际 prepared metadata、完整 request/context 快照及容量未知值。

验收：新增 fixture 在改转换器前通过；断言具体字段/消息顺序，而非只断言 snapshot 对象存在。

### P1.2 建立公共结构与纯转换

- [x] 按共享契约实现 types.ts；复用 SessionSurfaceView 和 LLM 类型，深冻结可序列化数据，保留状态与内容区分。
- [x] 将 Loop 的通用消息转换移到 conversion.ts。异步注入 artifact resolver；缺失可选附件路径保持现有明确提示，图片引用身份不丢。
- [x] 系统渲染迁入 Context 内部，Prompt 使用同一实现，禁止相互 import。引擎经现有 Context 插件提供 `context.engine`，保持 P1 所需旧 assembler 兼容入口。
- [x] 实现 `toLlmInput` 无状态变化测试：转换前后 Session.lastSeq、Surface、Context 内容相同；不得枚举 status.paths 注入模型。

### P1.3 接入生产路径与旧来源桥

- [x] 新增引擎内部桥接当前 Prompt contributors，`getContext` 产生现有内容；不新增外部 ContextEntry/Assembly 层。
- [x] Agent Factory 注入引擎；Loop 用 `getContext → toLlmInput → llm.prepareAsync`，移除 Loop 私有重复转换函数。
- [x] 保留现有 `system-prompt/assemble` 扩展的阶段兼容，让英语学习继续生效；其结果必须成为本次 Context 与最终输入的一部分，不在冻结后秘密修改请求。
- [x] 初次调用和失败重试共同消费转换器，保留现有 prepared lease、attempt、取消、before-dispatch checkpoint。传输重试复用冻结输入；现有恢复逻辑触发的逻辑重组保留，动态来源按版本去重；工具集合仍对应本次可执行能力。

### P1.4 保持快照和交付

- [x] 内部映射保留 `request/context.snapshot` schemaVersion 2、systemSections、modelFacts、facts、contributorProvenance、renderedSystemPrompt、prepared 与最终非 system messages；原 request/header 字段不改。
- [x] 对照最终 prepare 参数断言快照相等；验证 ContextState 完整桶、实际 contextWindow、旧记录未知容量，禁止固定值回退。
- [x] 旧 Session fixture 只读转换不改变原文件字节；类型与包依赖检查无环，生产只有一条消息转换路径。

## 验证命令

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/context test
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/shared test
pnpm check:packages
pnpm check:docs
```

有意义的通过标准：fixture 全部通过、测试文件确实被发现、旧快照与新请求对齐。编写计划时未执行这些运行时命令。

## 失败与回退

转换差异先定位到具体块类型，保留旧 fixture，不通过更新快照掩盖回归。本阶段未新增持久数据，可以回退本阶段代码恢复原调用链；不删除 Session。P2 完成后不保留双轨开关。

## 收尾

在统一 execution-process 中记录迁移、命令及缺陷，更新包说明。P1 通过后进入 P2；禁止将“引擎已接入”表述为渐进式披露已经实现。

## 实施证据与限制

本阶段代码已完成。实际命令结果、首次测试异步异常及复跑结果见[执行摘要](../../../exec-runs/20261006-context-management-engine/execution-summary.md)。勾选表示工程任务完成，不表示所有产品场景已用真实 Provider 验收；U1–U8 的状态以 Computer Use 报告为准。故障注入使用真实 Journal 编码/投影及模拟失败和持久前缀，未声称执行了每个切点的操作系统掉电实验。
