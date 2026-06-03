# 清理运行时 Mock 假数据执行计划

## 目标

把普通产品运行路径里的 mock / demo / fake 数据清理掉，让桌面端首屏、设置页、Composer、Sidebar、Lab 等用户可见区域只展示真实数据、空态或明确的未接入状态。`MockLLMService`、单元测试 fixtures 和测试用 mock 数据保留在测试边界内，用来继续验证 Agent 执行循环、工具调用、上下文压缩和 UI 组件状态。

## 范围

- 包含：
  - 清理 renderer 运行时可见假数据：`App.tsx`、`Composer.tsx`、`Sidebar.tsx`、`SettingsPage.tsx`、`LabPage.tsx` 中的 mock 数据 fallback。
  - 将浏览器无 Electron bridge 时的体验从“展示假业务数据”调整为“空态 / bridge 不可用提示 / 仅可测试的局部交互”。
  - 拆分或下沉 `packages/desktop/src/renderer/fixtures/**`：运行时不再 import 这些 fixture；测试可继续 import 或迁移到 `test/fixtures`。
  - 同步更新前端验证、Lab 状态、质量评分和相关设计文档中关于 mock 运行时的描述。
  - 补充 history 记录本次清理边界、验证结果和后续债务。
- 不包含：
  - 不删除 `packages/agent-core/src/llm/services/mock.ts`。
  - 不删除 `MockLLMService`、`mockText`、`mockToolCall`、`mockError` 等测试 helper。
  - 不重写 agent-core 的测试体系，不把所有测试改成真实 LLM。
  - 不在本计划内实现完整 Lab Runtime / IPC / Persistence；Lab 在真实后端落地前只展示空态或本地临时草稿态。
  - 不改真实 provider 选择逻辑，除非发现 mock provider 被普通 Electron turn 静默使用。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/PLANS_GUIDE.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/lab-implementation-progress.md`
  - `docs/design-docs/lab-frontend-page-design.md`
  - `docs/design-docs/agent-testing.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
  - `packages/desktop/src/renderer/components/LabPage.tsx`
  - `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
  - `packages/desktop/src/renderer/fixtures/labFixture.ts`
  - `packages/desktop/src/renderer/fixtures/usageStatisticsFixture.ts`
  - `packages/agent-core/src/llm/services/mock.ts`
  - `packages/agent-core/src/fixtures.ts`
  - `packages/shared/src/test/fixtures/**`
- 已知约束：
  - 普通 Electron 真实 turn 已要求走真实 provider；mock 只能用于测试、浏览器 fixture 或显式 demo。
  - 当前 renderer 浏览器直开时会从 `workbenchFixture.ts` 填充大量假会话、假消息、假上下文和假 workspace。
  - 当前 Lab 页面直接从 `labFixture.ts` 加载假实验矩阵，并在内存中模拟推进、暂停、取消和已完成实验。
  - 当前测试仍依赖稳定 mock LLM 跑通 Agent 端到端 smoke；删除 `MockLLMService` 会破坏测试能力。

## 风险

- 风险：清理 renderer fixture 后，浏览器直开可能白屏或大量组件缺少 props。
  - 缓解方式：先定义空态数据结构和 bridge 不可用状态，再移除假数据 import；保留组件测试覆盖空数组、null snapshot 和 bridge 缺失。
- 风险：误删测试 fixture，导致 agent-core 或 renderer 测试大面积失败。
  - 缓解方式：只从非测试入口移除 mock import；`**/test/**`、`*.test.ts(x)`、`packages/shared/src/test/fixtures/**` 默认保留。
- 风险：Lab 清空假数据后页面功能看起来“退化”。
  - 缓解方式：文档同步说明 Lab 真实 Runtime 尚未实现；页面保留创建草稿的局部内存能力时，需要明确刷新不保证持久化。
- 风险：文档仍指导使用“浏览器 mock 验证”，和新目标冲突。
  - 缓解方式：把文档措辞从“mock 数据验证”调整为“浏览器 renderer 空态 / bridge 不可用验证”，同时保留测试 fixture 的合法性。
- 风险：`.env.example` 中 `MOCK_MODE` 被误解为成熟项目普通运行选项。
  - 缓解方式：如果实现阶段确认不再需要显式 demo fallback，则将其文档语义收窄为测试专用；不影响真实 Electron 默认 provider。

## 里程碑

1. 调研与边界收敛。
   - 盘点所有非测试运行时 mock import。
   - 确认 `MockLLMService` 保留为测试专用能力。
   - 标记需要从运行时移除、迁移或改为空态的文件。
2. Renderer 运行时清理。
   - `App.tsx` 不再用 `mockSessions`、`mockMessages`、`mockTurnResult`、`mockContextSnapshot` 填充普通 UI。
   - 无 bridge 或无真实 session 时展示空会话 / 空上下文 / 空 workspace 状态，不再自动创建 demo turn。
   - `Composer.tsx` 移除默认 demo 附件；文件选择不可用时给出明确不可用反馈或保持空附件。
   - `Sidebar.tsx` 移除 `MOCK_SCHEDULED` 假计划列表，改为空态或隐藏该分组。
   - `SettingsPage.tsx` 移除 mock 设置、mock prompt path、mock archived sessions；bridge 不可用时只显示受限状态。
3. Lab 运行时清理。
   - `LabPage.tsx` 不再从 `labFixture.ts` 初始化假实验。
   - 页面默认四列为空，已完成实验为空。
   - 如保留“新实验”本地临时交互，必须只从用户输入生成卡片，不预置任何假实验。
   - 测试用 Lab fixture 留在测试边界，或把 `labFixture.ts` 移到更明确的测试 fixture 路径。
4. 测试 fixture 边界整理。
   - `packages/desktop/src/renderer/fixtures/workbenchFixture.ts` 不再被生产 renderer 入口引用。
   - 保留测试需要的 fixture，必要时迁移到 `packages/desktop/src/renderer/test/fixtures/**` 并更新测试 import。
   - `usageStatisticsFixture.ts` 仅供 `usage-statistics-page.test.tsx` 使用，不进入运行时。
   - agent-core 的 `MockLLMService` 和 fixtures 保持不变，必要时只补注释说明测试边界。
5. 文档同步与验证收尾。
   - 更新 `docs/FRONTEND_VERIFICATION.md` 中“浏览器 mock 验证”的措辞和边界。
   - 更新 `docs/design-docs/lab-implementation-progress.md` 和 `docs/design-docs/lab-frontend-page-design.md`，说明 renderer mock 初始数据已移除、Lab 后端仍未实现。
   - 更新 `docs/QUALITY_SCORE.md` 中 mock provider 相关描述，避免把测试能力写成产品运行能力。
   - 按 `docs/HISTORY_GUIDE.md` 写入 `docs/histories/2026-06/`。

## 分阶段任务

### Step 1: 非测试 mock 引用清单

- 读取并确认：
  - `rg -n "mock|Mock|fixture|demo|Demo|showDemo|MOCK_" packages/desktop/src/renderer --glob '!**/test/**'`
  - `rg -n "MockLLMService|services/mock|deepseek-mock|MOCK_MODE" packages/agent-core/src --glob '!**/test/**'`
- 输出：
  - 在本 plan 的进度记录里补充实际发现的运行时入口。
- 验证：
  - 清单中每一项都被标记为“删除 / 改空态 / 测试保留 / 文档保留”。

### Step 2: App 首屏和会话列表空态

- 修改目标：
  - `packages/desktop/src/renderer/App.tsx`
- 具体动作：
  - 移除从 `workbenchFixture.ts` 导入的运行时默认数据。
  - 去掉无真实 session 时自动 run `session-learning-doc-plan` 的 demo turn。
  - `sessions` 默认空数组，`sessionRecord` / `turnResult` 默认 `null`。
  - `persistedMessages` 在无 bridge 且无真实记录时返回空数组。
  - `contextSnapshot` 在没有真实 snapshot 时返回 `null`，让下游组件走空态。
  - `WorkbenchLayout` 传入真实 `sessions`，不再 `sessions.length > 0 ? sessions : mockSessions`。
- 验证：
  - `pnpm --filter @actspace/desktop typecheck`
  - renderer 测试中覆盖无 session、无 context snapshot 的首屏。

### Step 3: Composer 和 Sidebar 假 UI 清理

- 修改目标：
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
- 具体动作：
  - 删除 `MOCK_ATTACHMENTS` 和 `showDemoAttachments` prop 链路。
  - 文件选择 bridge 缺失时不插入 fake attachment。
  - 删除 Sidebar 中 `MOCK_SCHEDULED` 渲染；如该区块没有真实数据源，则显示空态或暂不渲染。
- 验证：
  - 更新 `composer.test.tsx`，删除“falls back to mock attachments”期望，改为 bridge 不可用时附件为空。
  - 更新 Sidebar 相关测试，确认无假计划项。

### Step 4: Settings 假设置清理

- 修改目标：
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- 具体动作：
  - 移除 `MOCK_SETTINGS` 和 `MOCK_PROMPT_FILE` 的运行时兜底。
  - `getSettings` / `readAgentSystemPrompt` bridge 不可用或失败时显示不可配置状态，而不是伪造路径和设置。
  - 归档会话无 bridge 时显示空态，不再展示 `mockArchivedSessions`。
- 验证：
  - 更新 `settings-page.test.tsx`，覆盖 bridge 不可用时的禁用态 / 空态。
  - `pnpm --filter @actspace/desktop test -- settings-page.test.tsx`

### Step 5: Lab 初始假数据清理

- 修改目标：
  - `packages/desktop/src/renderer/components/LabPage.tsx`
  - `packages/desktop/src/renderer/fixtures/labFixture.ts`
  - `packages/desktop/src/renderer/test/lab-page.test.tsx`
- 具体动作：
  - `LabPage` 默认 `cards=[]`、`completedExperiments=[]`、`selectedCardId=null`。
  - 新实验仍可从用户输入生成本地临时卡片；不再预置 `Agent CLI Forge`、`Frontend Verification` 等假实验。
  - 如果 `labFixture.ts` 仅剩测试用途，迁移或重命名为测试 fixture。
  - 空列展示既有空态文案，不渲染假卡片。
- 验证：
  - `pnpm --filter @actspace/desktop test -- lab-page.test.tsx`
  - 测试覆盖空矩阵、新建实验、详情弹窗、推进、暂停 / 取消后的本地状态。

### Step 6: Fixture 文件边界收敛

- 修改目标：
  - `packages/desktop/src/renderer/fixtures/**`
  - `packages/desktop/src/renderer/test/**`
- 具体动作：
  - 运行时不再引用 `renderer/fixtures/**`。
  - 测试仍需要的数据迁移到 `packages/desktop/src/renderer/test/fixtures/**`，或给现有 fixture 文件加清晰测试用途边界并确保生产入口无 import。
  - 删除已经无人引用的运行时 mock fixture 文件。
- 验证：
  - `rg -n "renderer/fixtures|\\.\\./fixtures|\\.\\./\\.\\./fixtures" packages/desktop/src/renderer --glob '!**/test/**'` 不应再出现运行时 fixture import。
  - `pnpm --filter @actspace/desktop typecheck`

### Step 7: Agent 测试 mock 保留确认

- 修改目标：
  - `packages/agent-core/src/llm/services/mock.ts`
  - `packages/agent-core/src/fixtures.ts`
  - `docs/design-docs/agent-testing.md`
- 具体动作：
  - 保留 `MockLLMService` 和 agent-core fixtures。
  - 如有必要，补一行注释或文档说明：这些 mock 是测试设施，不是普通产品运行时假数据。
  - 不修改真实 provider 默认路径。
- 验证：
  - `pnpm --filter @actspace/agent-core test`

### Step 8: 文档、history 和最终验证

- 修改目标：
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/lab-implementation-progress.md`
  - `docs/design-docs/lab-frontend-page-design.md`
  - `docs/QUALITY_SCORE.md`
  - `docs/histories/2026-06/<timestamp>-runtime-mock-data-cleanup.md`
- 具体动作：
  - 把“浏览器 mock 验证”更新为“浏览器 renderer / bridge 不可用验证”，说明不得依赖假业务数据证明产品状态。
  - Lab 文档从“renderer mock 已落地”改为“mock 初始数据已清理；真实 Runtime / IPC / Persistence 尚未实现”。
  - 记录 `MockLLMService` 保留为测试设施的决策。
- 验证：
  - `pnpm typecheck`
  - `pnpm test` 或按实际风险运行 `pnpm --filter @actspace/desktop test` 与 `pnpm --filter @actspace/agent-core test`
  - 如修改前端真实显示，启动 `pnpm dev:log`，确认 Electron 首屏无假会话、假上下文、假附件、假 Lab 数据。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm typecheck`
  - `pnpm test`
- 手工检查：
  - Electron 首次启动没有 `Learning documentation plan` 等假会话。
  - 无真实会话时中间消息区为空态，不展示 mock assistant / thinking / tool result。
  - Composer 默认没有 `mock-screenshot.png` 等假附件。
  - Sidebar 不展示硬编码 scheduled 假任务。
  - Settings 无 bridge 或读取失败时不展示 `/mock/prompts/main-agent.md`。
  - Lab 首屏没有预置实验卡片；新建实验只来自用户输入。
- 观测检查：
  - `rg -n "mockSessions|mockMessages|mockTurnResult|mockContextSnapshot|mockArchivedSessions|MOCK_ATTACHMENTS|MOCK_SCHEDULED|MOCK_SETTINGS|MOCK_PROMPT_FILE|initialLabCards" packages/desktop/src/renderer --glob '!**/test/**'` 不应再命中运行时假数据。
  - `rg -n "MockLLMService" packages/agent-core/src` 仍应命中测试和测试 helper。

## 进度记录

- [x] 初步盘点运行时 mock 来源：`App.tsx`、`Composer.tsx`、`Sidebar.tsx`、`SettingsPage.tsx`、`LabPage.tsx` 是主要用户可见入口。
- [x] 确认 `MockLLMService` 保留为测试设施，不作为本次清理对象。
- [x] 用户批准继续执行本 execution plan。
- [x] Step 1：补齐非测试 mock 引用清单。
- [x] Step 2：清理 App 首屏和会话列表假数据。
- [x] Step 3：清理 Composer 和 Sidebar 假 UI。
- [x] Step 4：清理 Settings 假设置。
- [x] Step 5：清理 Lab 初始假数据。
- [x] Step 6：收敛 renderer fixture 边界。
- [x] Step 7：确认 agent-core 测试 mock 保留；未修改 `MockLLMService`。
- [x] Step 8：完成文档、history 和最终验证。

## 实际验证

- `pnpm install`：当前 worktree 初始缺少 `node_modules`，先离线安装失败，随后经用户授权安装依赖成功。
- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core build`
- `pnpm --dir packages/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/lab-page.test.tsx src/renderer/test/settings-page.test.tsx src/renderer/test/sidebar.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test`：40 files / 275 tests passed.
- `pnpm --filter @actspace/agent-core test`：79 files / 576 tests passed.
- `pnpm --filter @actspace/shared test`：4 files / 30 tests passed.
- `pnpm typecheck`
- `pnpm --filter @actspace/desktop build`：通过；Vite 仍提示主 chunk 超过 500 kB，这是既有打包体积提示。
- Browser renderer check on `http://127.0.0.1:5174/`:
  - Chat/sidebar did not show `Learning documentation plan`, `mock-screenshot.png`, `/mock/README.md`, or `Weekly context audit`.
  - Scheduled section showed `No scheduled tasks`.
  - Lab showed all four stages with count `0` and `暂无...` empty text; old Lab fixture strings `让 Agent 锻造 Rust CLI`, `Frontend Verification`, and `act-log-scan` were absent.
- `rg -n "renderer/fixtures|\\.\\./fixtures|\\.\\./\\.\\./fixtures|mockBootstrapState|mockMessages|mockSessionRecord|mockSessions|mockTurnResult|mockContextSnapshot|mockArchivedSessions|MOCK_ATTACHMENTS|MOCK_SCHEDULED|MOCK_SETTINGS|MOCK_PROMPT_FILE|initialLabCards|showDemoAttachments|session-learning-doc-plan|Learning documentation plan|/mock/" packages/desktop/src/renderer --glob '!**/test/**' -S`：无运行时命中。

## 决策记录

- 2026-06-04：用户确认任务复杂，先写 execution plan；`MockLLMService` 可以作为测试设施保留。影响：本计划只清理产品运行路径和用户可见假数据，不移除 agent-core 的测试 mock provider。
- 2026-06-04：运行时假数据的清理标准定义为“用户可见、会被误解为真实状态、或普通产品路径自动注入的数据”。影响：测试 fixtures、组件测试样例、LLM mock service 不按这个标准删除。
- 2026-06-04：renderer 测试 fixture 下沉到 `packages/desktop/src/renderer/test/fixtures/**`；运行时 `packages/desktop/src/renderer/fixtures/**` 删除。影响：浏览器直开 renderer 不再展示假会话、假上下文、假附件或假 Lab 实验。
- 2026-06-04：本次变更复用既有 learning `docs/learnings/2026-05/runtime-empty-state-vs-test-fixture.md`，不新增学习文档。影响：history 中关联该学习文档即可。
