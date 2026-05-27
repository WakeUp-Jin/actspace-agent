# Kairos Observe（巡检 + sessions 摘要）与 Briefs 子系统

## 目标

为 Kairos 建立"看得见的世界"和"用户主动给的任务"两套输入：

1. **Observe 子系统**：
   - `watch-scanner`：Node `fs.readdir` 手写递归扫描每个 `watch=true` path，遇默认 exclude 不进入，5000 文件上限。
   - `watch-diff`：基于 entries 集合差集计算 `added` / `removed`，管理 `observe/watch-manifest/<pathHash>.json` 与 `observe/watch-diff.json`。
   - `sessions-digest`：扫 `paths.json` 中指向 session 目录的 path，重算各 session 的 `unreadTurnsForKairos` 与精简摘要。
2. **Briefs 子系统**：
   - `parser`：解析 `briefs/tasks/<id>.md` 的 frontmatter + 正文。
   - `index-manager`：维护 `briefs/index.json` 的状态机（status / lastRun / nextRun），cron 表达式调度。
   - `dispatcher`：tick 前决定本次投递"普通 `<tick>`"还是"某 brief 正文"。

完成后 controller 在 tick 前可以调用 `observe.refresh()` 拿到一份"巡检 + sessions"快照，并由 `dispatcher.next()` 拿到本 tick 应该投递的内容。

## 范围

- 包含：
  - `packages/agent-core/src/kairos/context/watch-scanner.ts`
  - `packages/agent-core/src/kairos/context/watch-diff.ts`
  - `packages/agent-core/src/kairos/context/sessions-digest.ts`
  - `packages/agent-core/src/kairos/briefs/parser.ts`
  - `packages/agent-core/src/kairos/briefs/index-manager.ts`
  - `packages/agent-core/src/kairos/briefs/dispatcher.ts`
  - 上述模块单测
  - fixture 目录（一份示例 session 目录树 + 几份示例 brief markdown）
- 不包含：
  - 把这些模块接到 controller / runner（在 `kairos_controller_runner` plan）
  - 给 LLM 看的 [5] 段拼接（在 `kairos_controller_runner` 的 prompt-assembler 扩展）——本 plan 仅产出原始数据结构
  - briefs 的 UI 表单（在 `kairos_main_ipc_and_renderer` plan）

## 依赖关系

- 依赖：`kairos_shared_contracts`（SessionEvent type；briefs 调度时会产出 `kairos_tick_injected{trigger:"brief"}` 事件）
- 并行：可与 `kairos_config_and_tool_guard` / `kairos_short_term_memory` 同时启动
- 产出给：`kairos_controller_runner`（controller 启动后 hold 一个 observe / briefs 实例）；`kairos_main_ipc_and_renderer`（前端 Briefs Tab 读 `index.json`、笔记/巡检显示走 observe 输出）

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md` 的「Config 详设 / paths.json」「Briefs（用户主动任务）」「主 Agent Sessions 的访问」三章
- `back-code/heartclaw/apps/ruyi-api/src/core/agent/kairos_agent.py`（brief 触发的概念出处，仅参考）
- 任意现有 session 目录结构（`<userData>/sessions/<workspaceId>/<sessionId>/session.jsonl`），理解需要解析哪些字段

## 背景

- 相关代码路径：
  - `packages/agent-core/src/sessions/`（如已有 SessionStore），可复用其 meta 读取能力，避免重复造轮子
  - `packages/shared/src/session.ts`
- 已知约束：
  - watch 扫描 `recursive: true` 的 Node API **不能用**，必须手写递归（避免 `node_modules` 等被先扫完再过滤的性能黑洞）。
  - watch-manifest 文件名 = watch root SHA1 前 12 位 + `.json`；同一 path 重命名后 hash 变化、视为新的 watch。
  - briefs 任务 id 必须与文件名一致（`<id>.md`）；不一致时 parser 报错。
  - cron 表达式用 5 段语法（`分 时 日 月 周`），引入 `cron-parser` 或与已有依赖一致的库。

## 设计方案

### 1. Watch scanner（`context/watch-scanner.ts`）

```ts
export type WatchScanResult = {
  rootPath: string;
  entries: string[];                               // 相对 rootPath 的文件路径，已排序
  truncated: boolean;                              // 触发 5000 上限时为 true
};

export const DEFAULT_WATCH_EXCLUDE: ReadonlySet<string>;

export const MAX_FILES_PER_WATCH_PATH = 5000;

export async function scanWatchPath(rootPath: string): Promise<WatchScanResult>;
```

实现：

```ts
async function walk(dir, root, result): Promise<void> {
  if (result.length >= MAX_FILES_PER_WATCH_PATH) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }                                // 权限错/不存在 → 跳过
  for (const e of entries) {
    if (result.length >= MAX_FILES_PER_WATCH_PATH) return;
    if (DEFAULT_WATCH_EXCLUDE.has(e.name)) continue;
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, result);
    else result.push(path.relative(root, full));
  }
}
```

`DEFAULT_WATCH_EXCLUDE` = `{ ".git", "node_modules", ".DS_Store", ".cache", "dist", "build", ".next", "__pycache__", ".venv", "venv", "target" }`。

### 2. Watch diff + manifest（`context/watch-diff.ts`）

```ts
export type WatchDiffEntry = {
  rootPath: string;
  added: string[];                                 // 完整路径
  removed: string[];                               // 完整路径
  truncated: boolean;                              // diff 数大于 50 时 true
  totalAdded: number;                              // 截断前的真实数量
  totalRemoved: number;
};

export type WatchManifest = {
  path: string;
  entries: string[];                               // 相对 path 的文件名，升序
  lastScanAt: string;
};

export class WatchDiffEngine {
  constructor(manifestDir: string);                // <kairosRoot>/observe/watch-manifest

  async diff(rootPath: string): Promise<WatchDiffEntry>;
  // 内部：scanWatchPath() → loadManifest() → 集合差集 → saveManifest()
}
```

实现要点：

- manifest 文件名 = `hash(rootPath).json`，hash = `createHash("sha1").update(rootPath).digest("hex").slice(0,12)`。
- manifest 不存在 → `oldEntries=[]`，本次 `added = newEntries`，`removed = []`。
- 截断：`added.length + removed.length > 50` 时，按 `added` 优先级保留前 N、`removed` 剩余的填，记 `truncated=true`。
- `saveManifest` 用 atomic write（同 `writeTextAtomic` 工具）。

### 3. Sessions digest（`context/sessions-digest.ts`）

```ts
export type SessionDigestItem = {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
  unreadTurnsForKairos: number;
  lastUserPreview: string;                         // 最近一条 user 消息前 80 字符
};

export type SessionsDigestResult = {
  workspaces: Array<{
    rootPath: string;                              // 来自 paths.json 中"看起来像 session 目录"的 path
    sessions: SessionDigestItem[];
  }>;
  generatedAt: string;
};

export class SessionsDigestBuilder {
  constructor(opts: {
    paths: PathsConfig;                            // 来自 config loader
    kairosStateFile: string;                       // 记录 Kairos 上次访问到的 turnId 用
  });

  async refresh(): Promise<SessionsDigestResult>;  // 重算并落盘到 observe/sessions-digest.json
}
```

实现：

- 从 `paths.json` 找出"路径名包含 `/sessions/`"或用户 tip 含"session"等启发式（v1 简单方案：**只有 path 末段名等于 `sessions` 或 包含 `actspace-agent` 这类典型 workspace root**——具体启发式由执行时再收敛，**不暴露给用户配置**）。可降级方案：**所有 watch=false 的 path 都尝试当作可能的 session root**，扫描时若目录结构不符（缺 `session.jsonl`）则忽略。本 plan 实现采用后者（更不挑食）。
- 每个候选 root 下用 `fs.readdir` 拿子目录，每个子目录尝试读 `session.jsonl` 的最后几行拿 `updatedAt` / `turnCount` / `lastUserPreview`。
- `unreadTurnsForKairos`：把每个 sessionId → 上次 Kairos 读到的 turnId 存进 `<kairosRoot>/memory/state.json` 的 `lastSeenTurnId` 字段；diff 当前最新 turnId 与该值得未读数。**首次访问视为全部未读**。
- 输出落盘到 `<kairosRoot>/observe/sessions-digest.json`。

### 4. Briefs parser（`briefs/parser.ts`）

```ts
export type BriefFrontmatter = {
  id: string;
  status: "active" | "paused" | "done" | "failed";
  trigger: "cron" | "event" | "manual";
  cron?: string;
  priority: "high" | "normal" | "low";
  created: string;
  lastRun: string | null;
  nextRun: string | null;
};

export type BriefDoc = {
  frontmatter: BriefFrontmatter;
  body: string;                                    // 正文 markdown（不含 frontmatter）
  filePath: string;
  fileMtime: number;
};

export async function parseBriefFile(filePath: string): Promise<BriefDoc>;
export function fullBriefMarkdown(doc: BriefDoc): string;   // frontmatter+body 拼回，用于投递给 LLM
```

实现：

- 用 `gray-matter` 或现有 markdown frontmatter 库。
- frontmatter 字段校验（zod schema）。
- `id` 必须与文件名匹配，否则 throw。

### 5. Briefs index manager（`briefs/index-manager.ts`）

```ts
export class BriefsIndexManager {
  constructor(briefsDir: string);                  // <kairosRoot>/briefs

  async rebuildFromDisk(): Promise<void>;          // 扫 tasks/*.md，按 fileMtime 差量更新 index.json
  async list(): Promise<BriefIndexEntry[]>;
  async updateStatus(id, patch: Partial<BriefFrontmatter>): Promise<void>;
  async markRun(id, result: "ok"|"failed", nextRun: string | null): Promise<void>;

  // 监听 briefs/tasks/ 目录（chokidar），变更触发 rebuild
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
}
```

cron 推进：

- 用 `cron-parser` 计算下次 `nextRun`。
- `nextRun = null` 表示不再调度（done / manual）。

### 6. Briefs dispatcher（`briefs/dispatcher.ts`）

```ts
export type TickPayload =
  | { trigger: "auto"; content: string }           // 默认 `<tick>YYYY-MM-DD HH:mm:ss</tick>`
  | { trigger: "brief"; briefId: string; content: string };

export class BriefsDispatcher {
  constructor(index: BriefsIndexManager);

  async pickNext(now: Date): Promise<TickPayload>;
}
```

`pickNext` 算法：

1. 调 `index.list()`，筛 `status="active"` 且 `nextRun != null` 且 `nextRun <= now`
2. 按 `priority: high>normal>low`，再按 `nextRun` 升序取第一条
3. 命中 → 读对应 brief 文件 + 用 `fullBriefMarkdown` 拼出正文 → 返回 `{trigger:"brief", briefId, content}`
4. 未命中 → 返回 `{trigger:"auto", content: <tick>...</tick>}`

> 状态推进（lastRun/nextRun）**不在 pickNext 里做**——由 controller 在本次 tick turn 闭合后调用 `index.markRun()`。这是为了避免 dispatcher 把"我打算投这个 brief"和"brief 真的执行完了"混在一起。

### 7. 测试

`context/__tests__/watch-scanner.test.ts`：

- 命中 `.git` / `node_modules` 不递归进入；隐藏文件跳过
- 5000 文件即停 + `truncated=true`
- 权限错误目录返回空，不抛
- 嵌套子目录的相对路径拼接正确（含 Windows 风格分隔符的兼容）

`context/__tests__/watch-diff.test.ts`：

- 首次扫描：manifest 不存在 → 全部 entries 进 added
- 后续扫描：mock new=[a,b,c] / old=[b,c,d] → added=[a], removed=[d]
- 重命名场景（mv x.csv y.csv）→ removed=[x.csv], added=[y.csv]
- 截断：100 个 added → 取 50 + truncated=true

`context/__tests__/sessions-digest.test.ts`：

- mock session 目录（3 个 session.jsonl）→ digest 包含 3 项
- 模拟用户在某 session 新增 2 turn → unreadTurnsForKairos=2
- `lastUserPreview` 取最新一条 user_message 的 text 前 80 字符

`briefs/__tests__/parser.test.ts`：

- 正常 markdown 解析 frontmatter+body
- frontmatter 缺字段 → throw
- id 与文件名不一致 → throw

`briefs/__tests__/index-manager.test.ts`：

- rebuild：磁盘 3 个 brief → index.json 3 项
- 改一个 brief 的 fileMtime → rebuild 后只重读该文件
- markRun：lastRun / nextRun 写回 frontmatter + index.json 同步

`briefs/__tests__/dispatcher.test.ts`：

- 无 active brief → 返回 `trigger:"auto"`
- 1 个 active 且 nextRun ≤ now → 返回 `trigger:"brief"` 内容包含正文
- 2 个 active 同 priority → 取 nextRun 早的
- 1 个 high + 1 个 normal → 取 high

## 任务拆分

- [ ] Step 1：新建 `kairos/context/watch-scanner.ts`；写 `watch-scanner.test.ts`（含临时目录 fixture + 5000 上限 mock）。
- [ ] Step 2：新建 `kairos/context/watch-diff.ts`；写 `watch-diff.test.ts` 覆盖首次/常规/重命名/截断。
- [ ] Step 3：新建 `kairos/context/sessions-digest.ts`；写 `sessions-digest.test.ts`（fixture：临时 session 目录 + state.json）。
- [ ] Step 4：新建 `kairos/briefs/parser.ts`；写 `parser.test.ts` 覆盖正常/缺字段/id 不一致。
- [ ] Step 5：新建 `kairos/briefs/index-manager.ts`；写 `index-manager.test.ts` 覆盖 rebuild / markRun；chokidar 用真依赖在临时目录测。
- [ ] Step 6：新建 `kairos/briefs/dispatcher.ts`；写 `dispatcher.test.ts` 覆盖 4 个场景。
- [ ] Step 7：补一条 history：`docs/histories/<month>/<timestamp>-kairos-observe-and-briefs.md`，列出新增文件 + 测试覆盖。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
- 手工检查：
  - 构造临时 `~/tmp/kairos-test/` 目录：
    - 加一个 watch 路径，含 5 个 .md 文件 + 1 个 node_modules 子目录
    - 第一次 `WatchDiffEngine.diff()` 返回 added=5 个文件
    - 第二次（不变）返回 added=[], removed=[]
    - 删一个 → 返回 removed=[那一个]
  - 写两个示例 brief markdown（cron 表达式各 30 秒后），跑 `dispatcher.pickNext()` 验证投递。
- 观测检查：
  - `<kairosRoot>/observe/watch-manifest/<hash>.json` 内 entries 是相对路径字符串列表
  - `<kairosRoot>/observe/watch-diff.json` 含本次扫描所有 watch 路径的 diff

## 风险

- 风险：sessions-digest 在没有标准 sessions 目录定位机制时启发式失效。
- 缓解：v1 用"试探每个 paths.json path"的最不挑食方案；若失效，由用户在 paths.json 显式加 session 根目录路径即可触发。

- 风险：cron-parser 在 quietHours 边界与 rhythm 冲突。
- 缓解：dispatcher 只算 nextRun；调度器层（在 `kairos_controller_runner` plan）再做"落在 blocklist.timeWindows 内则推迟"的二次校验。

- 风险：chokidar 在 macOS 上对 briefs/tasks 子目录监听不稳定。
- 缓解：监听 `briefs/` 顶层而非每个子文件；rebuildFromDisk 容错（个别文件 parse 失败时标 `status: failed` 而不阻断整体）。

- 风险：watch-scanner 在用户配置一个超大目录（如 `~`）时性能崩溃。
- 缓解：5000 上限兜底；同时在 prompt-assembler 拼接 [3] 段时给 LLM 提示"watched 路径触顶后会显示 truncated"，让 Kairos 自己知道有数据丢失。

## 决策记录

- 2026-05-27：watch-diff manifest 文件名用 SHA1 前 12 位而非用户配置的 id。原因：`paths.json` 没有 id 字段；用户改 path 时 hash 自动变化 = 新 watch（旧 manifest 残留可被 controller 启动时清理）。
- 2026-05-27：briefs 状态推进（markRun）由 controller 在 tick turn 闭合后调用，不由 dispatcher 自己做。原因：避免 dispatcher 既"决定投什么"又"更新状态"的双职责；turn 是否真的执行成功只有 runner 知道。
- 2026-05-27：sessions-digest 启发式选"不挑食"。原因：用户加路径时不一定意识到要标 type；与其 v1 引入新字段，不如让 digest 容错。
