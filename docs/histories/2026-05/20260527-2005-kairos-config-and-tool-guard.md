## [2026-05-27 20:05] | Task: 落地 Kairos config + Tool Guard 基座

### 🤖 Execution Context

- **Agent ID**: cursor-agent / actspace-agent workspace
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE / pnpm 10.33

### 📥 User Query

> 一个一个执行（执行 `docs/exec-plans/active/kairos_config_and_tool_guard.md`）

### 🛠 Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **Config 子系统**：新建 `kairos/config/{schema,loader,prompt-assembler}.ts`。schema 手写 validator + 默认值（不引入 zod）；loader 容错读取 3 份 JSON + rule.md（ENOENT 静默落默认，JSON 损坏记 warning 不 throw，rule.md 超 1500 token 截尾）；prompt-assembler 把配置拼成 `## 配置提示` 段（[3]段），超 600 token 时用二分截断 paths 列表并附"另有 N 条已省略"。
- **ToolScheduler callerAgent 改造**：`ToolDefinitionSpec` 与 `InternalTool` 同步追加 `extractPaths?: (args)=>string[]` 字段；`ToolManager.registerFromSpec` 透传该字段；`ToolScheduler.execute` 新增第 5 参 `options?: SchedulerExecuteOptions { callerAgent, kairosGuard }`。callerAgent="kairos" 时执行 toolsDenied → extractPaths → allowedRoots（任一 root 通过即放行）→ blocklist glob 拒绝（相对+绝对双路径匹配兜底）四级校验，全部失败统一返回 `cancelled` + isError，进入正常工具结果流。
- **6 个 file 类工具补 `extractPaths`**：read_file / write_file / edit_file / list_directory（args.path） + grep / glob（args.path 默认 `.`）。bash / web_search / analyze_media 未补 hook，靠 toolsDenied 双保险。
- **Kairos guard 模块**：新建 `kairos/guard/{extract-paths,blocklist-check}.ts`。`extract-paths` 是中心化兜底（args.path/filePath/file/dir/cwd + 数组 files/paths）；`blocklist-check` 自实现极简 `globToRegex` 支持 `**/`/`/**`/`**`/`*`/`?` 五种模式，`**/` 在开头吸 0 段以对齐 micromatch 直觉。
- **Sleep 工具**：新建 `kairos/tools/{sleep,index}.ts`。Sleep 仅"记账"返回 plannedSeconds + reason，定时器逻辑留到 plan 5 controller 实施。`registerKairosTools(manager)` 单次入口便于 plan 5 装配。
- **务实精简**：未引入 zod / chokidar / micromatch；watcher 模块跳过，简化为 `reloadConfig()` 由 plan 6 main IPC 在 write-config 后主动调用。

### 🧠 Design Intent (Why)

- **callerAgent 集中 scheduler**：把"Kairos 与主 Agent 行为差异"集中在唯一执行入口，避免在每个工具内部分支判断。主 Agent 完全零回归（不传 options 时 4 级校验全跳过）。
- **extractPaths 双层（tool 自带 + 中心 fallback）**：file 工具在 definition 里手写最精确语义；新工具忘了写时由 fallback 兜底；fallback 也提不出来则白名单式拒绝。这给"未来工具开发者"留出"自检+保护网"。
- **手写 globToRegex**：blocklist 模式极少（典型 < 20 条），自实现 100 行内、零依赖，比拉 micromatch 整套体系成本低；`**/` 吸 0 段是用户直觉的关键修复。
- **Sleep 不入定时器**：定时器属于"调度层"职责，工具只负责把 LLM 意图录到 SessionEvent 流；controller 在 turn 结束后扫描"最后一次 sleep 工具调用"并夹紧才进入 setTimeout。

### 📁 Files Modified

- `packages/agent-core/src/tools/types.ts`（ToolDefinitionSpec 加 extractPaths）
- `packages/agent-core/src/internal-tools.ts`（InternalTool 加 extractPaths）
- `packages/agent-core/src/tools/manager.ts`（registerFromSpec 透传 + execute 加 options + 新 type ToolExecuteOptions/KairosGuardContext）
- `packages/agent-core/src/tools/scheduler.ts`（execute 加 options + checkKairosGuard 实现）
- `packages/agent-core/src/tools/tools/{read-file,write-file,edit-file-diff,list-directory,grep,glob}/definition.ts`（6 个工具补 extractPaths）
- `packages/agent-core/src/kairos/config/schema.ts`（新增，手写 schema + parser）
- `packages/agent-core/src/kairos/config/loader.ts`（新增，容错 loader）
- `packages/agent-core/src/kairos/config/prompt-assembler.ts`（新增，[3]段 拼接 + 二分截断）
- `packages/agent-core/src/kairos/guard/extract-paths.ts`（新增）
- `packages/agent-core/src/kairos/guard/blocklist-check.ts`（新增，零依赖 globToRegex）
- `packages/agent-core/src/kairos/tools/sleep.ts`（新增，Kairos 专属工具）
- `packages/agent-core/src/kairos/tools/index.ts`（新增，registerKairosTools 入口）
- `packages/agent-core/src/kairos/config/test/{schema,loader,prompt-assembler}.test.ts`（新增 17 单测）
- `packages/agent-core/src/kairos/guard/test/{extract-paths,blocklist-check}.test.ts`（新增 12 单测）
- `packages/agent-core/src/kairos/tools/test/sleep.test.ts`（新增 4 单测）
- `packages/agent-core/src/tools/test/scheduler-caller-agent.test.ts`（新增 6 单测）
- `docs/design-docs/agent-kairos-autonomous-mode.md`（顶部 plan 完成清单更新）

### ✅ 验证结果

- `pnpm --filter @actspace/agent-core typecheck` ✅
- `pnpm --filter @actspace/agent-core test` ✅ **302/302 passed**（新增 39 测试覆盖 schema/loader/prompt-assembler/extract-paths/blocklist/sleep/scheduler-caller-agent；旧 263 全部保留）
- `pnpm typecheck`（整仓） ✅ shared / agent-core / desktop 全过
- `ReadLints` ✅ 关键文件无错
