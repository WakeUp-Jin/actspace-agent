# S1 包搬家与改名

## 目标

`packages/` 变成两级结构 `packages/<能力>/<包>`，目录名就是包名去掉 `@actspace/`。按[设计 §4](../../../design-docs/架构优化/02-插件结构设计.md#4-新目录与包名对照)搬 62 个包、改 16 个包名，并新建 `@actspace/tool-subagent`、`@actspace/skill` 两个包。运行行为不变。

## 范围

- 包含：目录搬迁、`package.json` 的 `name`、全仓 import 与依赖声明、相对路径、根配置、CI、脚本、生成文件，以及新建两个包。
- 不包含：插件清单和 `display`（S2）、开关和插件页（S3）、README 内容（S4，本子计划只让旧 README 跟着目录走）、任何运行时标识。

## 必读

- `AGENTS.md`
- [02 插件结构设计](../../../design-docs/架构优化/02-插件结构设计.md) §3、§4、§9
- `scripts/check-package-boundaries.mjs`：带 `./plugin` 导出的包必须有 `src/manifest.ts`、`src/plugin.ts` 和生命周期测试

## 步骤

### 1. 写一次性迁移脚本

写 `tmp/s1-move.mjs`，不进 git。映射表照抄设计 §4，每行包含原目录、新目录、原包名、新包名。脚本按下面的顺序执行，每一步打印改了哪些文件：

1. **搬目录**：对每一行执行 `git mv packages/<原> packages/<新>`。`packages/tools/runtime` 这类旧目录要先搬走，空出来的 `packages/tools` 等最后删掉。
2. **改包名**：改新目录下 `package.json` 的 `name`。
3. **改引用**：在 `apps/`、`packages/`、`scripts/`、`.github/` 和根目录配置里，把旧包名替换成新包名。只处理 git 跟踪的文件，跳过 `node_modules`、`dist`、`pnpm-lock.yaml`。正则写成 `@actspace/<旧>(?=["'/\s])`，并且按名字长度从长到短替换，避免 `core-agent` 误伤 `core-agent-loop`。
4. **改相对路径**：每个包的 `tsconfig*.json`（`extends`、`references`）、`package.json` 的 scripts、`vitest.config.*` 里指向仓库根的 `../../`，按新深度重算。原来在第一级的包（如 `packages/boot`）多一层 `../`。
5. **改路径字符串**：在 `tsconfig.base.json`（`shared`、`cordis-adapter` 的 paths）、`tsconfig.desktop-deps.json`、`apps/desktop/tsconfig*.json`、`scripts/**`、`.github/workflows/**`、`CODEOWNERS` 里，把 `packages/<原>` 替换成 `packages/<新>`。

### 2. 新建 `@actspace/tool-subagent`

- 目录 `packages/subagent/tool-subagent/`，结构照抄 `packages/background-tasks/tool-background-tasks/`（`package.json` 带 `./plugin`、`./manifest` 导出，`tsconfig.json`、`tsconfig.build.json`）。
- `src/plugin.ts`：内容从 `packages/core/runtime/src/harness/harness-subagent-tools.ts` 搬过来，导出 `apply` 和 `inject`。
- `src/manifest.ts`：`defineBuiltinPluginManifest`。`pluginId` 用 `actspace.subagent-tools`，Entry id 用 `subagent-tools`。provides / injects 照抄 `DEFAULT_HARNESS_ENTRIES` 里 `subagent-tools` 那一行。
- `src/test/lifecycle.test.ts`：照抄 `tool-background-tasks` 的生命周期测试。
- 删除 `packages/core/runtime/src/harness/harness-subagent-tools.ts`。`defaultHarnessEntrySource` 里 `subagent-tools` 改为 `@actspace/tool-subagent/plugin`，这张特殊映射整体在 S2 删除。
- `@actspace/runtime` 的 `package.json` 加依赖 `@actspace/tool-subagent`，打包默认 Harness 时要用。

### 3. 新建 `@actspace/skill`

- 目录 `packages/skill/skill/`，纯库：只有 `.` 导出，没有 plugin。
- 把 `packages/context/prompt/src/skills/catalog.ts`、`discovery.ts` 搬到 `src/`。`contributor.ts` 留在 prompt，它负责把 Skill 放进提示词。
- `@actspace/prompt` 的 `index.ts` 不再重导出 catalog / discovery，改为依赖 `@actspace/skill`。所有从 `@actspace/prompt` 导入这些符号的地方，改为从 `@actspace/skill` 导入。动手前先 `grep -rn "discoverSkills\|SkillCatalog" apps packages` 列出调用方（以 catalog.ts、discovery.ts 实际导出的符号名为准）。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-skills.ts` 同样改为从 `@actspace/skill` 导入。
- 相关测试跟着搬到 `packages/skill/skill/src/test/`。

### 4. 根配置

- `pnpm-workspace.yaml`：`packages` 只留 `apps/*` 和 `packages/*/*`，删掉 `packages/*`。
- `packages/core/runtime/scripts/build-default-harness.mjs`：`external` 里的 `@actspace/core-scope` 改为 `@actspace/scope`（步骤 1.3 会改到，这里核对一遍）。`packages/core/runtime/src/harness/default-harness.ts` 的 `hostModules` 同理。
- **已持久化的 Harness 产物**：先查 `publishPluginArtifact` / `loadArtifact` 是否把 `sharedModules` 的 specifier 写进磁盘记录。如果写了，`@actspace/core-scope` 改名后，旧产物在恢复时会解析失败。处理办法：在 `defaultHarnessSharedModules` 里给改了名的共享模块同时登记旧 specifier（`LEGACY_SHARED_MODULE_SPECIFIERS = { "@actspace/core-scope": "@actspace/scope" }`），并补一个“用旧 specifier 的产物能恢复”的测试。如果没写进磁盘，在执行过程里记下结论，不加兼容代码。
- 跑 `pnpm install` 更新 `pnpm-lock.yaml`。

### 5. 生成文件

- `pnpm gen:contract-matrix`，重新生成 `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`。
- `node scripts/generate-desktop-build-graph.mjs`，重新生成桌面构建图。
- `packages/core/runtime/cordis.yml` 和 `apps/cli/cordis.yml` 里的包名由步骤 1.3 替换，再与 `TRUSTED_LOADER_ENTRIES` 对一遍。

### 6. 检查脚本

- `scripts/check-package-boundaries.mjs`：新增两条规则。`packages/` 下的 `package.json` 必须正好在第二级；目录名必须等于包名去掉 `@actspace/`。
- `scripts/check-current-docs.mjs` 的 `currentTruthFiles` 若列了已搬走的路径，改为新路径。
- `scripts/test/package-cutover.test.mjs`、`scripts/check-package-cutover.mjs`、`scripts/check-v2-legacy-removal.mjs` 里硬编码的旧路径按新路径改。

## 验证

- README「统一验证命令」全部通过。
- `git diff -M --stat HEAD` 里，搬迁的文件都显示为 rename（相似度 ≥ 90%）。
- 残留检查，以下命令都没有命中：
  - `grep -rn "@actspace/tools-\|@actspace/core-agent\|@actspace/core-scope\|@actspace/session-jsonl" apps packages scripts .github --exclude-dir=node_modules --exclude-dir=dist`
  - `ls packages/*/package.json`（第一级不应再有包）
- Electron 实机：用已有的数据目录启动，打开一个旧会话、新建一个会话发一条消息、运行一条 Bash，都正常。

## 风险

- 正则误替换。缓解：按长度从长到短、带结尾边界；迁移后跑全量 typecheck 和测试。
- 已持久化的 Harness 产物引用旧包名。缓解：步骤 4 的检查和兼容登记。
- 打包脚本按路径找原生模块或资源（`release-package.sh`、`package-browser-components.mjs`）。缓解：`pnpm --filter @actspace/desktop build` 之后，再跑一次 `scripts/release-package.sh` 的 dry run（如果有）或检查打包产物里的 `app.asar` 内容。

## 回滚

`git revert` 本提交，然后 `pnpm install`。
