# 2026-06-02 会话归档功能计划

## 目标

为 actspace 桌面端补齐会话归档能力：用户可以从左侧会话栏归档非当前会话，归档后的会话从普通会话列表隐藏，并进入设置页的「归档会话」分区；用户可在该分区查看归档会话并恢复。当前正在打开的会话不允许归档，其归档按钮必须禁用，避免主工作区被当前操作清空或自动跳转。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/front-左侧会话栏规范.md`
- `docs/design-docs/front-设置页规范.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/design-docs/core-storage-and-observability.md`

## 范围

包含：

- 在 session meta 与 IPC 摘要中新增 `archived?: boolean`。
- 新增归档写入能力：`session:archive` / `archiveSession({ sessionId, archived })`。
- 扩展会话列表能力：普通列表默认只返回未归档会话；设置页可请求归档会话列表。
- 左侧会话栏 Archive 按钮从占位接入真实归档；当前 active session 的归档按钮禁用。
- 设置页新增「归档会话」分区，展示归档会话并支持恢复。
- 补充单测、前端验证、文档同步和 history。

不包含：

- 不物理移动 session 目录，不重写 `session.jsonl`，只更新 `meta.json`。
- 不允许归档当前会话，因此不实现归档当前会话后的自动切换或自动新建。
- 不做批量归档、永久删除、搜索、排序筛选、导出归档。
- 不改变 Kairos memory、usage 统计和全局历史聚合逻辑；本功能只影响主会话列表展示和设置页归档入口。
- 不把归档状态写入 session event；归档是 UI 管理态，不是会话事实事件流。

## 背景与现状

- 左侧会话行已有 Archive 图标按钮，但当前 `title` 是 `Archive (coming soon)`，只触发占位回调。
- `docs/design-docs/front-左侧会话栏规范.md` 目前记录「完整 Archive 功能留作 follow-up」，本计划完成时需要同步更新。
- session 元数据由 `<userData>/sessions/<sessionId>/meta.json` 承载；当前已有 `pinned?: boolean`，归档状态应沿用同一模式。
- `listSessionRecords(sessionRoot)` 当前列出全部 session 摘要，并由 renderer 直接用于侧边栏。
- 设置页已存在整页接管结构：`SettingsPage` + `SettingsNav`，首版分区包括通用、模型、智能体、工具、外观。

## 相关代码路径

- 共享类型：
  - `packages/shared/src/session.ts`
  - `packages/shared/src/ipc.ts`
- session 持久化：
  - `packages/agent-core/src/persistence/meta.ts`
  - `packages/agent-core/src/persistence/session-store.ts`
  - `packages/agent-core/src/persistence/test/session-store.test.ts`
- main / preload / bridge 类型：
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/global.d.ts`
- renderer 主状态与侧边栏：
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/test/sidebar.test.tsx`
  - `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- 设置页：
  - `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
  - `packages/desktop/src/renderer/test/settings-page.test.tsx`
- 文档：
  - `docs/design-docs/front-左侧会话栏规范.md`
  - `docs/design-docs/front-设置页规范.md`
  - `docs/histories/`

## 数据与 IPC 契约

以 `packages/shared/src/session.ts` 和 `packages/shared/src/ipc.ts` 为准：

```ts
export type SessionMeta = {
  id: SessionId;
  title: string;
  updatedAt: string;
  createdAt: string;
  turnCount: number;
  workspaceRoot?: string;
  pinned?: boolean;
  archived?: boolean;
};

export type SessionListInput = {
  /** 缺省为 false：普通会话列表只返回未归档会话。 */
  archived?: boolean;
};

export type SessionArchiveInput = {
  sessionId: string;
  archived: boolean;
};

export type SessionArchiveResult = {
  ok: boolean;
  error?: string;
};
```

IPC 通道：

| 通道 | 入参 | 返回 | 用途 |
| --- | --- | --- | --- |
| `session:list` | `SessionListInput | undefined` | `SessionListItem[]` | 侧边栏取未归档列表；设置页取归档列表 |
| `session:archive` | `SessionArchiveInput` | `SessionArchiveResult` | 归档或恢复会话 |

实现约束：

- `listSessionRecords(sessionRoot, input?)` 默认 `archived === false`，只返回未归档会话。
- 传 `{ archived: true }` 时只返回归档会话。
- `SessionListItem` 只有 `meta.archived` 为 true 时才带 `archived: true`，保持和 `pinned` 一致的稀疏字段风格。
- `setSessionArchived` 只更新 `meta.json`，不修改 `updatedAt` 以外的会话内容。是否更新 `updatedAt` 以 `updateMeta` 当前行为为准；如 `updateMeta` 会更新时间，应在测试中锁定该行为。

## UX 约束

- 当前 active session 的归档按钮必须禁用：
  - `disabled={true}`
  - `aria-label="Current session cannot be archived"`
  - `title="Current session cannot be archived"`
  - 视觉上降低对比，但保留按钮占位，避免行布局跳动。
- 非当前会话的归档按钮：
  - `aria-label="Archive session"`
  - `title="Archive session"`
  - 点击后调用 `onArchive(session.id)`，成功后刷新未归档列表。
- 归档成功后：
  - 不切换当前会话。
  - 不自动创建新会话。
  - 该会话从侧边栏消失。
- 设置页「归档会话」：
  - 进入分区时加载 `listSessions({ archived: true })`。
  - 显示标题、更新时间、turn 数、workspaceRoot 摘要。
  - 每条提供「恢复」按钮，点击 `archiveSession({ sessionId, archived: false })` 后刷新归档列表。
  - 恢复不会自动切到该会话；它只回到普通侧边栏列表。
  - 空状态显示暂无归档会话。

## 里程碑与任务

### Task 1：shared 契约与 session store

修改文件：

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/index.ts`
- `packages/agent-core/src/persistence/test/session-store.test.ts`

任务：

- 给 `SessionMeta` / `SessionListItem` 增加 `archived?: boolean`。
- 新增 `SessionListInput` / `SessionArchiveInput` / `SessionArchiveResult`。
- 新增 `setSessionArchived(sessionRoot, sessionId, archived)`。
- 扩展 `listSessionRecords(sessionRoot, input?)`，默认过滤归档会话，传 `{ archived: true }` 时只列归档会话。
- 补测试：
  - 默认列表不返回归档 session。
  - `{ archived: true }` 只返回归档 session。
  - 归档再恢复后列表归属正确。
  - `pinned` 与 `archived` 可共存，归档后不会出现在普通 pinned 分区。

验收：

- `pnpm --filter @actspace/agent-core test -- session-store`
- `pnpm --filter @actspace/shared typecheck`

### Task 2：main IPC、preload 与全局类型

修改文件：

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`

任务：

- `session:list` handler 接收可选 `SessionListInput` 并传给 `listSessionRecords`。
- 新增 `session:archive` handler，调用 `setSessionArchived`。
- preload 暴露：
  - `listSessions(input?: SessionListInput)`
  - `archiveSession(input: SessionArchiveInput)`
- `global.d.ts` 同步 `window.actspace` 类型。

验收：

- `pnpm --filter @actspace/desktop typecheck`

### Task 3：侧边栏归档交互

修改文件：

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`

任务：

- `SessionRow` 增加当前会话归档禁用逻辑，可通过 `isActive` 推导。
- 删除 `Archive (coming soon)` 文案，改成真实可用或禁用提示。
- `App.tsx` 实现 `handleArchiveSession(sessionId)`：
  - 若 `sessionId === activeSessionId`，直接返回，不调用 IPC。
  - mock 模式更新本地 fixture 状态。
  - Electron 模式调用 `window.actspace.archiveSession({ sessionId, archived: true })`，成功后刷新 `listSessions()`。
- 确保侧边栏只收到未归档会话列表。
- 补测试：
  - 当前会话归档按钮 disabled。
  - 点击当前会话归档按钮不会触发 `onArchive`。
  - 点击非当前会话归档按钮触发 `onArchive(sessionId)`。

验收：

- `pnpm --filter @actspace/desktop test -- sidebar`

### Task 4：设置页归档会话分区

修改文件：

- `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`

任务：

- `SettingsSectionId` 增加 `"archivedChats"`。
- 导航增加「归档会话」项，图标使用 `Archive` 或 `ArchiveRestore`。
- 新增 `ArchivedChatsSettings` 或在 `SettingsPage.tsx` 内新增独立 section 组件：
  - mount 或切换到该分区时调用 `listSessions({ archived: true })`。
  - loading、error、empty、loaded 四类状态可见。
  - 每条归档会话展示标题、更新时间、turn 数、workspaceRoot。
  - 点击恢复调用 `archiveSession({ sessionId, archived: false })`，成功后刷新归档列表。
- 浏览器 mock 无 bridge 时使用 fixture 中的归档会话，确保设置页本地预览不白屏。
- 补测试：
  - 导航中出现归档会话分区。
  - 进入分区会请求归档列表。
  - 空状态可见。
  - 点击恢复调用 `archiveSession({ archived: false })` 并刷新列表。

验收：

- `pnpm --filter @actspace/desktop test -- settings-page`

### Task 5：文档、history 与收尾验证

修改文件：

- `docs/design-docs/front-左侧会话栏规范.md`
- `docs/design-docs/front-设置页规范.md`
- `docs/histories/YYYY-MM/<timestamp>-archived-chats.md`

任务：

- 更新左侧会话栏规范：Archive 不再是 follow-up；补当前会话不可归档规则。
- 更新设置页规范：增加「归档会话」分区和恢复行为。
- 按 `docs/HISTORY_GUIDE.md` 新增 history，记录数据契约、IPC、UI 行为和验证结果。
- 按阶段完成后的学习沉淀规则评估是否需要 `docs/learnings/`；如本轮只复用既有 meta/IPC/list 模式，可在 history 中说明不单独新增 learning。

验收：

- 文档中不再出现与本功能冲突的 `Archive (coming soon)` 或「完整 Archive 功能留作 follow-up」描述。

## 验证方式

自动化命令：

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core test -- session-store`
- `pnpm --filter @actspace/desktop test -- sidebar`
- `pnpm --filter @actspace/desktop test -- settings-page`
- `pnpm typecheck`
- `pnpm build`

前端验证：

- 浏览器 mock：
  - 侧边栏当前会话归档按钮禁用且布局不跳。
  - 非当前会话归档后从侧边栏消失。
  - 设置页能进入「归档会话」，看到归档会话并恢复。
  - 浅色 / 深色主题都检查按钮、列表、空状态、hover 态；不得引入非主题感知颜色字面量。
- Electron 真实验证：
  - 启动 `pnpm dev:log` 或 `pnpm dev`。
  - 归档一条非当前真实会话，确认其 `meta.json` 写入 `archived: true`，侧边栏消失。
  - 设置页归档列表可见该会话。
  - 恢复后 `meta.json` 中 `archived` 变为 false 或字段移除，侧边栏重新出现。
  - 当前会话归档按钮不可点击，点击不会写 IPC。

## 风险与缓解

- 风险：默认 session 列表过滤归档后，启动时若所有历史会话都已归档，应用可能创建新会话。
  - 缓解：这是预期行为；当前会话不可归档会降低真实使用中进入该状态的概率。测试需确认 bootstrap 在空列表时仍创建新会话。
- 风险：归档列表和普通列表使用同一个 `session:list` 通道，调用方忘记传参导致展示错误。
  - 缓解：`SessionListInput` 文档写清默认值；设置页组件内封装 `loadArchivedSessions()`，避免散落调用。
- 风险：归档 pinned 会话后 pinned 分区仍显示。
  - 缓解：过滤发生在 `listSessionRecords`，renderer 分区前只拿未归档数据；store 测试覆盖 pinned + archived。
- 风险：恢复归档会话后普通侧边栏不刷新。
  - 缓解：设置页恢复成功后只保证归档页刷新；全局侧边栏在返回聊天或下一次 list 时刷新。本轮如需要即时刷新，可通过 `onArchivedSessionsChange` 从 `SettingsPage` 通知 `App` 刷新普通列表。
- 风险：新增设置页列表样式不符合主题规范。
  - 缓解：只使用 `bg-surface` / `bg-surface-subtle` / `text-text-*` / `border-line` / `hover:bg-[var(--act-color-hover-overlay)]` 等既有语义 token。

## 失败回退

- 若 Task 1 契约或 store 测试不稳定，不继续做 renderer；先稳定 meta 过滤行为。
- 若设置页归档列表影响范围过大，可先交付归档写入 + 侧边栏隐藏，再保留设置页分区为空态，但不能合并与用户目标冲突的半成品。
- 若 Electron 真实验证发现 IPC 写入失败，回退 `session:archive` handler 与 preload 暴露，不改动已有 `session:list` 行为。

## 进度记录

- [x] 2026-06-02：完成需求澄清：当前会话不允许归档，当前会话归档按钮禁用。
- [x] 2026-06-02：完成 active execution plan。
- [ ] Task 1：shared 契约与 session store。
- [ ] Task 2：main IPC、preload 与全局类型。
- [ ] Task 3：侧边栏归档交互。
- [ ] Task 4：设置页归档会话分区。
- [ ] Task 5：文档、history 与收尾验证。

## 决策记录

- 2026-06-02：归档状态采用 `meta.json` 的 `archived?: boolean`，不移动目录、不写 session event。原因是归档属于用户管理态，和现有 `pinned` 一样适合放 session meta；保持 `session.jsonl` 作为会话事实事件流。
- 2026-06-02：当前 active session 不允许归档，按钮直接禁用。原因是避免归档后主工作区被清空、自动切换造成上下文跳变，也符合用户明确反馈。
- 2026-06-02：`session:list` 默认返回未归档会话，设置页通过 `{ archived: true }` 获取归档列表。原因是最大程度保持现有侧边栏调用语义，归档列表作为显式查询路径。
