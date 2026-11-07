# 上下文引擎不再每次请求复制对话

## 目标

按设计规范 [agent-spec-context-trusted-surface.md](../../design-docs/agent-plugin-runtime/agent-spec-context-trusted-surface.md) 实施，有三个效果：

- 日志交出的对话视图登记为「已信任」，上下文引擎直接引用，不再序列化复制；
- 判断上下文有没有变，以及会话源的缓存 key，对话部分改用版本号；
- `toLlmInput` 只做浅冻结和密钥检查。

发给模型的内容、请求记录、面板投影、`contextRevision` 序列都和改前一致。

## 范围

**包含：** 规范 §3 的全部条目。

**不包含：**
- 深只读类型改造；
- 增量组装；
- 日志格式和请求记录。

## 背景

- **证据：** `tmp/heap/run7/main-*.heapprofile`。分析脚本：
  - `tmp/heap/top-fns.mjs` 按函数汇总；
  - `tmp/heap/callers.mjs` 按调用链汇总。
- **代码：**
  - `packages/session/session-journal/src/surface.ts`
  - `packages/context/context-engine/src/`：`context-snapshot.ts`、`instances.ts`、`engine.ts`、`projection.ts`、`request-snapshot.ts`
  - `packages/context/context-conversation/src/source.ts`
- **适配层已核对，只读不写：**
  - `llm-pi-ai/src/anthropic-cache.ts` 先浅拷贝再改；
  - `reasoning-options.ts` 改的是 payload 的副本。

## 任务（按顺序，前后有依赖，由主智能体自己写）

### T1 日志：已信任视图与版本号

改 `session-journal/src/surface.ts`：

- `get view()` 按 `#entries` 和 `#replaceGeneration` 缓存视图对象。`apply` 或替换后让缓存失效，使同一份对话两次读到同一个对象。
- 模块级 `WeakSet` 登记视图，导出以下三项：
  - `isTrustedSurfaceView(value)`；
  - `surfaceViewVersion(view)`：已信任视图返回 `${replaceGeneration}:${entries.length}:${lastSeq}`，否则返回 `JSON.stringify(view)`；
  - 类型 `TrustedSurfaceView`。
- `fromView`、`clone` 生成的 `SessionSurface` 同样登记。

测试 `session-journal/src/test/surface-trust.test.ts`：

- 同一状态读两次，得到同一对象；
- 追加、替换后得到新对象，版本号随之变化；
- 形状相同的普通对象不被信任；
- 视图和 entries 已冻结。

### T2 引擎：跳过已信任对话的复制

- `context-snapshot.ts` 的 `contextValue`：已信任视图原样返回。
- `projection.ts`：`content.conversation` 不进 `freezeRequest`，直接引用；其余字段照旧。

测试 `context-engine/src/test/trusted-surface.test.ts`：

- 经过 `getContext`、`reconcile`、`toLlmInput` 后，`entries[i].node` 与日志是同一对象；
- `contextFromCandidate` 自己拼的对话照旧被复制和冻结，带密钥字段时被拒绝。

### T3 版本号

- `instances.ts` 的 `stateDigest`：对话片段替换成 `surfaceViewVersion(conversation)`，其余照旧 `JSON.stringify`。
- `context-conversation/src/source.ts` 的 `cacheKey`：改用 `surfaceViewVersion`。它需要依赖 `@actspace/session-journal`，若包边界检查不允许，就由 context-engine 转导出。

测试：

- 追加、压缩替换都会让 `contextRevision` 加 1；
- 只换 requestId 不加；
- 现有 `instances.test.ts`、`reducers.test.ts` 不变。

### T4 `toLlmInput`

- 去掉末尾整体的 `freezeRequest`。
- 消息数组和每条消息做 `Object.freeze`。
- 对不是来自已信任对话的部分做一次密钥字段检查，不复制。这部分包括补充内容生成的消息、system 消息、tools、options。复用 `request-snapshot.ts` 的 `validateRequestValue` 并导出。

测试：

- 输出与改前深度相等，用 T5 的等价测试覆盖；
- 补充内容里带密钥字段时被拒绝。

### T5 等价性测试

在 `apps/desktop/src/main/test/` 新增 `context-trusted-equivalence.test.ts`：

- 复用 `fixtures/surface-derived/` 转成的新格式，加入补充内容和工具；
- 先在改前代码（HEAD cd0ff335 的 worktree）上生成 golden `fixtures/context-trusted/expected.json`。golden 包括：
  - 一串 `getContext` / `reconcile` 的 `contextRevision` 序列；
  - `toLlmInput` 的结果；
  - `projectContext`；
  - `requestRecords`。
- 改后深度相等。

### T6 文档与验证

- 规范状态改为「已实现」；
- `上下文管理引擎设计/README.md` 加链接；
- `agent-plugin-runtime/README.md` 和 `design-docs/index.md` 加索引；
- 新增历史记录；
- 合约矩阵需要时重新生成；
- 运行 `pnpm typecheck`、各包测试、`test:contract-matrix`、`check:docs`。

## 风险

| 风险 | 应对 |
|---|---|
| 视图缓存没有及时失效，读到旧对话 | T1 测试覆盖 append、appendMany、replace、fromView、clone；版本号由内容推出，等价测试兜底 |
| 有路径把普通对象当成对话传进来 | 运行时以 WeakSet 为准，不认的照旧复制，T2 测试覆盖 |
| 适配层将来原地改深层对象，不再被运行时拦住 | 规范 §3.5 已写明；T4 加测试：消息数组和外壳仍冻结 |

## 验收

- 规范 §6 全部条目；
- 实机由用户用 monitor 重跑。

## 执行记录（2026-11-07）

- T1–T6 已实现，自动化检查通过（未提交）。下一步由用户用 monitor 实机重跑，对比分配（规范 §6 最后一条）。
- **信任范围比计划收紧：** 计划写的是 `fromView` / `clone` 生成的视图也登记。实现时发现 runtime 的 surface 投影用 `SessionSurface.fromView(state)`，`fromView` 能接受调用方拼的任意对象，所以只登记 `SessionJournal.surface` 交出的视图（`session-journal/src/surface-trust.ts`）。登记函数 `trustSurfaceView` 不从包入口导出。`SessionSurface.view` 仍按状态缓存，`fromView` 建的视图同样复用但不算已信任。
- **节点外壳冻结：** `surfaceNode` 推出的节点对象（除 `surface/replaced` 直接用 `data.node` 外都是新建的）在缓存前 `Object.freeze`，日志交出的对话从视图到节点字段整体只读。
- **`contextValue` 的一层包装：** 源交来的 `{ conversation: 视图 }` 和组装中间的 content 都是一层普通对象包着视图。只放过视图本身不够，所以加了 `withTrustedChildren`：已信任的子项原样引用，其余子项照旧走 `freezeRequest`，键顺序不变。`remember` 遇到已信任视图不往下走。
- **`toLlmInput`：** 对话是已信任视图或引擎检查过的对象时，消息只冻结外壳、content 数组和块；否则（调用方直接交普通 Context）照旧整份 `freezeRequest`。`validateRequestValue` 最终没有导出，不需要。
- **会话源：** `context-conversation` 不依赖日志包，`surfaceViewVersion` / `isTrustedSurfaceView` / `TrustedSurfaceView` 由 `@actspace/context-engine` 转导出。`compaction.ts` 里两处 `JSON.stringify(surface.entries)` 比较只在压缩时跑，没有改。
- **等价性测试：** `apps/desktop/src/main/test/context-trusted-equivalence.test.ts`。
  - 会话是 run7 父会话 fixture，先回放到压缩前，再分步追加压缩事务和压缩后的一轮。
  - 上下文源用真实的会话源，加系统提示词、工具、持久补充、一个 status reducer；中间插一条 turn 补充；另有一个兼容路径引擎（对话是普通对象）。
  - 6 步的 revision 序列是 2、2、3、4、5、5。golden 在改引擎前生成，存每步 revision、`toLlmInput`、两种投影、请求记录的 sha256（JSON 串，含键顺序），外加最后一步的完整输入和投影。
  - fixture 读取与旧格式转换抽到 `surface-fixture.ts`，与 `surface-derived-equivalence.test.ts` 共用。desktop 为此加了 `@actspace/context-conversation` 开发依赖。
- **变异检查：**
  - 去掉 `contextValue` 的已信任分支：引擎单测失败。
  - 在 `toLlmInput` 的 options 里多塞一个字段：golden 失败。
  - 把 `stateDigest` 的版本号换成只看 `replaceGeneration`：golden 没有失败，因为那几步里补充内容也同时在变。为此补了单测「固定 throughJournalSeq、只追加对话」，它能抓到这一改坏法。
- **检查：**
  - `pnpm typecheck` 通过；
  - 依赖 session-journal 的全部包测试通过；
  - desktop 全量 2752 个测试通过；
  - `test:contract-matrix` 通过（摘要已重新生成）；
  - package-boundaries、current-docs 等 root 检查通过。
