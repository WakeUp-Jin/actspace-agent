# 插件结构 — 执行计划总览

状态：待执行（排在功能减法 P1–P5 之后）。

- 分支 / worktree：`架构优化` @ `../actspace-agent-arch-slim`，与[功能减法](../20261101-feature-subtraction/README.md)同一分支。
- 设计真源：[02 插件结构设计](../../../design-docs/架构优化/02-插件结构设计.md)；插件页视觉以 demo [plugins-page-demo.html](../../../design-docs/frontend/plugins-page-demo.html) 方案 B 为准。
- 执行记录：与功能减法共用 `docs/exec-runs/20261101-feature-subtraction/`，在执行过程里按子计划分节。
- 执行模式：连续执行。两步一起做完，只在遇到阻塞或需要用户决定的事时停下。

## 两步合起来的顺序

| 顺序 | 子计划 | 说明 |
|---|---|---|
| 1–5 | 功能减法 P1–P5 | 见[功能减法总览](../20261101-feature-subtraction/README.md)。先删，后面搬家时要搬的东西更少 |
| 6 | [S1 包搬家与改名](s1-package-move.md) | 64 个包按两级结构搬到新目录、改包名；新建 `tool-subagent`、`skill`。纯机械改动，行为不变 |
| 7 | [S2 插件清单与展示信息](s2-plugin-catalog.md) | manifest 加 `display`；唯一的插件清单；cordis.yml 改为生成；删掉五处重复登记 |
| 8 | [S3 插件开关与插件页](s3-plugin-page.md) | `tools.plugins` 设置；关闭时不加载；「能力」标签改为「插件」页。**取代功能减法 P6** |
| 9 | [S4 README 与文档](s4-readmes.md) | 总地图与 23 份能力目录 README；`check-package-readmes`；同步现行文档 |

S1 → S2 → S3 必须串行：S2 依赖新包名，S3 依赖插件清单。S4 可以和 S3 交错，但收尾检查要在 S3 之后跑。

为什么减法在前、搬家在后：P1–P5 主要改 `apps/desktop` 和 `packages/shared`，先删掉终端、可视化、Review 写操作，S1 要搬、要改引用的文件就少了。P6 的目标（浏览器和英语学习默认不加载）由 S3 用通用的插件开关实现，不再单独做一套 `tools.optionalCapabilities`。

## 全局约束

- 功能减法 README 的「全局约束」全部适用。
- **运行时标识不改**：Entry id、plugin id、service id、事件类型、Codec 名称保持原样（设计 §4.1）。
- 搬家（S1）的提交里只放搬家：不顺手改逻辑、不改格式，方便 review 时用 `git diff -M --stat` 一眼看清。
- 生成文件（`cordis.yml`、`agent-contract-matrix.generated.md`、桌面构建图）只用脚本生成，不手改。

## 统一验证命令

每个子计划收尾都跑：

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm check:packages
pnpm check:desktop-build-graph
pnpm check:ipc-channels
pnpm check:docs
pnpm check:current-docs
pnpm --filter @actspace/desktop build
```

`check:docs` / `check:current-docs` 的已知基线失败见功能减法 README（`docs/exec-runs/` 下 363 条），只看是否新增。

## 回滚

每个子计划一个提交。S1 回滚后要重新 `pnpm install`。S3 写进设置的 `tools.plugins` 对旧代码无害（规范化时被丢弃）。

## 进度

- [x] S1 包搬家与改名。
- [x] S2 插件清单与展示信息。
- [x] S3 插件开关与插件页（2026-11-02，未提交）。
- [x] S4 README 与文档（2026-11-02，未提交）。
- [ ] 收尾：两步一起跑全量检查、Electron 实机检查、执行摘要、history，两份设计文档状态改为“已实施”，两个计划移入 `completed/`。

## 决策记录

- 2026-11-01：用户确认第二步全部方向：只叫「插件」；DSH 式两级目录；目录名即包名；全局 / 会话两类；`display` 写在 manifest；唯一插件清单；本轮做插件页；`harness-evolution/`、`skill/` 两个目录；README 规范与检查。
- 2026-11-01：功能减法 P6 并入 S3，用通用插件开关取代 `tools.optionalCapabilities`。
- 2026-11-01：插件页选定 demo 方案 B（可关的在上，内置的折叠）。
- 2026-11-01：用户同意每个子计划（P1–P5、S1–S4）完成后在本分支本地提交一次，不推送。
- 2026-11-01：运行时标识不改，只改包名和目录，避免会话日志、Harness 代际记录和设置的数据迁移。
