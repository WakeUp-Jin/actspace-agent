# P0：共享契约与两个空插件

状态：待审核，尚未开始（交互模式）。上级：[总览](README.md)。

## 目标

落下 PA、PB 共用的三样东西：工具「不可用时对模型隐藏」的机制、两个设置字段和 O(1) 的可用性读取、两个插件包及其全部登记。P0 不联网、不改界面。

完成后：

- 工具登记可以带一个同步的可见性判断，`listDefinitions()` 跳过不可见的工具。
- 设置里有 `deepseekDeepSearchEnabled`、`deepseekDocumentEnabled` 两个字段，默认都是 `false`；主进程能在不取设置快照的前提下回答「深度搜索可用吗」「文档解析可用吗」。
- `@actspace/tool-deep-search`、`@actspace/tool-document` 两个包进入默认 Harness。Host 还没有给端口，所以两个工具都不注册，模型看不到。
- 用户能看到的唯一变化：「扩展 › 插件」的内置列表多「深度搜索」「读文档」两行。

## 必读

- [设计文档](../../../design-docs/tool-system/agent-deep-search-and-document-parsing.md) 第 4、5、6 节。
- `packages/README.md` 第 4 节「新增一个插件」。
- `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`。
- `docs/coding-standards/perf-memory-conventions.md`（P0.1、P0.3 在每次模型请求的路径上）。
- 照着写的现有代码：`packages/web/tool-web/src/{manifest,plugin}.ts`（Host 端口型工具插件）、`packages/fs/tool-fs-read/src/{manifest,plugin}.ts`（可选注入和文件权限契约）、`packages/browser/tool-browser/src/plugin.ts`（端口缺席时仍提供服务）。

## 契约

### 可见性判断

```ts
// packages/core/tool-runtime/src/registry.ts
export type ToolExecutorRegistration = {
  readonly definition: ToolDefinition;
  readonly executor: ToolExecutor;
  readonly permission?: ToolPermissionContract;
  /** Synchronous and O(1). `false`, or a throw, hides the tool from `listDefinitions()`; `capture()` is unaffected. */
  readonly visible?: () => boolean;
};
```

`CapturedToolRegistration` 带同一个可选字段。`ToolRuntime.register()`、`ToolRuntimeService.register()` 原样转交登记对象，不用改。

隐藏之后各个调用方的结果（实现时逐条对照，不改这些调用方）：

| 调用方 | 结果 |
| --- | --- |
| `activateAgentFormTools`（`packages/core/agent/src/agent-form.ts`，每个 Run 一次） | 可选成员一个工具都不在时被跳过。成员只在「部分在、部分不在」时抛错，所以两个新插件各自只能贡献一个工具 |
| `AgentLoop` 的 `toolDefinitions(mode)`（每次模型请求） | Run 开始时不可见的工具整个 Run 都没有；中途变不可见的从下一次请求起消失 |
| 主 Agent 的 `bindAgentScope`（`packages/core/runtime/src/harness/agent-factory-plugin.ts`） | 已经发出的调用得到 `denied`（`TOOL_SCOPE_DENIED`），是一次失败结果，不是崩溃 |
| 子智能体（`packages/subagent/subagent/src/tools.ts`） | 创建时取一次名单，之后不再看可见性；所以 Host 端口执行时还要自己查一次 `available()`（PA、PB 实现） |
| `harness_inspect` | 列表里没有不可见的工具 |

### 设置字段与可用性

```ts
// packages/util/shared/src/settings.ts — SettingsV4Tools
/** Explicit opt-in to paid DeepSeek deep search; missing means false. */
deepseekDeepSearchEnabled?: boolean;
/** Explicit opt-in to sending documents to DeepSeek OCR; missing means false. */
deepseekDocumentEnabled?: boolean;
```

```ts
// SettingsStore、SettingsService、ModelRuntimeService 各加同名方法
isDeepseekDeepSearchAvailable(): boolean;  // 开关开 && 有 deepseek Key && 没有停用 web_search
isDeepseekDocumentAvailable(): boolean;    // 开关开 && 有 deepseek Key

// apps/desktop/src/main/runtime-v2/model-port.ts — DesktopRuntimeV2ModelPort（可选成员，现有测试桩不用改）
isDeepseekDeepSearchAvailable?(): boolean;
isDeepseekDocumentAvailable?(): boolean;
/** DeepSeek 默认连接的 Key；主进程内使用，每次调用时读取。 */
getDeepseekApiKey?(): string | undefined;
```

「停用 `web_search`」和 `toSettingsV4` 同一个合并规则：`v4Metadata.tools.disabledTools` 非空时用它，否则用 `settings.agent.disabledTools`。

### 插件

| | 深度搜索 | 文档解析 |
| --- | --- | --- |
| 目录 | `packages/web/tool-deep-search/` | `packages/document/tool-document/` |
| 包名 | `@actspace/tool-deep-search` | `@actspace/tool-document` |
| `pluginId` | `actspace.deep-search` | `actspace.document` |
| 清单行 `id` / `directory` | `deep-search` / `web` | `document` / `document` |
| `entryId` | `tools.deep-search` | `tools.document` |
| 工具 | `deep_search` | `read_document` |
| 提供的服务 | `tools.deep-search` | `tools.document` |
| Host 端口（导出常量） | `actspace.host.tools.deep-search`（`DEEP_SEARCH_HOST_PORT_ID`） | `actspace.host.tools.document`（`DOCUMENT_HOST_PORT_ID`） |
| `host.required` | `["network"]` | `["network", "filesystem.read"]` |
| `modes`（P0） | `["plan", "agent"]` | `["plan", "agent"]` |
| `display` | 「深度搜索」/「多轮搜索网页，给出带出处的结论」 | 「读文档」/「读取 PDF、Word 和 PPT 里的文字」 |

两份 manifest 的共同点：`entry: { entryId, behavior: "./plugin.js", required: false }`、`injects: ["tools.runtime"]`、`optionalInjects: [<Host 端口>]`、`frontend: null`、`contributions: { services: [<服务>], tools: [<工具>], prompts: [], events: [] }`、`display` 的 `scope: "session", defaultEnabled: true, canDisable: false`、`version: "2.0.0"`。

```ts
// 两个包的 plugin.ts 导出同一组名字（tool-contracts.test.ts 按这组名字检查）
export type ToolHandler = (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly dispose?: () => Promise<void> };
export type HostPort = { readonly createPorts: () => ToolPorts | Promise<ToolPorts>; readonly available: () => boolean };
export const TOOL_DEFINITIONS: readonly { readonly localName: ToolName; readonly definition: ToolDefinition }[];
export function registerTools(runtime: ToolRuntime, ports: ToolPorts, visible?: () => boolean): readonly ToolRegistration[];
export async function apply(ctx: CordisContext): Promise<void>;
```

`apply` 的行为：

- 没有 `tools.runtime` 时抛错。
- Host 端口不在：不注册工具，`ctx.provide(<服务>, { available: false, registrations: [], definitions: TOOL_DEFINITIONS })`。
- Host 端口在：`createPorts()` → `registerTools(runtime, ports, () => host.available())` → 提供 `{ available: true, registrations, definitions }`；清理放进 `ctx.effect`，先注销工具再 `ports.dispose?.()`，写法照 `tool-web`。
- `registerTools` 里端口没给处理函数时，用返回 `CAPABILITY_UNAVAILABLE` 的兜底（照 `tool-web`）。

`deep_search`、`read_document` 的参数结构和说明文字照设计文档第 7.1、8.1 节，P0 就写全，PA、PB 不再改定义（PA.8 除外）。

`read_document` 的两处特别之处：

- 参数结构的 `required` 是空数组，所以 `{}` 能通过结构校验。`registerTools` 要在处理函数外面包一层：`path`、`artifact_id` 不是恰好一个时，直接返回 `INVALID_ARGUMENTS`，不调用端口。`tool-contracts.test.ts` 会断言 `{}` 得到 `INVALID_ARGUMENTS` 且端口没有被调用。
- 权限契约照 `read_file`：`extractResources` 在有 `path` 时返回 `[await context.canonicalizeFile(args.path, "read")]`，只有 `artifact_id` 时返回 `[]`；`evaluate` 返回 `allow`；`suggestGrants` 给「只这个文件」和「这个目录树」。授权范围用自己的：`{ pluginId: "actspace.document", permissionDomain: "document-read", policyVersion: 1 }`。

`deep_search` 的权限契约和 `tool-web` 一样（不提取资源，`allow`）。

`plugin.ts` 不能 import `node-ports.ts`：`scripts/build-default-harness.mjs` 从 `./plugin` 入口打包每个工具插件，Node 实现只能由 Host 引入。P0 里两个包都还没有 `node-ports.ts`。

## 任务

### P0.1 工具登记的可见性判断

- 改 `packages/core/tool-runtime/src/registry.ts`：两个类型加 `visible`；`register()` 把它带进 `CapturedToolRegistration`；`listDefinitions()` 先过滤再排序，`visible` 抛错按不可见处理。`capture()` 不动。
- 测试，加在 `packages/core/tool-runtime/src/test/runtime.test.ts`：
  - `visible` 返回 `false` 的工具不在 `listDefinitions()` 里，`capture(name)` 仍然取得到。
  - `visible` 的返回值变了，下一次 `listDefinitions()` 跟着变。
  - `visible` 抛错时工具不可见，`listDefinitions()` 不抛。
  - 没有 `visible` 的登记和今天一样。
  - 绑定了作用域的运行时里，名单函数从 `listDefinitions()` 算出来时，调用一个已变不可见的工具得到 `denied` / `TOOL_SCOPE_DENIED`，执行器没有被调用。
- 测试，加在 `packages/core/agent/src/test/agent-form.test.ts`：
  - 只有一个工具的可选成员，工具不可见时 `activateAgentFormTools` 跳过它，不抛错。
  - 必需成员的工具不可见时仍然抛「incomplete or unavailable」（说明这个机制不能用在必需插件上）。

验证：`pnpm --filter @actspace/tool-runtime test && pnpm --filter @actspace/agent test`。

### P0.2 两个设置字段

- `packages/util/shared/src/settings.ts`：`SettingsV4Tools` 加两个字段，紧跟 `deepseekFetchEnabled`。
- `apps/desktop/src/main/settings/migrations.ts`：设置清洗里加 `deepseekDeepSearchEnabled: tools.deepseekDeepSearchEnabled === true`、`deepseekDocumentEnabled: tools.deepseekDocumentEnabled === true`。
- `apps/desktop/src/main/settings/defaults.ts`：两个都是 `false`。
- 测试：`apps/desktop/src/main/test/deepseek-settings.test.ts` 加「缺省是 false」「只有 `true` 被保留，其他值清洗成 false」「写入后重新加载仍在」。golden 用 `UPDATE_SETTINGS_GOLDEN=1 npx vitest run apps/desktop/src/main/test/settings-characterization.test.ts` 重新生成，逐个看 diff，只应多出这两个字段。

如果审核时「出入 2」定为默认开：只把 `deepseekDocumentEnabled` 的清洗改成 `!== false`、缺省值改成 `true`，并改对应测试。

验证：`pnpm --filter @actspace/shared test && pnpm --filter @actspace/desktop test`。

### P0.3 可用性读取

- `apps/desktop/src/main/settings/store.ts`：`SettingsStore` 加两个方法，只读 `this.v4Metadata.tools`、`this.settings.agent.disabledTools`、`this.secrets.deepseek`。不调 `getV4()`、`toSettingsV4()`、`cloneJson`。
- `apps/desktop/src/main/settings/service.ts`：两个转交方法，放在 `getStoredKey` 旁边。
- `apps/desktop/src/main/model-runtime-service.ts`：两个转交方法，加 `getDeepseekApiKey()`（`this.settings.getStoredKey("deepseek")`）。不经过 `getToolEnvironment()`（它每次调用都会取一次设置快照）。
- `apps/desktop/src/main/runtime-v2/model-port.ts`：三个可选成员。
- 测试，新建 `apps/desktop/src/main/test/deepseek-availability.test.ts`：
  - 四种组合（开关开 / 关 × 有 Key / 没有 Key）下两个方法的返回值。
  - 停用 `web_search` 后深度搜索不可用、文档解析不受影响；`v4Metadata` 的停用列表为空时回落到旧字段。
  - 改开关、存 Key、清 Key 之后，下一次调用立刻反映，不需要重启。
  - 调用这两个方法时 `SettingsStore.getV4`、`SettingsService.getV2` 都没有被调用（用 `vi.spyOn`）。`pnpm check:hot-path-reads` 查不出这类调用，所以用这条测试守住。

验证：`pnpm --filter @actspace/desktop test && pnpm check:hot-path-reads`。

### P0.4 两个插件包

每个包的文件（照 `packages/web/tool-web/`）：

- `package.json`：`exports` 有 `.`、`./manifest`、`./plugin`；依赖 `@actspace/cordis-adapter`、`@actspace/tool-runtime`、`@actspace/shared`（`workspace:*`）；开发依赖 `@types/node`、`typescript`、`vitest`（`catalog:`）；脚本 `build`、`typecheck`、`test`。
- `tsconfig.json`：和 `tool-web` 的相同。`tsconfig.build.json` 由 P0.5 的生成脚本产生，不手写。
- `src/manifest.ts`、`src/plugin.ts`、`src/index.ts`（P0 只导出 manifest 和 plugin）。
- `src/test/lifecycle.test.ts`。
- `README.md`：一段话写清这个包拥有什么、公开入口、Host 端口，链接到设计文档。

`packages/document/README.md` 新建，frontmatter `kind: "package-group"`，结构照 `packages/web/README.md`。

`lifecycle.test.ts` 覆盖（两个包各一份）：

- 没有 Host 端口：服务是 `{ available: false, registrations: [] }`，`runtime.registry.listDefinitions()` 里没有这个工具。
- 有 Host 端口且 `available()` 为真：工具在 `listDefinitions()` 里；`available()` 变假后不在，`capture()` 仍取得到。
- `available()` 抛错：工具不可见。
- 销毁时先注销工具，再调 `ports.dispose`；`dispose` 抛错时聚合成一个错误。
- `read_document`：`{}`、同时给 `path` 和 `artifact_id` 都得到 `INVALID_ARGUMENTS`，端口没有被调用；只给一个时端口被调用一次。
- `read_document`：`extractResources` 在有 `path` 时返回一个 `read` 文件资源，只有 `artifact_id` 时返回空。

验证：`pnpm install && pnpm --filter @actspace/tool-deep-search test && pnpm --filter @actspace/tool-document test`。

### P0.5 登记与生成

- `packages/core/runtime/src/plugin-catalog.ts`：import 两份 manifest；`deep-search` 行紧跟 `web-tools`，`document` 行紧跟 `image-inspection`，都是 `loaders: harness`、`admitOnHost: true`。
- `packages/core/runtime/package.json`：加两个依赖。
- `packages/composition/cordis-adapter/src/service-contract.ts`：服务 ID 加 `deepSearch: "tools.deep-search"`、`documentTools: "tools.document"`；定义照 `webTools`，`required: false`；角色是 `serviceRole("deepSearch", "@actspace/tool-deep-search", "tools.deep-search:default", ["tools.runtime"])` 和 `serviceRole("documentTools", "@actspace/tool-document", "tools.document:default", ["tools.runtime"])`。`default-harness.test.ts` 会检查所有者等于包名、角色 ID 等于 `<entryId>:default`。
- `packages/core/runtime/src/harness/default-harness.ts`：`DEFAULT_HARNESS_SHARED_SERVICES` 和 `OPTIONAL_HOST_SHARED_SERVICES` 都加两个 Host 端口。`manifests.ts` 和 `cordis.yml` 不用改（必需注入是两个列表相减算出来的）。
- `packages/core/runtime/src/harness/default-harness-definition.ts`：`OPTIONAL_INJECT_FALLBACKS` 加 `"actspace.host.tools.deep-search": "deep_search is not registered"`、`"actspace.host.tools.document": "read_document is not registered"`。
- `scripts/contract-matrix/source-registry.mjs`：`MANIFEST_PATHS`、`PACKAGE_PATHS` 各加两条。
- 重新生成：`pnpm install`、`node scripts/generate-desktop-build-graph.mjs`、`pnpm --filter @actspace/runtime build`、`pnpm generate:plugin-loader`、`pnpm gen:contract-matrix`。
- 跟着改的枚举式测试和夹具：
  - `packages/core/runtime/src/test/plugin-catalog.test.ts`：条目顺序里加两个 ID；加两行期望 `["deep-search", ["tools.deep-search"], ["tools.runtime"], [{ id: "actspace.host.tools.deep-search", fallback: "deep_search is not registered" }]]` 和 `document` 的同形行。`canDisable` 列表和「默认关闭」列表不变。
  - `packages/core/runtime/src/harness/default-harness.test.ts`：工具插件 ID 列表加两个。各模式可见工具的期望不变（测试里的 Host 没给新端口）。
  - `packages/core/runtime/src/harness/browser-capability.test.ts`：`harnessEntriesMissingHostCapabilities(["filesystem.read"])` 的期望变成 `["deep-search", "document", "browser-tools", "subagent-codex", "subagent-claude-code"]`。
  - `packages/core/runtime/src/test/tool-contracts.test.ts`：包列表加 `"tool-deep-search"`、`"tool-document"`；参数表加 `deep_search: { question: "test" }`、`read_document: { path: "file.txt" }`。
  - `apps/desktop/src/renderer/mock/plugins-fixture.ts`：`SESSION` 加 `["deep-search", "深度搜索", "多轮搜索网页，给出带出处的结论", "web"]`、`["document", "读文档", "读取 PDF、Word 和 PPT 里的文字", "document"]`。
- 新增一条测试，放在 `default-harness.test.ts`：Host 提供 `actspace.host.tools.deep-search`（`available` 由测试控制）时，`available` 为真则 Plan、Agent 的可见工具里有 `deep_search`、Chat 里没有；为假则三个模式都没有，且 Run 能正常启动。
- 跑现有的 Host 契约升级测试，确认「未改动过的内置组合自动升级、已保存的选择要求重启」在新增两个端口后仍然成立：`packages/harness-evolution/harness-control/src/test/{activation,candidate}.test.ts`、`packages/core/runtime/src/harness/tool-composition.test.ts`。测试里写死了摘要或端口列表的地方跟着改。

验证：`pnpm test:plugin-catalog && pnpm test:contract-matrix && pnpm --filter @actspace/runtime test && pnpm --filter @actspace/harness-control test && pnpm check:packages && pnpm check:desktop-build-graph`。

### P0.6 文档与 history

- `packages/README.md`：能力目录表加 `document/` 一行（「读 PDF、Word、PPT 文档的工具」，1 个包，会话）；`web/` 的包数 1 → 2、职责改成「网页搜索、读取与深度搜索工具」。
- `packages/web/README.md`：包表加 `tool-deep-search` 一行；「包之间怎么连」补一句它的 Host 端口是可选的。
- `packages/core/README.md`：列出可选共享服务的那句话加上两个新端口。
- `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`：包表加两行；「缺授予时注册但报错」那段后面补一段「两个 DeepSeek 工具用可见性判断隐藏」，链接到设计文档第 5 节。
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`：P0.5 已重新生成，这里核对 diff。
- 设计文档第 5、6 节：把「做法」改写成当前事实，写上实际的文件路径。
- `docs/histories/2026-11/` 新增一条。
- 更新总览的进度和状态行。

验证：`pnpm check:docs && pnpm test:package-readmes`。

## 完成标准

- 总览「统一验证命令」里「每个子计划收尾都跑」的那一组全部通过；和开工前的基线相比没有新增失败。
- 真实应用启动一次（`pnpm dev:log`）：「扩展 › 插件」的内置列表里有「深度搜索」「读文档」，都不能关；发一条消息，请求里的工具列表和今天一样（没有 `deep_search`、`read_document`）。
- 用一份旧的数据目录启动：没有改过 Harness 的用户不出现重启提示。
- `rg "sk-[A-Za-z0-9]{8,}"` 在仓库里没有命中。

## 回退

回退 P0 的提交。两个设置字段在旧版本里被设置清洗丢掉，不用迁移。Host 契约摘要变回去，保存过 Harness 选择的用户再看到一次重启提示。
