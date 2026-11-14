# 计划执行记录

这个目录放夜间模式执行 execution plan 时产生的文档。交互模式不在这里建目录：人全程在场，进度和决定记在计划里，要人验证什么写在 PR 描述和 history 里。

目录只在计划执行期间存在。人看过执行摘要、计划收尾时，它随计划一起删除（步骤见 `docs/PLANS_GUIDE.md`「计划完成时」），需要时查 git 历史。

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

子文件夹与 `docs/exec-plans/active/` 里的计划文件同名。比如计划文件是 `add-auth-module.md`，对应的执行记录目录就是 `docs/exec-runs/add-auth-module/`。

执行期间要入库的中间产物也放在这个子文件夹里，比如 `pnpm refactor:stats` 生成的重构前后统计；这种情况下交互模式的计划也可以有目录，同样随计划删除。规则调整前已经建了目录的交互模式计划，沿用到计划完成。

## 两份文档的用途

### 执行过程（execution-process.md）

Agent 在执行计划的过程中持续更新的时间线记录。包含关键步骤、关键决定、遇到的问题和应对方式，以及所有本来需要审批的操作。

**什么时候写**：执行开始时创建，每完成一个关键步骤就更新一次，执行结束后收尾。

**写给谁看**：人回来之后复盘用。让人快速了解 Agent 的执行链路——做了什么、为什么这么做、跳过了什么。

### 执行摘要（execution-summary.md）

Agent 在执行完成后填写的验收文档。最核心的部分是**人工验证指引**——告诉人接下来要验证什么、怎么验证，要具体到可以直接按步骤做。

**什么时候写**：执行结束后填写。如果执行中途失败，也要填写（标注失败原因和恢复建议）。

**写给谁看**：接手验收的人。目标是让人打开这份文档就知道该做什么，不需要翻执行过程或聊天记录。

夜间模式的启动方式和 nono 沙箱配置，参见 `docs/nono-profiles/README.md`。

## Agent 使用流程

1. **执行开始时**：在 `docs/exec-runs/<plan-slug>/` 下创建两份文档，从 `templates/` 复制模板。
2. **执行过程中**：每完成一个关键步骤，更新 `execution-process.md`。
3. **执行结束后**：补全 `execution-summary.md`，重点写人工验证指引。计划和这个目录先留着，等人来看。
4. **如果中途失败**：在摘要里标注失败原因、已完成的部分、恢复建议。
5. **人看过之后**：没验证的范围和遗留写进 history，需要后续处理的登记到 `docs/exec-plans/tech-debt-tracker.md`，然后删除计划和这个目录。

## 截图与图片留存

`docs/exec-runs/` 下的 PNG、JPG/JPEG、WebP、GIF、SVG、AVIF 图片及 MOV、MP4、WebM、M4V 录像是本地过程产物，由根 `.gitignore` 忽略，不随执行记录提交。截图和录像可以存放在各计划的 `screenshots/` 等本地子目录；验收点、操作步骤、结果、环境与未覆盖范围仍须写入受版本管理的 Markdown。

文档里提到本地截图时，写成纯文本路径并注明“原图未入库”，不要写成 Markdown 图片或链接——新克隆和 CI 里没有这些文件。需要长期共享的关键图片另存到团队可访问的附件或制品存储，并在验收记录里保留稳定链接、对应版本及说明。
