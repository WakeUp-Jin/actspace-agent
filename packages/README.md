---
description: "ActSpace 的包工作区：packages/ 下按能力分目录，每个目录放哪些包、谁依赖谁。"
kind: "package-map"
---

# ActSpace packages

`packages/` 只有两级：`packages/<能力>/<包>`。找功能先看下面的能力目录表，再打开该目录的 README 看包表和连接关系。产品入口在 `apps/{desktop,cli,site,web}`，不在这里。

## 1. 组织规则

- **两级结构。** 不管一个能力有一个包还是十个包，都放在 `packages/<能力>/<包>`，例如 `packages/shell/tool-shell`。`pnpm-workspace.yaml` 只有 `packages/*/*`。
- **目录名就是包名去掉 `@actspace/`。** 看到 `@actspace/tool-fs-read` 就能找到 `packages/fs/tool-fs-read`，反过来也一样。`pnpm check:packages` 会检查。
- **命名约定。**

  | 角色 | 命名 | 例子 |
  | --- | --- | --- |
  | 接口（定义一项能力的约定） | `<能力>` | `sandbox`、`approval`、`background-tasks` |
  | 实现（某个接口的具体后端） | `<能力>-<实现>` | `sandbox-seatbelt`、`session-persistence-jsonl`、`llm-pi-ai` |
  | 模型工具（给模型调用的工具） | `tool-<名>` | `tool-fs-read`、`tool-shell`、`tool-browser` |
  | 其他 | 直接说它是什么 | `agent-loop`、`context-disclosure`、`harness-hmr` |

- **归属规则。** `context/` 只管“东西怎么进入模型的上下文”，东西本身住在自己的能力目录里：后台 Bash 任务的登记在 `background-tasks/`，把它的状态告诉模型的 `context-background-tasks` 在 `context/`；子智能体在 `subagent/`，告诉模型谁在跑的 `context-subagents` 也在 `context/`；Skill 的发现与注册在 `skill/`，把 Skill 目录告诉模型的 `context-skills` 在 `context/`；上下文压缩改的是上下文本身，所以 `context-compaction` 留在 `context/`。
- **插件分两类。** 全局插件在 ActSpace 启动时由 Host 加载一份；会话插件在每个会话的 Harness 里各加载一份。底座（会话存储、Agent 注册表、运行时）也是全局插件，只是不能关。能关的只有操控浏览器（`browser-tools`）和英语学习（`english-learning`），默认都关，在 扩展 › 插件 里开启，重启后生效。
- **加载清单只有一份。** `core/runtime/src/plugin-catalog.ts` 的 `PLUGIN_CATALOG`：每个插件一行（Entry id、manifest、加载入口 `module`、`loaders`、可选 `codec`）。`core/runtime/cordis.yml`（Host 加载表）、默认 Harness 条目和打包输入都从它生成或计算，不要手改，也不要另列加载表。每个插件的中文名称、说明、默认开关写在它自己的 manifest `display` 里。
- **库和“不在默认组合”。** 不在清单里的包是库：被别的包引用，自己不作为插件加载。带 `src/plugin.ts` 却不在默认组合里的包，登记在同文件的 `PLUGIN_PACKAGES_OUTSIDE_DEFAULT`，并写明原因。

## 2. 能力目录

“类别”：**全局**是 Host 启动时加载的插件，**会话**是每个会话的 Harness 里加载的插件，**库**是被别的包引用、自己不作为插件加载的包。一个目录里可以有几类。每个目录的 README 是该能力的权威包表。

| 目录 | 职责 | 包数 | 类别 |
| --- | --- | --- | --- |
| [`core/`](core/README.md) | Agent 身份与注册表、Agent 循环、任务调度、工具运行时，以及总装配 `runtime` | 6 | 全局、会话、库 |
| [`session/`](session/README.md) | 会话日志、持久化、物理存储、视图、检查点和会话记录 Markdown | 8 | 全局、库 |
| [`llm/`](llm/README.md) | 模型服务契约和提供商适配 | 2 | 全局、库 |
| [`context/`](context/README.md) | 每一轮发给模型的上下文：引擎、提示词、各个来源、披露与压缩 | 12 | 会话 |
| [`fs/`](fs/README.md) | 读、搜索、写工作区文件的工具 | 3 | 会话 |
| [`shell/`](shell/README.md) | 命令行（Bash）工具与随包 Python 运行时 | 2 | 会话、库 |
| [`web/`](web/README.md) | 网页搜索与读取工具 | 1 | 会话 |
| [`image/`](image/README.md) | 生成图片、看图片的工具 | 2 | 会话 |
| [`todo/`](todo/README.md) | 待办工具与待办视图 | 1 | 全局、会话 |
| [`background-tasks/`](background-tasks/README.md) | 后台 Bash 任务登记表与任务工具 | 2 | 会话、库 |
| [`subagent/`](subagent/README.md) | 子智能体管理器、子智能体工具，以及用本机 Codex / Claude Code 跑子任务 | 4 | 会话、库 |
| [`sandbox/`](sandbox/README.md) | 命令沙箱：策略与后端 | 3 | 会话 |
| [`approval/`](approval/README.md) | 危险操作的人工审批与模型自动审批 | 2 | 会话 |
| [`harness-evolution/`](harness-evolution/README.md) | Harness 的选择、热替换、评估、运行时统计与插件开发 | 5 | 会话、库 |
| [`composition/`](composition/README.md) | 插件 ABI、组合描述、解析与启动装配 | 4 | 库 |
| [`host/`](host/README.md) | 三种宿主形态：桌面、远程、命令行 | 3 | 全局 |
| [`client/`](client/README.md) | 固定界面用的 IPC 与投影契约 | 1 | 库 |
| [`side-chat/`](side-chat/README.md) | 侧边对话 | 1 | 全局 |
| [`browser/`](browser/README.md) | 操控浏览器的工具（默认关） | 1 | 会话 |
| [`english-learning/`](english-learning/README.md) | 英语学习（默认关） | 1 | 全局 |
| [`skill/`](skill/README.md) | Skill 的发现、注册和官方 Skill | 2 | 库 |
| [`util/`](util/README.md) | 跨包共享的契约、工具和诊断 | 3 | 库 |
| [`test-support/`](test-support/README.md) | 测试辅助 | 1 | 库 |

## 3. 依赖方向

下面按各包 `package.json` 的生产依赖核对，不是示意图。

```
util/shared  composition/cordis-adapter        最底层：不依赖其他 @actspace 包
      ↑                ↑
      │        composition/{bundle,composition,boot} · util/diagnostics
      │                ↑
      └── 各能力目录的包 ── 依赖 core 的基础包（agent、scope、tool-runtime）
                          和别的能力的接口包
                           ↑
      core/runtime · host/* · harness-evolution/harness-control      装配层
                           ↑
                        apps/*                                      不被任何包依赖
```

- **只通过 `cordis-adapter` 接触 Cordis。** 领域包不直接依赖 Cordis。
- **目录层面不是严格分层。** 例如 `composition/boot` 依赖 `core/scope`，`core/agent` 依赖 `core/tool-runtime` 和 `session/session-persistence`。能保证的是包之间没有环，以及上面几条规则。
- **能力之间只依赖接口包。** 例如 `tool-shell` 生产依赖 `sandbox`，不依赖 `sandbox-nono` 或 `sandbox-seatbelt`；它们只在测试里（`devDependencies`）出现。实现包（`sandbox-nono`、`sandbox-seatbelt`、`llm-pi-ai`、`session-persistence-jsonl`）的生产依赖只出现在装配层：`core/runtime`、`host/agent-host`、`harness-evolution/harness-control`，另有 `subagent` 用 JSONL 创建子会话。
- **`core/runtime` 是总装配点。** 它在 `package.json` 里依赖几乎所有插件包（打包默认 Harness 要解析它们），但“加载哪些插件”只在 `plugin-catalog.ts` 里定义。
- **`host/*` 在能力之上。** 没有能力包依赖 `host/*`；只有 `core/runtime` 依赖三个宿主包。
- **`apps/*` 不被包依赖。** 可复用包依赖应用会被 `check:packages` 拒绝，应用之间也不能互相依赖。
- **`test-support` 只进测试。** 生产代码不依赖它。
- 包之间不能成环，`check:packages` 会检查。依赖只走公开 exports，不能深导入别的包的 `src`。

## 4. 新增一个插件

1. **选目录。** 放进已有能力目录；没有合适的就新建目录，写好 `README.md`（`kind: "package-group"`），并在上面的表里加一行。
2. **建包。** 目录 `packages/<能力>/<包>`，目录名等于包名去掉 `@actspace/`。包里要有 `src/manifest.ts`（含中文 `display`）、`src/plugin.ts`、生命周期测试（`lifecycle.test.ts`），`package.json` 的 `exports` 含 `.`、`./manifest`、`./plugin`；有 Codec 的再加 `./codec`。
3. **登记。** 在 `core/runtime/src/plugin-catalog.ts` 的 `PLUGIN_CATALOG` 加一行（顺序就是加载顺序）；把新包加到 `core/runtime/package.json` 的依赖和 `core/runtime/tsconfig.build.json` 的 `references` 里（打包默认 Harness 要解析它）；把它的 `manifest.ts` 和 `package.json` 路径加进 `scripts/contract-matrix/source-registry.mjs` 的 `MANIFEST_PATHS`、`PACKAGE_PATHS`。会话插件如果要进 Host 的基础组合（Host 要准入它的 manifest），清单行加 `admitOnHost: true`，和同类插件保持一致。带 `plugin.ts` 但不进默认组合的包，改登记到 `PLUGIN_PACKAGES_OUTSIDE_DEFAULT` 并写明原因。
4. **生成。** 运行 `pnpm --filter @actspace/runtime build && pnpm generate:plugin-loader && pnpm gen:contract-matrix`，由清单生成 `core/runtime/cordis.yml`，并更新[契约矩阵](../docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md)。
5. **写进 README。** 在所在能力目录 README 的包表里加一行；包表的类别和默认开关必须与清单一致。

想让用户能关这个插件，还要把 `display.canDisable` 设为 `true` 并处理关闭时的行为，见[插件结构设计](../docs/design-docs/架构优化/02-插件结构设计.md)第 7 节。

## 5. 检查

```sh
pnpm check:packages       # 目录结构、包名、依赖环、插件清单与 cordis.yml
pnpm check:docs           # 包含 check-package-readmes：README 与目录、清单一致
pnpm test:package-readmes # README 检查脚本自己的测试
```

`check-package-readmes` 检查：每个能力目录有 README 且 frontmatter 有 `description` 和 `kind`；每个包都在所在目录 README 的包表里，包表里没有不存在的包；每个目录都在上面的能力目录表里、包数一致；包表的类别和默认开关与插件清单一致；`packages/` 下没有第一级包。类别核对读 `@actspace/runtime` 的构建产物，所以先 `pnpm --filter @actspace/runtime build`；没有构建产物时只检查结构。

## 6. 其他

Browser Bridge（Go 程序和 Chrome 扩展）位于仓库根目录 `browser-bridge/`，是 Host capability，不属于 TS 插件装载树。

实际的包、插件与服务清单见[生成矩阵](../docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md)；全仓目录入口见[架构总览](../docs/ARCHITECTURE.md)。
