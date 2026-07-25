# Agent 评估设计

## 用户诉求

设计完整的 ActSpace Agent 评估模块，让 Agent 优化可以通过可运行数据集衡量，而不是依赖主观感觉。设计需要覆盖 Docker-first 评估、Agent CLI 边界、`yolo` 权限模式、artifacts、graders，以及独立的 `actspace-agent-eval` 项目。

## 变更

- 新增 `docs/design-docs/evaluation/agent-evaluation.md`，作为 Agent 评估的长期设计事实来源。
- 在 `docs/design-docs/agent-index.md` 中增加评估设计入口。
- 新增 `docs/exec-plans/active/20260708-agent-evaluation/README.md`，作为从设计文档拆出的分阶段实施计划。
- 在 `docs/exec-plans/README.md` 中增加 active execution plan 入口。
- 使用现有 harness template 初始化外部 `actspace-agent-eval` side-project。
- 将 ActSpace 评估设计复制到 `actspace-agent-eval/docs/design-docs/actspace-agent-evaluation.md`。
- 将设计文档、执行计划和 history 统一改为中文叙述。

## 设计说明

- 评估与普通模块测试、桌面端 UI 验证分离。
- `actspace-agent` CLI 是评估使用的黑盒边界。
- `--out` 是显式开关：普通 CLI 或桌面端运行不应写 eval artifacts，除非调用方明确传入输出目录。
- Docker 是真实 coding eval 的默认环境，因为它能隔离 bash、文件编辑、依赖安装和删除操作。
- `yolo` mode 在隔离 eval 环境中自动批准 workspace-local 操作，但不能绕过 workspace、secret 或 network 硬边界。
- 外部 eval 项目负责 datasets、fixture projects、Docker 编排、graders、reports 和 baseline comparison。

## 影响文件

- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/design-docs/agent-index.md`
- `docs/exec-plans/active/20260708-agent-evaluation/README.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-07/20260708-0000-agent-evaluation-design.md`
- External side-project: `actspace-agent-eval/docs/design-docs/actspace-agent-evaluation.md`
