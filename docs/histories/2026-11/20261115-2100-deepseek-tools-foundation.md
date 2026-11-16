## [2026-11-15 21:00] | Task: DeepSeek 深度搜索与文档解析 P0：共享契约与两个空插件

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 拉新分支和 worktree，按已写好的计划和设计规范执行 DeepSeek API 更新计划（深度搜索与文档解析）。审核时两项出入按计划定：Chat 里用独立的 `deep_search`；文档解析默认关。

### 🛠 Changes Overview

**Scope:** `@actspace/tool-runtime`、`@actspace/agent`（测试）、`@actspace/runtime`、`@actspace/cordis-adapter`、`@actspace/shared`、`@actspace/desktop`、新包 `@actspace/tool-deep-search`、`@actspace/tool-document`

**Key Actions:**

- **工具可见性判断**：`ToolExecutorRegistration.visible`，`listDefinitions()` 跳过不可见或判断抛错的工具，`capture()` 不受影响。
- **两个设置开关**：`deepseekDeepSearchEnabled`、`deepseekDocumentEnabled`，默认关，清洗只保留 `true`。
- **O(1) 可用性读取**：`SettingsStore` / `SettingsService` / `ModelRuntimeService` 的 `isDeepseekDeepSearchAvailable()`、`isDeepseekDocumentAvailable()`，以及 `getDeepseekApiKey()`；不取设置快照，有测试守住。
- **两个插件包**：`deep_search`、`read_document` 的定义、注册、权限契约（`read_document` 有自己的授权范围 `document-read`）、`path` / `artifact_id` 恰好一个的检查；Host 端口可选，没有时不注册。
- **登记**：插件清单、服务契约、默认 Harness 的可选共享服务、可选注入的回退说明、契约矩阵、桌面 build graph；跟着改枚举式测试和 mock 夹具。

### 🧠 Design Intent (Why)

两个工具是默认关的付费工具，摆在列表里模型会去调并白白失败；`read_document` 只有从列表里消失，模型才会走本机 Python。所以用登记上的可见性判断隐藏，而不是动态注册注销（会让已发出的调用找不到工具）。P0 先落 PA、PB 共用的部分，Host 还不给端口，用户侧只多「扩展 › 插件」里两行。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：没在真实 Electron 里看「扩展 › 插件」的两行，也没用旧数据目录确认未改动 Harness 的用户不出现重启提示；P0 完成标准里的这两项留到 PA 验收时一起做。
- **遗留**：PA（深度搜索）、PB（文档解析）未开始。

### 📁 Files Modified

- `packages/core/tool-runtime/src/registry.ts`
- `packages/web/tool-deep-search/`、`packages/document/tool-document/`
- `packages/core/runtime/src/plugin-catalog.ts`、`packages/core/runtime/src/harness/default-harness.ts`、`packages/core/runtime/src/harness/default-harness-definition.ts`
- `packages/composition/cordis-adapter/src/service-contract.ts`
- `packages/util/shared/src/settings.ts`
- `apps/desktop/src/main/settings/{store,service,migrations,defaults}.ts`、`apps/desktop/src/main/model-runtime-service.ts`、`apps/desktop/src/main/runtime-v2/model-port.ts`
