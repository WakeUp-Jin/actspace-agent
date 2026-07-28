# 设计文档索引

`docs/design-docs/` 集中管理长期架构设计、产品设计和重要设计决策。目录采用“根层入口或独立文档 + 一级强关联专题目录”的结构。

## 目录硬约束

- `docs/design-docs/` 下面最多只允许一层专题目录。
- 专题目录里面只能直接放文件，禁止继续创建 `assets/`、`public/`、`mockups/`、`runtime/` 等子目录。
- 只有强关联、需要一起阅读和维护的文档才进入同一专题目录。
- 跨专题入口、基础原则和无法形成稳定专题的独立设计继续放在根层。
- 专题目录已经表达归属，现阶段仍保留 `agent-`、`front-`、`lab-` 文件名前缀，避免目录迁移与全面重命名同时发生。
- HTML prototype 和 PNG 设计图直接放在所属专题目录，通过文件名表达用途。

新增专题目录前应先确认：至少有两份长期强关联文档，并且把它们放在一起能明显降低查找成本。否则不要为了分类而创建空目录或单文件目录。

## 根层入口

- `core-beliefs.md`：Agent-first 的工作原则和模板设计出发点。
- `core-storage-and-observability.md`：本地存储、workspace root 和可观测性边界。
- `core-review-change-sources.md`：Review 变更来源与 Git-first baseline。
- `agent-index.md`：Agent Runtime 和全部 Agent 专题的总入口。
- `agent-plugins-fs-watch.md`：独立 fs-watch 插件设计；当前没有其他同级插件设计与它形成稳定专题。
- `website-introduction-site-design.md`：`packages/site` 官网、公开文档、博客、更新页、视觉系统和静态部署的长期设计规范。

## 一级专题目录

| 目录 | 内容边界 | 入口或代表文档 |
|---|---|---|
| `agent-runtime/` | Agent 主运行时、Turn 分层、当前模块和内部测试 | `docs/design-docs/agent-runtime/agent-backend-design.md` |
| `model-context/` | 模型供应商、模型能力、远端/本地模型目录、token、上下文压缩和缓存审计 | `docs/design-docs/model-context/agent-multi-provider-llm.md`、`docs/design-docs/model-context/agent-duckcoding-multi-key-model-catalog.md` |
| `tool-system/` | Skill、Web/图片生成工具、工具预览和受控子进程 | `docs/design-docs/tool-system/agent-skill-loading.md` |
| `execution-safety/` | 工具权限、审批暂停恢复、Bash 策略和执行模型 | `docs/design-docs/execution-safety/agent-权限设计规则和原则.md` |
| `browser/` | Browser Bridge、ActSpace 集成和 canonical command | `docs/design-docs/browser/agent-browser-use-index.md` |
| `collaboration/` | Member、Subagent、Explore、Room 和 Team | `docs/design-docs/collaboration/agent-members.md` |
| `kairos/` | Kairos Runtime、Prompt、通知、监控页与通知原型 | `docs/design-docs/kairos/agent-kairos-autonomous-mode.md` |
| `evaluation/` | Agent 评估架构和失败回归 Candidate | `docs/design-docs/evaluation/agent-evaluation.md` |
| `frontend/` | 桌面端视觉、主题、组件、工作台、页面和前端原型 | `README.md` |
| `lab/` | Lab 产品、页面、Runtime、版本路线、Rust CLI 和原型 | `README.md` |

## 推荐阅读路线

### Agent Runtime

1. `agent-index.md`
2. `agent-runtime/agent-backend-design.md`
3. `agent-runtime/agent-turn-layers.md`
4. 根据任务进入 `model-context/`、`tool-system/`、`execution-safety/`、`browser/`、`collaboration/`、`kairos/` 或 `evaluation/`

### 前端

1. `frontend/README.md`
2. `frontend/front-全局视觉语言规范.md`
3. `frontend/front-主题与配色规范.md`
4. 再进入具体工作台区域、组件或页面规范

### Lab

1. `lab/README.md`
2. `lab/lab-product-design.md`
3. `lab/lab-runtime-architecture.md`
4. `lab/lab-versions-index.md`

### 官网与公开内容

1. `website-introduction-site-design.md`
2. `docs/releases/README.md`
3. `docs/releases/feature-release-notes.md`

## 设计文档与其他资料的边界

- 设计文档回答为什么做、做成什么样和边界是什么。
- 实施步骤放在 `docs/exec-plans/`。
- 外部资料、调研底稿和历史快照放在 `docs/references/`。
- 当前实现变化需要同步设计文档，但不要把逐次实现流水账堆进长期设计入口。
- `docs/references/llm-agent-dev-skill-fixes/README.md` 是 Skill 修复分析归档，不作为主线架构事实来源。
