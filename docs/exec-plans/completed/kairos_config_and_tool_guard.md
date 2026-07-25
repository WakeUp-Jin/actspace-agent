# Kairos Config 与 Tool Guard 基座

## 目标

为 Kairos 建立两套"决策与工具底座"：

1. **Config 子系统**：`preferences.json` / `paths.json` / `blocklist.json` 三份 JSON + `rule.md` 一份文本的 schema、loader、热重载，以及 `prompt-assembler` 中"配置提示段（[3]段）"的拼接实现。
2. **Tool Guard 子系统**：`ToolScheduler.execute` 增加 `callerAgent` 参数；为涉及路径的工具补 `extractPaths` hook；新增 Kairos 专属的"path allowedRoots + blocklist glob"硬判断；新增 `Sleep` 工具及其 handler。

完成后 controller 启动只需要"读 config → 注册 tool → emit IPC"，不需要实现额外的决策逻辑。

## 范围

- 包含：
  - `packages/agent-core/src/kairos/config/{schema,loader,watcher}.ts`（新增）
  - `packages/agent-core/src/kairos/config/prompt-assembler.ts`（新增，[3] 段拼接）
  - `packages/agent-core/src/tools/types.ts`（追加 `extractPaths?` 字段到 `ToolDefinitionSpec`，不破坏 v1 现有工具）
  - `packages/agent-core/src/tools/scheduler.ts`（或同名/同职责文件）：增加 `callerAgent` 参数与 Kairos 路径校验 hook
  - 各 file 类工具 `definition.ts` 追加 `extractPaths`（read-file / write-file / edit-file-diff / grep / glob / list-directory）
  - `packages/agent-core/src/kairos/guard/{extract-paths,blocklist-check}.ts`（新增）
  - `packages/agent-core/src/kairos/tools/sleep.ts`（新增）
  - 上述模块的单测
- 不包含：
  - `controller.ts` / `runner.ts` / `scheduler.ts` 等 Kairos 主流程文件（在 `kairos_controller_runner` plan）
  - briefs / observe / short-term / aggregator（各自独立 plan）
  - 修改主 Agent 的工具行为（callerAgent 默认 `"main"` 时全部 hook 不调用）

## 依赖关系

- 依赖：`kairos_shared_contracts`（需要 `KairosControl` / `KairosRuntimeState` 等类型；Sleep 工具会产出 `kairos_sleep_*` 事件）
- 并行：可与 `kairos_short_term_memory` / `kairos_observe_and_briefs` 同时启动
- 产出给：`kairos_controller_runner`（controller 启动序列消费 config loader 输出和 Sleep 工具注册）；`kairos_main_ipc_and_renderer`（前端配置 Tab 复用 schema）

## 必读

- `AGENTS.md`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md` 的「上下文构成」「Config 详设」「工具系统扩展」三章
- `packages/agent-core/src/tools/workspace-guard.ts`（理解 `guardWorkspacePath` 单 root 校验）
- `packages/agent-core/src/tools/types.ts`（理解 `ToolDefinitionSpec` 现有字段）
- 任一 `packages/agent-core/src/tools/tools/<x>/definition.ts`（理解工具 def 写法）

## 背景

- 相关代码路径：
  - `packages/agent-core/src/tools/workspace-guard.ts`
  - `packages/agent-core/src/tools/tools/read-file/{definition,executor}.ts`
  - `packages/agent-core/src/tools/tools/write-file/{definition,executor}.ts`
  - `packages/agent-core/src/tools/tools/edit-file-diff/{definition,executor}.ts`
  - `packages/agent-core/src/tools/tools/grep/{definition,executor}.ts`
  - `packages/agent-core/src/tools/tools/glob/{definition,executor}.ts`
  - `packages/agent-core/src/tools/tools/list-directory/{definition,executor}.ts`
  - `packages/agent-core/src/tools/manager.ts`（ToolManager 工具注册）
- 已知约束：
  - 现有 `guardWorkspacePath(path, workspaceRoot)` 是单 root 接口，**不允许改其签名**（影响主 Agent）；Kairos 侧自己循环 allowedRoots 调用。
  - `ToolScheduler.execute` 新增 `callerAgent` 必须有默认值 `"main"`，所有主 Agent 调用点保持原签名（可以通过 TS 可选参数实现）。
  - `Sleep` 工具只在 Kairos 的 ToolManager 注册；主 Agent 永远拿不到。

## 设计方案

### 1. Config schema（`config/schema.ts`）

使用 `zod` 定义 3 份 JSON 的 schema（项目已用 zod，参考主 Agent 现有用法）：

```ts
export const PreferencesSchema = z.object({
  tip: z.string().default("Kairos 默认偏好"),
  enabled: z.boolean().default(false),
  modelId: z.string().nullable().default(null),
  sleepRangeSeconds: z.object({
    min: z.number().int().positive().default(30),
    max: z.number().int().positive().default(900),
    default: z.number().int().positive().default(120),
  }).default(...),
  tickBudget: z.object({
    perDay: z.number().int().positive().default(200),
    perHour: z.number().int().positive().default(30),
  }).default(...),
  circuitBreaker: z.object({
    errorThreshold: z.number().int().positive().default(5),
    cooldownSec: z.number().int().positive().default(60),
  }).default(...),
  memory: z.object({
    loadBudgetRatio: z.number().min(0).max(1).default(0.75),
    compressionThreshold: z.number().min(0).max(1).default(0.85),
  }).default(...),
  rhythm: z.object({
    timezone: z.string().default("Asia/Shanghai"),
    workHours:  z.object({ start: z.string(), end: z.string(), sleepBias: z.enum(["light","normal","deep"]) }).default(...),
    quietHours: z.object({ start: z.string(), end: z.string(), sleepBias: z.enum(["light","normal","deep"]) }).default(...),
    weekend:    z.object({ sleepBias: z.enum(["light","normal","deep"]) }).default(...),
  }).default(...),
});

export const PathsSchema = z.object({
  tip: z.string().default("Kairos 可访问的本地路径"),
  paths: z.array(z.object({
    path: z.string().min(1),
    watch: z.boolean().default(false),
    tip: z.string().optional(),
  })).default([]),
});

export const BlocklistSchema = z.object({
  tip: z.string().default("敏感目录与工具已被屏蔽"),
  paths: z.array(z.string()).default([]),          // glob 列表
  toolsDenied: z.array(z.string()).default([]),
  timeWindows: z.array(z.object({
    from: z.string(),                              // "HH:MM"
    to: z.string(),
  })).default([]),
  maxToolCallsPerTick: z.number().int().positive().default(10),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
export type PathsConfig  = z.infer<typeof PathsSchema>;
export type Blocklist    = z.infer<typeof BlocklistSchema>;
```

### 2. Config loader（`config/loader.ts`）

```ts
export type KairosConfig = {
  preferences: Preferences;
  paths: PathsConfig;
  blocklist: Blocklist;
  ruleMd: string;                                  // 原始 markdown，截尾到 1500 token
};

export async function loadKairosConfig(rootDir: string): Promise<KairosConfig>;
```

读取 `<rootDir>/config/{preferences,paths,blocklist}.json` 和 `rule.md`：

- 文件不存在 → 落回 schema 默认值，写一条 warn 到 `logs/latest-dev.log`。
- JSON 解析失败 → throw，让 controller 启动失败（fail fast）。
- 配置文件路径中的 `<userData>` 占位符在 loader 中解析为实际 userData 路径。
- rule.md 简单按字符 ÷ 3 近似 token 数（actspace 现有近似算法）；超 1500 token 截尾 + warning。

### 3. Config watcher（`config/watcher.ts`）

```ts
export interface KairosConfigWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(event: "preferences" | "paths" | "blocklist" | "rule", listener: () => void): void;
}

export function createKairosConfigWatcher(rootDir: string): KairosConfigWatcher;
```

实现：

- 用 `chokidar` 监听 `<rootDir>/config/` 目录（包含子 rule.md）。
- mtime 变化 200ms debounce 后触发对应 listener。
- 不读文件内容；让 controller 决定是否重新调 `loadKairosConfig`。

### 4. prompt-assembler [3] 段（`config/prompt-assembler.ts`）

```ts
export function buildConfigTipsBlock(config: KairosConfig): string;
```

输出格式（人话，不含 JSON 原文）：

```
## 配置提示

[preferences] <preferences.tip>
[paths] <paths.tip>：
  - <path1>  → <tip1>
  - <path2>  (watch)  → <tip2>
  ...
[blocklist] <blocklist.tip>
```

约束：

- 总长度截到 600 token；超出按 paths 列表尾部截断 + "另有 N 条"。
- `(watch)` 标记仅在 `watch=true` 时出现。
- `tip` 为空时 fallback 到 `path` 末段名（如 `/Users/.../docs` → `docs`）。

### 5. ToolScheduler `callerAgent` 改造

在 `ToolScheduler.execute`（或等价入口）增加可选参数：

```ts
execute(toolCall, {
  sessionId,
  signal,
  callerAgent?: "main" | "kairos",                 // 默认 "main"
  kairosGuard?: KairosGuardContext,                // 仅 callerAgent="kairos" 时必填
})
```

新增 `KairosGuardContext`：

```ts
export type KairosGuardContext = {
  allowedRoots: string[];
  blocklistPaths: string[];                        // glob
  toolsDenied: string[];                           // 双保险用
};
```

执行流程在调用工具 executor 之前：

```ts
if (opts.callerAgent === "kairos") {
  const tool = manager.getToolByName(toolCall.toolName);
  const def = tool?.definition;
  const extract = def?.extractPaths;
  if (extract) {
    const paths = extract(toolCall.args);
    for (const p of paths) {
      // 1. allowedRoots 校验：任一 root 通过即放行
      const okSome = opts.kairosGuard!.allowedRoots.some(
        root => guardWorkspacePath(p, root).ok
      );
      if (!okSome) return rejectResult("path not in allowedRoots");

      // 2. blocklist 校验：命中任一 glob 即拒
      if (matchAnyGlob(p, opts.kairosGuard!.blocklistPaths)) {
        return rejectResult("path matches blocklist");
      }
    }
  }
  // 3. toolsDenied 双保险
  if (opts.kairosGuard!.toolsDenied.includes(toolCall.toolName)) {
    return rejectResult("tool denied for kairos");
  }
}
```

`rejectResult` 返回一个标准化的 `tool_result` event payload（isError=true, content=拒绝原因），让 LLM 在历史里看到自己被拦下来。

`matchAnyGlob` 使用 `micromatch` 或与现有项目一致的 glob 库（待执行时确认现有依赖；不引入新依赖如已有 `picomatch` 则用它）。

### 6. 各工具补 `extractPaths`

按下表追加（实现 = `(args) => args 中的路径字符串数组`，无路径返回 `[]`）：

| 工具 definition | extractPaths 实现 |
|---|---|
| `tools/read-file/definition.ts` | `(args) => typeof args.path === "string" ? [args.path] : []` |
| `tools/write-file/definition.ts` | 同上 |
| `tools/edit-file-diff/definition.ts` | 同上 |
| `tools/list-directory/definition.ts` | 同上 |
| `tools/grep/definition.ts` | `(args) => [typeof args.path === "string" ? args.path : "."]` |
| `tools/glob/definition.ts` | `(args) => [typeof args.cwd === "string" ? args.cwd : "."]` |
| `tools/bash/definition.ts` | 不实现（args 是 shell 字符串，路径难精确提取；靠 `toolsDenied` 整体管控） |
| `tools/web-search/definition.ts` / `tools/analyze-media/definition.ts` | 不实现 |

### 7. Sleep 工具（`kairos/tools/sleep.ts`）

```ts
export const sleepDefinition: ToolDefinitionSpec = {
  name: "sleep",
  description:
    "Pause Kairos for a given number of seconds. " +
    "The sleep can be interrupted by the user sending a message in the main chat. " +
    "Use this between meaningful work units to avoid hammering tools/LLM. " +
    "If you call sleep multiple times in one tick, only the last call counts.",
  parameters: {
    type: "object",
    properties: {
      seconds: { type: "number", description: "Number of seconds to sleep. Will be clamped to [min, max] from preferences." },
      reason:  { type: "string", description: "Why you chose this duration (optional, for observability)." },
    },
    required: ["seconds"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "agent-control",
  previewKind: "tool",                              // 复用通用 tool preview
};

export const sleepExecutor: ToolExecutorFn = async (args) => {
  // 仅校验参数与返回"计划睡眠秒数"，真正进入 sleep 由 controller 在 turn 结束后调度
  const seconds = typeof args.seconds === "number" ? args.seconds : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { success: false, error: "seconds must be a positive number" };
  }
  return { success: true, data: { plannedSeconds: seconds, reason: args.reason ?? null } };
};
```

> Sleep 工具仅"记账"——真正的 sleep 由 controller 在本次 tick 的 LLM 输出结束后，从工具调用历史里拿"最后一次合法 sleep 秒数"再夹紧，本插件不进入定时器逻辑。这块的消费在 `kairos_controller_runner` plan 实现。

注册：本 plan 提供一个 `registerKairosTools(toolManager: ToolManager)` 函数（在 `kairos/tools/index.ts`），由 controller 在初始化 Kairos 实例的 ToolManager 时调用一次。

### 8. 测试

- `config/__tests__/schema.test.ts`：缺字段、错类型、默认值合并。
- `config/__tests__/loader.test.ts`：文件不存在落默认值；JSON 损坏 throw；rule.md 超 1500 token 截尾。
- `config/__tests__/watcher.test.ts`：用 mock 文件系统模拟 mtime 变化，断言对应 listener 被调用；200ms 内多次变化只触发一次（debounce）。
- `config/__tests__/prompt-assembler.test.ts`：典型 config 拼出预期字符串；超 600 token 截断 paths 列表，添加"另有 N 条"。
- `tools/__tests__/scheduler-caller-agent.test.ts`：
  - `callerAgent=main` 时 hook 不调用，行为与现状一致（用现有 ToolScheduler test 衍生）。
  - `callerAgent=kairos`：
    - `read_file` 路径在 allowedRoots 之一 → 放行
    - `read_file` 路径不在任何 root → 拒绝并返回 tool_result(isError)
    - `write_file` 命中 blocklist.paths → 拒绝
    - 工具名在 toolsDenied → 拒绝
- `kairos/tools/__tests__/sleep.test.ts`：seconds 合法/非法/负数；handler 返回结构。
- `kairos/guard/__tests__/extract-paths.test.ts`、`blocklist-check.test.ts`：边界与典型 glob。

## 任务拆分

- [ ] Step 1：新建 `packages/agent-core/src/kairos/config/schema.ts`，按 §1 写完 3 份 zod schema 与导出类型。typecheck 通过。
- [ ] Step 2：新建 `config/loader.ts`，实现 `loadKairosConfig`；写 `loader.test.ts` 覆盖三种文件状态 + rule.md 截尾。`pnpm --filter @actspace/agent-core test` 全过。
- [ ] Step 3：新建 `config/watcher.ts`，封装 chokidar；写 `watcher.test.ts`（用 `tmp` 目录 + 真 chokidar，超时 5s）。
- [ ] Step 4：新建 `config/prompt-assembler.ts`，实现 `buildConfigTipsBlock`；写 `prompt-assembler.test.ts` 覆盖正常 + 截断。
- [ ] Step 5：在 `packages/agent-core/src/tools/types.ts` 给 `ToolDefinitionSpec` 追加可选 `extractPaths?: (args: unknown) => string[]`；typecheck 通过、现有工具未实现该字段不报错。
- [ ] Step 6：给 6 个 file 类工具 definition 追加 `extractPaths`，按 §6 表执行；为每个加一行单测断言提取结果。
- [ ] Step 7：扩展 `ToolScheduler.execute`（或对应 manager 入口）：添加 `callerAgent` 可选参数与 `kairosGuard` 参数，按 §5 实现 Kairos 路径校验、blocklist 校验、toolsDenied 双保险；写 `scheduler-caller-agent.test.ts`。
- [ ] Step 8：新建 `kairos/guard/extract-paths.ts`（中心化 fallback：args 含 `path | dir | cwd | files[]` 时通用提取）和 `blocklist-check.ts`（基于已有 glob 库的 `matchAny`）；写单测。
- [ ] Step 9：新建 `kairos/tools/sleep.ts` 和 `kairos/tools/index.ts`（导出 `registerKairosTools`）；写 `sleep.test.ts`。
- [ ] Step 10：补一条 history：`docs/histories/<month>/<timestamp>-kairos-config-and-tool-guard.md`，列出新增/修改文件清单和测试结果。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm typecheck`（monorepo 根）
- 手工检查：
  - 用 `loadKairosConfig` 读一份样例 `<userData>/kairos/config/` 目录（手工铺一份示例），打印 `buildConfigTipsBlock` 输出，应是 5–10 行人话。
  - 跑一次现有主 Agent test 套件，**确认 callerAgent 改造未影响主 Agent 工具行为**（默认参数零回归）。
- 观测检查：
  - `git diff` 中除新增模块外，仅 6 个 file 工具 definition + 1 处 ToolScheduler + `types.ts` 有修改；任何 `controller.ts` / `runner.ts` 都不应被本 plan 触碰。

## 风险

- 风险：在 ToolScheduler 加可选参数，未来如有其它 caller 概念易扩散为"参数大杂烩"。
- 缓解：把 Kairos 相关参数收敛在 `kairosGuard` 子对象，未来加 caller 也只是新增子对象，不污染顶层签名。

- 风险：`extractPaths` 在某些工具实现遗漏，导致 Kairos 调用"看似允许"的工具绕过 allowedRoots。
- 缓解：未实现 `extractPaths` 的工具被 `callerAgent="kairos"` 调用时默认走 `kairos/guard/extract-paths.ts` 的中心化 fallback，按常见参数名兜底；仍提取不到则拒绝（白名单式）。

- 风险：rule.md 过长（用户写嗨了）导致 [4] 段挤占其它段预算。
- 缓解：loader 截尾到 1500 token；emit 一条 warning event，前端笔记 Tab 显示提示。

- 风险：chokidar 在 macOS 上对挂载盘不可靠。
- 缓解：仅监听 `<userData>/kairos/config/` 这类本地路径；不进入用户业务目录。

## 决策记录

- 2026-05-27：path 校验走"任一 root 通过即放行"，不引入 multi-root guard。原因：保持 `guardWorkspacePath` 主 Agent 接口不变，复杂度集中在 Kairos 侧。
- 2026-05-27：Sleep 工具 executor 仅"记账"返回，不真正阻塞。原因：sleep 必须可被主 Agent wake 中断，定时器逻辑只能在 controller 调度层做；工具仅作为"LLM 表达意图"的入口。
- 2026-05-27：bash 工具不实现 `extractPaths`。原因：shell 字符串里抽路径不可靠（管道、heredoc、变量替换），用 `toolsDenied=["bash"]` 整体管控更安全。
