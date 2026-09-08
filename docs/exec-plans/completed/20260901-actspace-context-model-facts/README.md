# ActSpace Context 面板与模型能力事实收敛

状态：已完成，2026-09-09 归档。P00/P01 与 G1 自动化回归通过；G2 Electron、真实 Provider 和截图人工验收仍待完成。

## 目标

把 Context 面板从固定 `200_000` 和 provider usage 两桶适配，收敛到 Session Journal 中当次请求的 model facts 与 request snapshot。完成后，模型上下文容量、Context 分类、输入框临时模型选择、设置页默认模型和 Session 实际请求模型各自有清晰来源。

## 设计真源

- [Context 面板与模型能力事实规范](../../../design-docs/model-context/agent-context-model-facts-and-composer.md)
- [Token Usage 与 Context Projection](../../../design-docs/model-context/agent-token-usage-and-context-state.md)
- [多供应商 LLM 架构](../../../design-docs/model-context/agent-multi-provider-llm.md)
- [Session 持久化事实源与投影收敛](../../active/20260830-actspace-session-persistence-projection/README.md)
- 参考实现：`tmp/deepseek-harness/docs/user/guide/providers.zh.md`、`tmp/deepseek-harness/packages/core/agent-default-model/src/index.ts`

## 范围

包含：

- request/header 与 request/context.prepared 的 model facts 固化；
- Context Projection 使用最近 request snapshot 的完整 bucket；
- ContextPopup 与 Composer 数据传递、宽度、整数格式和零容量状态；
- 模型定义、默认模型、临时模型选择的测试与文档同步。

不包含：

- API Key 存储边界调整；
- settings.json 改为 YAML 或引入新的设置数据库；
- Context entry 编辑、pin、exclude、跨 Session memory；
- MCP / Subagent 新分类的持久化协议扩展；
- Electron 打包、真实 Provider 和手工截图门禁以外的额外发布工作。

## 计划拆分

| 子计划 | 目标 | 依赖 | 可独立合并 |
| --- | --- | --- | --- |
| [P00 Request Model Facts](./p00-request-model-facts.md) | 在请求准备和 Journal 记录中固化模型 contextWindow，去除 Projection 固定容量 | 设计规范；现有 LLM route/model resolver | 是，先不改变 Popup 样式 |
| [P01 Context Popup Projection](./p01-context-popup-projection.md) | 让 Popup 使用完整 request snapshot bucket，并完成宽度与数字格式 | P00；现有 ContextState projector | 是，旧 Session 按零容量显示 |

## 依赖图

```text
P00 Request Model Facts
          │
          ▼
P01 Context Popup Projection + Composer wiring
          │
          ▼
G1 automated regression + theme checks
          │
          ▼
G2 Electron / real-provider / screenshot manual acceptance
```

## 全局验收门

### G0 Contract

- model facts 在 request/header 与 request/context.prepared 中一致；
- 旧 Session 不因缺失字段生成 200K 假值；
- provider usage 与 Context estimate 仍是不同 projection。

### G1 Automated

- Session projection、LLM loop、Desktop projection、ContextPopup、Composer 相关测试通过；
- `pnpm -r typecheck`、`pnpm -r test`、`pnpm run check:docs`、`pnpm run check:current-docs`、`pnpm run check:frontend-theme` 通过；
- `git diff --check` 通过。

### G2 Manual boundaries

- Electron 中确认 Context 面板与输入框左右对齐；
- 使用不同 contextWindow 模型确认容量随请求变化；
- 确认输入框临时切换不会修改默认模型；
- 确认设置页默认模型修改在重启后生效；
- 确认真实 Provider、Electron reload/quit、打包制品仍单独记录，不由自动化测试冒充通过。

## 风险与回退

- model facts seam 变更失败：保留现有 request snapshot，Projection 对缺失容量按 0 展示；不恢复 200K 伪回退。
- Popup 数据源切换回归：回退 renderer consumer 到旧 adapter，但保留 P00 的 Journal 字段和纯 projector 测试；不修改 Session 历史。
- 主题样式回归：只回退 ContextPopup 的视觉 patch，保留数据契约和格式化函数。
- 所有回退不得删除 Session、settings.json、secrets.json 或模型定义。

## 进度记录

- [x] 2026-09-01：完成当前 ActSpace 实现、DeepSeek Harness 参考和配置持久化边界调查。
- [x] 2026-09-01：建立 Context / model facts 长期设计规范。
- [x] 2026-09-01：拆分 P00 / P01 执行计划并登记入口。
- [x] P00 Request Model Facts。
- [x] P01 Context Popup Projection。
- [x] G1 自动化回归：2026-09-09 全仓 typecheck/test、文档、主题与 diff 检查通过。此前两个阶段的类型阻塞已消除，历史过程记录仍保留。
- [ ] G2 Electron、真实 Provider 和截图人工验收。

## 执行模式

交互模式。P00 涉及 Journal contract 和模型能力事实，P01 涉及 Desktop 数据源切换与主题 UI；每个子计划完成后先验证，再进入下一阶段。

## 执行记录

执行开始时，在 `docs/exec-runs/20260901-actspace-context-model-facts/` 创建 `execution-process.md` 和 `execution-summary.md`。

## 2026-09-09 阻塞复核（当时记录，已解除）

本次 `pnpm -r --if-present typecheck` 在 Desktop 的 `src/renderer/test/fixtures/chinese-ui-preview.tsx:25` 失败：`ComposerReviewSummary` 不接受 `state` 字段。该 fixture 属于独立中文界面任务，本轮仅记录，不修改其代码。此前 ProviderSettings `onChanged` 错误与 trajectory 计划登记问题已不再复现；原执行摘要保留当时结果。

随后中文界面任务自行完成并归档。重新运行 `pnpm -r --if-present typecheck` 与 `pnpm -r --if-present test` 均通过；Desktop 97 个文件、651 个用例通过。文档、主题和 diff 检查通过，G1 解除阻塞，本计划移入 completed。G2 人工项继续按上文清单验证，未由另一个任务的中文界面验收代签。

## 归档后交接

执行证据见 [Context 执行摘要的最新补充](../../../exec-runs/20260901-actspace-context-model-facts/execution-summary.md)。下一步仅是 G2 人工验收；Session 持久化与投影总计划的最终消息映射和 G1 不属于本计划完成结论。
