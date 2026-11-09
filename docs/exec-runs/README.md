# 计划执行记录

这个目录存放 execution plan 执行过程中产生的文档。每个 exec-plan 在执行时，都要在此创建一个同名子文件夹，包含两份文档。

## 目录结构

```
docs/exec-runs/
├── README.md
├── templates/
│   ├── execution-process.md      # 执行过程模板
│   └── execution-summary.md      # 执行摘要模板
└── <plan-slug>/                  # 每个计划一个子文件夹
    ├── execution-process.md
    └── execution-summary.md
```

子文件夹命名规则：与 `docs/exec-plans/active/` 或 `completed/` 里的计划文件 slug 一致。比如计划文件是 `add-auth-module.md`，对应的执行记录目录就是 `docs/exec-runs/add-auth-module/`。目录名与计划 slug 对不上时（一个计划目录拆成多个 run、纯验收轮次、计划已被合并改名），在 `execution-summary.md` 顶部第一行写明对应的计划路径。只剩被外部引用的证据文件、没有 `execution-summary.md` 的旧目录不要求补写摘要。

## 两份文档的用途

### 执行过程（execution-process.md）

Agent 在执行计划的过程中持续更新的时间线记录。包含关键步骤、关键决定、遇到的问题和应对方式。

**什么时候写**：执行开始时创建，每完成一个关键步骤就更新一次，执行结束后收尾。

**写给谁看**：事后复盘用。让人快速了解 Agent 的执行链路——做了什么、为什么这么做、跳过了什么。

### 执行摘要（execution-summary.md）

Agent 在执行完成后填写的验收文档。最核心的部分是**人工验证指引**——告诉人接下来要验证什么、怎么验证。

**什么时候写**：执行结束后填写。如果执行中途失败，也要填写（标注失败原因和恢复建议）。

**写给谁看**：接手验收的人。目标是让人打开这份文档就知道该做什么，不需要翻执行过程或聊天记录。

## 两种执行模式

### 交互模式

人在线，Agent 操作需逐步审批。适合：

- 架构变更、协议修改等高风险改动
- 探索性任务，方向还不确定
- 首次执行某类任务，需要观察 Agent 的行为

交互模式下，两份文档仍然要写，但可以相对简略——因为人全程参与，执行链路是可见的。

### 夜间模式

人离线，Agent 在 nono 沙箱内获得 full-access 自主执行。适合：

- 边界明确的实施任务（exec-plan 已经写清楚了范围和步骤）
- 重复性工作
- 低风险改动

夜间模式下，**这两份文档的重要性远高于交互模式**——它们是人了解执行全貌的唯一途径。要求：

- 执行过程文档必须记录所有关键操作，包括所有本来需要审批的操作
- 执行摘要的人工验证指引必须足够具体，让人可以直接按步骤验证

关于夜间模式的启动方式和 nono 沙箱配置，参见 `docs/nono-profiles/README.md`。

## Agent 使用流程

1. **执行开始时**：在 `docs/exec-runs/<plan-slug>/` 下创建两份文档，从 `templates/` 复制模板。
2. **执行过程中**：每完成一个关键步骤，更新 `execution-process.md`。
3. **执行结束后**：补全 `execution-summary.md`，重点写人工验证指引。
4. **如果中途失败**：在摘要里标注失败原因、已完成的部分、恢复建议。


## 完成后的精简

执行结束、`execution-summary.md` 写完后，该目录只保留两类文件：

- `execution-summary.md`（验收结论、未验证范围、人工验证指引）。
- 被 `docs/exec-runs/` 以外的文档、代码注释或脚本链接引用的文件（例如被设计文档、计划、学习文档链接的阶段摘要或验收矩阵）。

其余文件（`execution-process.md` 的流水、运行证据 JSON、`cu-observations.json`、`cleanup-ledger.tsv`、AX 文本、基准数据、一次性脚本等）在 git 历史里保留，不再留在工作树里。清理前先 `grep` 确认没有外部文档链接它。

保留下来的文件里，指向已清理文件、被忽略的截图或 `tmp/` 的链接要改成纯文本，例如 `screenshots/x.png`（原图未入库）或「（原始记录已清理，见 git 历史）」，保证新克隆下 `pnpm check:current-docs` 不报断链。

### 截图与图片留存

`docs/exec-runs/` 下的 PNG、JPG/JPEG、WebP、GIF、SVG、AVIF 图片及 MOV、MP4、WebM、M4V 录像是本地过程产物，由根 `.gitignore` 忽略，不随执行记录提交。截图和录像可以存放在各计划的 `screenshots/` 等本地子目录；验收点、操作步骤、结果、环境与未覆盖范围仍须写入受版本管理的 Markdown。

文档里提到本地截图时，写成纯文本路径并注明“原图未入库”，不要写成 Markdown 图片或链接——新克隆和 CI 里没有这些文件。需要长期共享的关键图片另存到团队可访问的附件或制品存储，并在验收记录里保留稳定链接、对应版本及说明。
