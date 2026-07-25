# Browser 工具渐进式披露执行计划

## 目标

Browser Bridge 可用时，运行时继续稳定注册全部浏览器 executor，但普通模型调用默认只看到 `browser_help` 入口；入口成功执行后，从下一次 LLM 调用开始，仅在当前 `Agent.run()` 内披露完整浏览器工具包。设置页同步收敛为一个浏览器总开关和默认折叠的高级配置。

## 范围

- 包含：
  - Agent Core 工具 definition 与 ToolManager 可见性状态。
  - Agent Loop 每次模型调用前刷新 definitions。
  - Browser 总开关、折叠分类工具与高风险 capability 设置。
  - Browser system prompt、Context 统计、手动 compact 的可见工具口径。
  - 运行时、设置页、文档、history 与学习沉淀。
- 不包含：
  - 修改 62 条 canonical command、Go handler 或 Chrome Extension。
  - 改变 Browser Session 授权、高风险审批或 Socket 惰性连接语义。
  - 新增另一套 `browser` dispatcher 工具，或重命名现有协议工具。

## 背景

- 相关文档：
  - `docs/design-docs/browser/agent-browser-use-index.md`
  - `docs/design-docs/browser/agent-browser-use-integration-design.md`
  - `docs/design-docs/frontend/front-设置页规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/agent-core/src/tools/types.ts`
  - `packages/agent-core/src/tools/manager.ts`
  - `packages/agent-core/src/tools/tools/browser/definition.ts`
  - `packages/agent-core/src/engine/agent.ts`
  - `packages/agent-core/src/engine/loop.ts`
  - `packages/desktop/src/main/agent-runtime-context.ts`
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
  - `packages/desktop/src/renderer/components/settings/tool-catalog.ts`
- 已知约束：
  - 当前工作树已有未提交修改，`agent.ts`、`loop.ts` 与部分测试存在重叠改动，必须使用最小补丁保留现状。
  - `browser_help` 只负责发现与 schema 查询；披露不能视为浏览器执行授权。
  - 工具顺序必须确定，普通 Turn 的 prompt cache 前缀应保持稳定。

## 风险

- 风险：入口与隐藏工具出现在同一批 tool calls 时，顺序执行可能意外放行隐藏工具。
- 缓解方式：gateway 成功后只写入 pending group，在下一次 LLM 调用前 commit。
- 风险：只改主 Agent 注入路径，手动 compact 或 Context 详情重新暴露全量工具。
- 缓解方式：所有消费者统一调用 `getToolDefinitions()`，禁止从 `getAll()`自行转换。
- 风险：浏览器总开关覆盖用户已有细粒度禁用偏好。
- 缓解方式：使用独立 `browser` group marker，关闭时保留子项；兼容历史 `browser_help` 禁用状态。
- 风险：设置页改动破坏 Kairos 复用的扁平工具清单。
- 缓解方式：保留 `TOOL_ITEMS` 单一事实来源，只增加分组元数据和派生列表。

## 里程碑

1. 落地 ToolManager 注册态与可见态分离。
2. 接入 Browser definitions、Agent Loop 与 runtime prompt。
3. 收敛设置页浏览器工具信息架构。
4. 补测试、文档、history、学习文档和验证证据。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core exec vitest run src/tools/test/manager.test.ts src/engine/test/loop.test.ts src/tools/tools/browser/test/browser-tools.test.ts`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/settings-page.test.tsx src/main/test/agent-runtime-context.test.ts src/main/test/context-describe-service.test.ts`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm check:browser`
  - `pnpm check:docs`
  - `git diff --check`
- 手工检查：
  - 设置页默认只显示浏览器总入口，高级项默认折叠且可访问。
  - 总开关关闭/开启不会丢失子项禁用状态。
- 观测检查：
  - 普通 Turn 的 Context 工具列表只有 `browser_help`。
  - `browser_help` 成功后，下一次 LLM 调用看到完整 Browser 工具包。
  - 下一条用户消息重新回到单入口状态。

## 进度记录

- [x] 确认目标、边界和实现方案。
- [x] 完成 Agent Core 渐进式披露。
- [x] 完成设置页渐进式披露。
- [x] 完成测试、设计文档、history 与 learning 同步。
- [x] 完成自动化工程验证；按用户约定不启动 Desktop / Electron，界面交互由用户手工验收。

## 决策记录

- 2026-07-25：动态改变模型可见 definitions，不动态注册/注销 executor，以保持资源、权限和工具顺序稳定。
- 2026-07-25：复用 `browser_help` 作为唯一初始入口，不新增 `browser` 协议工具。
- 2026-07-25：披露作用域限定为单次 `Agent.run()`，gateway 成功后的下一次 LLM 调用才生效。
- 2026-07-25：全量测试、类型检查、构建和仓库检查通过后归档；UI / Electron 验收由用户接手。
