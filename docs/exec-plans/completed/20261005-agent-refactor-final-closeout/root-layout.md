# 根目录处置表

状态：2026-10-05 已按批准方案实施；路径与保护例外见本轮执行摘要。对应[最终收尾计划](README.md) T2。所有移动同步当前消费者；histories/learnings 不改，必要时保留短回溯入口。

根目录精简是明确目标：同用途目录合并，不通过搬到另一处归档来保留可再生成的垃圾。`artifacts/` 统一容纳项目管理的可再生成产物，整体 Git 忽略；`tmp/` 只保存临时工作和参考材料。工具内部的 dist/node_modules 等仍遵循工具约定。

## 最终结构

```text
actspace-agent/
  apps/{desktop,cli,site}/        产品入口
  packages/                      独立职责模块，保留现有公开包身份
    runtime/src/{startup,session,harness,profiles,projection}/
    agent-host/  agent-service/  client/  desktop-app/  headless/
    boot/  bundle/  composition/  harness-control/  cordis-adapter/
    core/{agent,agent-loop,scope}/
    session/{storage,jsonl,persistence,journal,checkpoint-policy,projection,projection-cache}/
    llm/{service,pi-ai}/  prompt/  context/  compaction/
    tools/  subagent/  english-learning/  shared/  util/  diagnostics/  test-support/
  browser-bridge/                Go CLI、Extension 和协议
  scripts/                      正式构建、检查、生成、发布入口
    diagnostics/                人工诊断工具
    experiments/terminal-native-spike/
    acceptance/agent-refactor/   可复建实机验收环境
    test/fixtures/              自动化测试 fixture
  docs/                         规范、计划、证据、历史与参考材料
  artifacts/                    忽略：包、矩阵 JSON、图片、Rust 生成产物
  tmp/                          忽略：临时工作与参考仓库
  logs/  dist/  node_modules/    忽略：工具默认输出/依赖
  README.md、协作/法律/设计入口与必要工具配置
```

图列职责，不强制创建未被使用的空目录；packages 的完整成员以范围清单为准。根目录不再保留 output、target、undefined、空 logo-design、散落待办和讨论稿；隐藏工具目录遵从下表。可复建验收脚本归 scripts，运行日志/证书/用户目录不进入 scripts。

## 保留的正式入口

| 路径 | 决定与理由 |
| --- | --- |
| `apps/`、`packages/`、`browser-bridge/` | 保持产品入口、模块实现、Host 外部能力的明确边界；不为根目录数量而混合 |
| `docs/`、`scripts/` | 正式知识与维护工具；内部按职责收敛 |
| `README.md`、`AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CODEOWNERS`、`LICENSE`、`NOTICE` | 项目/协作/法律入口，保留；校准过时的模板说明 |
| `DESIGN.md` | 保留产品设计系统总纲；现有前端消费者明确，根目录作为设计入口合理，不额外复制一份 |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、三个根 tsconfig、`skills-lock.json` | 工具实际读取的项目配置，保留 |
| `.editorconfig`、`.env.example`、`.gitattributes`、`.gitignore`、`.markdownlint.json`、`netlify.toml` | 保留工具发现路径及部署入口，修正忽略范围；不读取真实 `.env` 内容 |
| `.github/`、`.githooks/`、`.agents/`、`.claude/`、`.git/` | 平台/工具入口保留，不搬动工具约定路径 |

## 散落文件与素材

| 当前路径 | 目标与动作 |
| --- | --- |
| `0829-todo.md` | 唯一根目录整理任务由本计划承接；完成后删除，不另造待办 |
| `TODO.md` | Bash 沙箱与命令前缀授权两项并入 `docs/TODOLIST.md` 的未来独立目标，之后删除根副本 |
| `test.md` | 已被现行归档规则替代的旧文档整理指令；核对引用后删除 |
| `myplan.md` | 原始内容原样移动到 `docs/references/harness-host-discussions/original-refactor-notes.md`，作为来源材料，非当前规范 |
| `view-dsh.md` | 原样移动到 `docs/references/harness-host-discussions/deepseek-architecture-notes.md`；所在目录 README 标明旧路径/时间背景与当前规范入口 |
| `pelican-bike.html` | 原先迁入 design-demos；2026-10-05 用户复审后明确要求删除，现已删除。原始 history 保留用于回溯 |
| `undefined/A-prompts.md` | 移到 `docs/references/visual-design/beaver-candidates.md`；删除空的 `undefined/` |
| `logo-design/` | 本次检查无文件，删除空目录；如有新加入的正式设计素材，归入 docs 对应专题，不能混入被忽略的产物 |
| `output/` | 当前无文件，删除目录；以后可再生成的图片等统一输出到 `artifacts/imagegen/`。同步实际生成入口，不保留第二个输出根目录 |

## 构建产物和本机临时内容

| 路径 | 决定与保护方式 |
| --- | --- |
| `artifacts/`（包括契约矩阵 JSON、agent-cli-managed、runtime-v2） | 整个目录加入 `/artifacts/` 忽略规则，现有已跟踪文件退出 Git，保留需要的本地生成文件。仅增加 ignore 不会取消已有跟踪，实施时必须一并处理；源码与生成脚本仍提交 |
| `artifacts/agent-contract-matrix.json` 的检查消费者 | JSON 为本地派生产物，不再要求仓库有已提交副本。调整 `scripts/contract-matrix/generate.mjs` 的 `--check`：检查提交的 Markdown 矩阵与源码一致，JSON 契约/确定性由测试覆盖；普通生成仍输出 JSON。验证 `.github/workflows/ci.yml` 在无 artifacts 的全新 checkout 下可通过 |
| `dist/`、`logs/`、`node_modules/`、`.pnpm-store/` | 保留工具正在使用的默认路径并忽略；不为了表面整洁引入构建/启动路径改造 |
| `tmp/` | 唯一人为临时工作与参考仓库目录；保留 deepseek-harness。ARCHITECTURE 说明不能由其导入生产源码 |
| `.tmp/go-cache/`、`.tmp/actspace-dmg-empty.*`、`.tmp/actspace-dmg-test.*`、`.tmp/plist-inspect.*` | 核对内容确为无活动占用的构建缓存/展开制品后删除，不搬到 retired 继续堆积。出现手写文件则先分离保护并登记，不能按整个 .tmp 一刀切 |
| `.tmp/clean-checkout.*`、`.agent-tmp/sandbox-runtime` | 保留独立 Git 元数据和未提交内容；核对非注册 worktree、无活动所有者后迁入 `tmp/reference-checkouts/<原目录名>/`；不删嵌套仓库。活动或路径绑定未解除的仓库原位登记，不能仅凭当前无进程就声称迁移安全 |
| `.tmp/abb-native-host.json`、`.tmp/abb-support/` | 检查本机 Native Messaging 注册和路径入链，保留仍被系统引用的入口；不改系统配置。未注册实验配置迁入 `tmp/browser-bridge-fixtures/` 并同步内部相对路径；不输出可能的凭据。该判断必须有所有者/注册证据，不能凭文件时间删除 |
| `.tmp/`、`.agent-tmp/` 的空壳 | 上述分类完成后删除空目录；如果有需原位保护项，登记具体路径和用途，不能整体打包转移 |
| `target/` | 已退役 Rust 构建留下的生成目录，删除，不再归档到 tmp。先核对无手写源文件/活动构建占用；若仍有需要保留的 Rust 构建入口，设置 `CARGO_TARGET_DIR` 指向 `artifacts/rust/` 并同步清理命令，避免重新生成根 target |
| `.DS_Store` | 忽略并移除根目录已有文件 |

此处“保留原位”是明确的数据/进程保护规则，不表示架构任务未完成。最终根目录每项必须有用途；不承诺把所有工具的隐藏目录强行归一。搬迁嵌套仓库前仅核对路径引用、Git 注册与进程占用，不输出凭据内容。

## scripts 内部组织

- `analyze-cache-audit.mjs`、`diagnose-duckcoding-cache.ts`、`diagnose-duckcoding-thinking.ts` 归入 `scripts/diagnostics/`，同步源码相对路径、使用说明与现行文档。诊断工具有独立用途，不能仅因 package scripts 不调用而删除。
- `terminal-native-spike/` 归入 `scripts/experiments/terminal-native-spike/`，保留复现实验的依赖说明，退出正式运行链。run/prepare/package 三个 mjs 的 repoRoot 从 `../..` 改为匹配新位置的 `../../..`，核对 spike.cjs 和 packagedApp 路径；按验证附件执行实际 native smoke。
- `create-project.sh` 退役：当前没有仓库调用，本机 code-harness-init 来自独立安装包，不指向本仓库。删除旧副本，更新现行模板文案；不运行会复制 .env/日志/产物的旧脚本，不增加 templates 子目录，不改系统已安装工具。
- 现有构建、发布、验收、生成和检查入口保持稳定；其内部辅助代码依实际引用聚合，不强制给每个脚本新建子目录。

## 检查与回退

逐项记录旧路径、新路径、内容哈希、现行引用修正和验证结果。根配置保持原位；脚本移动检查导入和 repoRoot 解析；制品重建验证 tar 内容与入口；文档链接运行 `pnpm check:docs` 并比较保护区新增断链。确认 `git ls-files artifacts` 为空、artifacts 新文件被忽略、根 output/target 消失、正常生成不重新创建它们。迁移失败按路径映射恢复该项，不能用全仓 reset。最终不新增根级杂项文档，本表随计划留在 docs 内。
