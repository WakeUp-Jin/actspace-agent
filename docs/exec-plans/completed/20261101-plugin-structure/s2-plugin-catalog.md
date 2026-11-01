# S2 插件清单与展示信息

## 目标

每个插件只在一个地方登记：`packages/core/runtime/src/plugin-catalog.ts`。每个插件的 manifest 带中文 `display`。原来手写的五份重复清单改为从插件清单计算或生成；Harness 打包别名和写死的浏览器判断删掉。运行行为不变。

## 范围

- 包含：`display` 字段与校验、插件清单、`cordis.yml` 生成、五处重复登记的收敛、`tool-todo` 和 runtime 的入口整理、通用的“Host 能力不足就不加载”规则、runtime 不再重导出浏览器工具、`check-plugin-catalog`。
- 不包含：设置开关与插件页（S3）、README（S4）、运行时标识。

## 必读

- [02 插件结构设计](../../../design-docs/架构优化/02-插件结构设计.md) §5、§6
- `packages/composition/cordis-adapter/src/manifest.ts`（`defineBuiltinPluginManifest`、`validatePluginManifest`）
- `packages/core/runtime/src/profiles/composition.ts`、`src/harness/default-harness-definition.ts`、`src/harness/default-harness.ts`、`scripts/build-default-harness.mjs`、`src/startup/boot.ts`

## 步骤

路径为 S1 之后的新路径。

### 1. `display` 字段

- `packages/composition/cordis-adapter/src/manifest.ts`（及 `PluginManifest` 类型所在文件）：
  - `PluginManifest` 增加可选 `display?: { title: string; description: string; scope: "global" | "session"; defaultEnabled: boolean; canDisable: boolean }`。
  - `BuiltinPluginManifestInput` 增加必填 `display`，原样写进 manifest。
  - `validatePluginManifest`：有 `display` 时校验 `title` 1–12 个字、`description` 1–40 个字、`scope` 合法、两个布尔值是布尔。
- 给每个插件的 `src/manifest.ts` 加 `display`，文字照抄设计 §5.4 两张表。`english-learning` 和 `tool-browser` 为 `defaultEnabled: false, canDisable: true`，其余 `defaultEnabled: true, canDisable: false`。
- `@actspace/runtime` 新文件 `src/manifests.ts`：给 `actspace-runtime`、`session-runtime`、`agent-runtime`、`agent-factory` 各写一份 `defineBuiltinPluginManifest`。plugin id 分别是 `actspace.runtime`、`actspace.session-runtime`、`actspace.agent-runtime`、`actspace.agent-factory`；provides / injects 照抄现有 `TRUSTED_LOADER_ENTRIES` 和 `DEFAULT_HARNESS_ENTRIES`。动手前先 grep 这些 plugin id 是否已被占用。
- `@actspace/tool-todo`：新增 `src/projection.ts`（导出 `apply = applyProjection`）和 `projectionManifest`（Entry id `todo-projection`，全局）；`src/plugin.ts` 的 `apply` 改为只注册工具（即现在的 `applyTools`）。`package.json` 增加 `./projection` 导出。删除 `packages/core/runtime/src/session/todo-projection-plugin.ts` 和 runtime 的 `./todo-projection` 导出。
  - 动手前确认现在 `apply`（同时注册视图和工具）有没有调用方。如果有，改为分别调用两者。
- 浏览器：把 `composition.ts` 里内联的 `browserManifest` 搬进 `packages/browser/tool-browser/src/manifest.ts`（若已有 manifest，以内联版本的 `host.required: ["browser"]`、`required: false` 为准合并），加 `display`。

### 2. 插件清单

新文件 `packages/core/runtime/src/plugin-catalog.ts`：

```ts
export type PluginLoader = "host" | "harness";
export type PluginCatalogEntry = {
  readonly id: string;
  readonly manifest: PluginManifest;
  readonly module: string;
  readonly loaders: readonly PluginLoader[];
  readonly codec?: string;
  readonly directory: string;   // 能力目录名，插件页显示用，如 "context"
};
export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [ /* 设计 §5.4 的全部条目，顺序照搬现有加载顺序 */ ];
export const PLUGIN_PACKAGES_OUTSIDE_DEFAULT: readonly { package: string; reason: string }[] = [ /* 设计 §4 开头的五个 */ ];
export function pluginCatalogEntry(id: string): PluginCatalogEntry | undefined;
```

- 顺序：先按现有 `cordis.yml` 的顺序排 `host` 行，再按现有 `DEFAULT_HARNESS_ENTRIES` 的顺序排 `harness` 行；`llm-service` 一行写两个 loader。
- 从 `@actspace/runtime` 的 `index.ts` 导出 `PLUGIN_CATALOG`、`pluginCatalogEntry` 和类型，供桌面端 S3 使用。

### 3. 从清单派生

先写对照测试，再替换实现：

1. 新测试 `packages/core/runtime/src/test/plugin-catalog.test.ts`，在旧代码还在的时候断言：
   - 清单计算出的 loader 条目与现在的 `TRUSTED_LOADER_ENTRIES` 逐项相等（id、name、inject）；
   - 清单计算出的 Harness 行与现在的 `DEFAULT_HARNESS_ENTRIES` 逐项相等（id、provides、injects、optionalInjects）；
   - 清单的 `module` 与 `defaultHarnessEntrySource(id)` 相等（`agent-factory`、`todo-tools` 除外，它们的别名本步骤会删）。

   有不相等的，以现有代码为准修正 manifest，直到测试通过。
2. 替换：
   - `TRUSTED_LOADER_ENTRIES`：改为 `PLUGIN_CATALOG.filter(host).map(...)`，`name` 取 `module`，`inject` 取 manifest 第一个 behavior 的 `injects`。
   - `DEFAULT_HARNESS_ENTRIES`：改为从清单计算，类型 `DefaultHarnessEntry` 保留。删除 `defaultHarnessEntrySource`。
   - `scripts/build-default-harness.mjs`：入口改为 `PLUGIN_CATALOG` 的 harness 行的 `module`，删除 `default-factory-entry` esbuild 插件。`agent-factory` 的入口为 `@actspace/runtime/agent-factory`（`package.json` 新增导出，指向 `dist/harness/agent-factory-plugin.js`，并让该文件导出 `apply`）；`todo-tools` 为 `@actspace/tool-todo/plugin`。
   - `TOOL_PLUGIN_TRANSPORT`、`loadBuiltinToolCodec`：改为按清单的 `codec` 查找；`toolTransportPatches` 改为遍历清单里带 harness loader 的行。
   - `baseBundle` 的 manifest 列表：改为清单中需要在 Host 准入的 manifest（现有列表里的那些），由清单计算。
   - 删除内联的 `browserManifest`；`browserBundle` 改用 `@actspace/tool-browser/manifest`。
   - 对照测试改为断言派生结果的形状（不再和旧常量比）。
3. `cordis.yml` 改为生成：
   - 新脚本 `scripts/generate-plugin-loader.mjs`：读 `@actspace/runtime` 构建产物里的清单，写 `packages/core/runtime/cordis.yml`，文件头一行注释“由 scripts/generate-plugin-loader.mjs 生成，勿手改”；`--check` 模式只比较不写。
   - 根 `package.json` 增加 `generate:plugin-loader`，并把 `--check` 加进 `check:packages`。
   - boot 现有的“cordis.yml 与 `TRUSTED_LOADER_ENTRIES` 一致”校验保留。

### 4. 通用的 Host 能力规则

- `boot.ts` 里 `disabledHarnessEntries` 的 `options.host.capabilityCeiling.includes("browser") ? [] : ["browser-tools"]` 删掉，改为：清单里 harness 行的 manifest `host.required` 有任何一项不在 `capabilityCeiling` 里，该条目进入 `disabledHarnessEntries`。
- `default-harness.ts` 里 `name === "browser-tools"` 的 config 特判，改为读清单条目的 manifest `config`（把那份 config 写进 tool-browser 的 manifest）。
- 测试：`boot` 相关测试新增“Host 没有 `browser` 能力时 `browser-tools` 不加载”和“有能力时加载”两例，替换原写死判断的测试。

### 5. runtime 不再重导出浏览器

- 删除 `packages/core/runtime/src/index.ts` 里对 `@actspace/tool-browser` 的三行重导出（约 34、35、48 行）。
- 桌面端改为直接从 `@actspace/tool-browser` 导入 `createNodeBrowserCapability`、`SocketBrowserBridgeTransport`、`BROWSER_TOOLS_HOST_PORT_ID` 及类型；`apps/desktop/package.json` 加依赖。
- `@actspace/runtime` 的 `package.json` 保留对 `@actspace/tool-browser` 的依赖（打包默认 Harness 用），源码里除插件清单外不再引用。

### 6. `check-plugin-catalog`

新脚本 `scripts/check-plugin-catalog.mjs`（读 runtime 构建产物），加进 `check:packages`：

- 清单里每一行的 manifest 都有 `display`，且 `display.scope` 与 `loaders` 一致（含 `host` 为 `global`，只有 `harness` 为 `session`）。
- `module` 和 `codec` 都能 `import.meta.resolve`。
- `packages/` 下有 `src/plugin.ts` 的包，要么在清单里，要么在 `PLUGIN_PACKAGES_OUTSIDE_DEFAULT` 里。
- `DESKTOP_APP_BUNDLE` 的 manifest 和 `apps/cli/cordis.yml` 的条目都在清单里，或在 `PLUGIN_PACKAGES_OUTSIDE_DEFAULT` 里。
- 对应测试 `scripts/test/plugin-catalog.test.mjs`，用临时目录构造“漏登记”“缺 display”两种失败。

## 验证

- README「统一验证命令」+ `pnpm generate:plugin-loader --check`。
- 残留检查：`grep -rn "defaultHarnessEntrySource\|harness:todo\|harness:factory\|TOOL_PLUGIN_TRANSPORT\|browserManifest" packages apps scripts --exclude-dir=node_modules --exclude-dir=dist` 无命中。
- 默认 Harness 的产物清单 `dist/default-harness/files.json` 与 S1 结束时相比，条目数不变（记进执行过程）。
- Electron 实机：新建会话，Agent 的工具列表与 S1 结束时一致；用已有数据目录恢复旧会话正常。

## 风险

- manifest 的 provides / injects 与手写清单不一致，派生后组合变了。缓解：步骤 3.1 先用对照测试锁住。
- 新增的 runtime 内部 plugin id 与旧持久化数据冲突。缓解：只新增，不改已有 id；步骤 1 先 grep。

## 回滚

`git revert` 本提交。
