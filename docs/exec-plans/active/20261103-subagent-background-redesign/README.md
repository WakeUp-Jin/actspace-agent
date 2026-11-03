# 子智能体与后台任务改造 — 执行计划总览

状态：待执行（2026-11-03 立项，等用户说开工）。

- 分支：`子智能体功能完善`，就在主工作区（用户明确要求，不另建 worktree）。
- 设计真源：[子智能体和后台任务设计规范](../../../design-docs/子智能体和后台任务设计规范/README.md)，[01 决策](../../../design-docs/子智能体和后台任务设计规范/01-设计决策.md)、[02 子智能体](../../../design-docs/子智能体和后台任务设计规范/02-子智能体设计规范.md)、[03 后台 Bash](../../../design-docs/子智能体和后台任务设计规范/03-后台Bash设计规范.md)、[04 外部子智能体](../../../design-docs/子智能体和后台任务设计规范/04-外部子智能体设计规范.md)、[05 界面与设置](../../../design-docs/子智能体和后台任务设计规范/05-界面与设置设计规范.md)。
- 执行记录：`docs/exec-runs/20261103-subagent-background-redesign/`（开工时从模板建 `execution-process.md`、`execution-summary.md`，按子计划分节）。
- 执行模式：交互模式下连续执行。全部子计划一次做完，只在遇到阻塞或需要用户决定的事时停下。
- 参考源码：`tmp/deepseek-harness/packages/subagent/`（`subagent`、`tool-subagent`、`tool-subagent-control`、`subagent-fork-in-process`、`subagent-codex`、`subagent-claude-code`）。

## 子计划与顺序

按真实依赖拆分，不按功能取子集；六份全部做完才算完成。

| 顺序 | 子计划 | 内容 | 依赖 |
|---|---|---|---|
| 1 | [S1 契约与留痕地基](s1-contracts-and-traces.md) | 新事件与编解码器、头部字段、收件箱来源、共享类型、`actspace.context.trace` 登记、transcript 增量重写、免审批读取、模型列表 Host 端口 | 无 |
| 2 | [S2 后台 Bash](s2-background-bash.md) | 日志进会话目录、删除时机、50MB 清理、`task_output since`、上限 5、通知带路径、沙箱临时目录清理；登记表只管 Bash | S1 |
| 3 | [S3 子智能体核心](s3-subagent-core.md) | `agent` + 预设、四个管理工具、`list_subagent_models`、默认异步、续派、插话、可写、不弹审批、继承权限、模型选择与设置迁移、上限 10、重启、通知、运行中清单；删除 `explore` 工具与 explore 用途 | S1、S2（「登记表只管 Bash」在 S3 删除子智能体对登记表的使用时一起做，见 S2 第 4 步） |
| 4 | [S4 Fork](s4-fork.md) | `agent_fork`、边界、复制、缓存一致 | S3 |
| 5 | [S5 外部子智能体](s5-external-backends.md) | Codex / Claude Code 两个可选插件 | S3 |
| 6 | [S6 界面、设置与文档](s6-frontend-and-docs.md) | 对话区、子 Agent 面板、后台任务面板、设置、插件页、轨迹、统计、Web、mock；现行文档改写 | S1 的共享类型；数据接入在 S3–S5 之后 |

S4、S5 互不依赖，可以并行。S6 的界面部分可以在 S1 之后用 mock 先做，接真实数据要等 S3–S5。

## 全局约束

- 模型可见的文字（工具描述、结果、通知、提示词）**逐字**照设计规范；要改先回设计规范改。
- 运行时标识：新事件类型 `subagent/spawned`、`subagent/activation`；`delegation/*` 与 `background/task` `kind: "agent"` 的编解码器保留、只读，不再写入；不做老会话转换。
- 不新增 npm 依赖（S5 直接起子进程）。
- 子智能体模块用 `packages/subagent/` 下现有两个包改造，外部后端新建两个包，都要有 manifest `display` 与 README（`check-package-readmes`）。
- 每个子计划一个提交，提交前跑该子计划的验证与下面的统一命令；只有用户要求时才 push / 开 PR（推送前设置代理）。
- 子智能体（Sonnet）可以执行子计划里的编写任务，主智能体逐个读 diff、复跑测试后才算完成。

## 统一验证命令

每个子计划收尾都跑：

```sh
pnpm typecheck
pnpm test
pnpm check:packages
pnpm check:desktop-build-graph
pnpm check:ipc-channels
pnpm check:docs
pnpm check:current-docs
pnpm --filter @actspace/desktop build
```

开工前先在当前分支跑一遍记下基线失败，之后只看是否新增。

## 风险

| 风险 | 缓解 |
|---|---|
| 续派要重新打开子会话、重新租 Run，和现有一次性路径差异大 | S3 先写「创建 → 结束 → 续派 → 再结束」与「插话竞态」的集成测试，再改实现 |
| 可写子智能体并行改同一文件 | 工具描述与子智能体提示词要求分开文件范围（设计 02 §2.1、§7）；不做文件锁 |
| 不弹审批导致子智能体常常失败 | 失败文字明确让它回报父会话；验收 A5 专门看 |
| fork 缓存一致依赖提示词来源完全相同 | S4 用测试比对首个请求与父请求的系统提示词、工具和消息前缀 |
| 外部 CLI 版本差异（字段名、路径编码） | S5 以本机 codex-cli 0.163.0、Claude Code 2.1.317 实测为准，解析失败给出明确错误 |
| 设置迁移删掉 explore 用途 | 迁移有测试；旧值不继承是用户已知的决定（设计 02 §3） |

## 回滚

每个子计划一个提交，可单独 revert。S1 的新事件对旧代码不可读：回滚 S1 之后，期间产生的新会话在旧代码里打不开带新事件的部分，所以 S1–S3 应一起回滚。设置迁移（S3）删掉的 explore 字段回滚后为空，旧代码按「未设置」处理。

## 进度

- [ ] 开工前基线检查。
- [ ] S1 契约与留痕地基。
- [ ] S2 后台 Bash。
- [ ] S3 子智能体核心。
- [ ] S4 Fork。
- [ ] S5 外部子智能体。
- [ ] S6 界面、设置与文档。
- [ ] 收尾：全量检查、Electron 实机检查交接、执行摘要；设计规范状态改为「已实施」，计划移入 `completed/`。

## 决策记录

- 2026-11-03：决策见设计 01；设计规范里新定的细节（子会话 Bash 不转后台、同步等 30 分钟转后台、旧 explore 模型不迁移、外部 CLI 不进 ActSpace 沙箱、`agent_codex` / `agent_claude_code` 工具名）随设计规范由用户审阅。
