# 官网博客搬运与功能文档整理

状态：已完成，2026-09-19。新增 4 篇博客及配图，整理 27 页功能文档；验证与人工补图边界见 [执行摘要](../../exec-runs/20260919-site-content-migration/execution-summary.md)。

## 目标

将 Practical 项目中与 ActSpace 工程相关的文章搬入官网，保持作者原文；根据当前 ActSpace docs 与实现重写面向用户的模块/功能文档。网站视觉沿用 apps/site/DESIGN.md。

## 博客盘点与建议范围

Practical 根目录指同级 `Practical-Guide-to-Context-Engineering` 仓库。

已在官网的 5 篇，核对后正文相同，差别为标题移入 frontmatter、图片/链接路径与行尾空白，不重复新增：

| Practical 源路径（相对 docs） | 现有官网 slug |
|---|---|
| Agent运行空间/给Agent接入Browser use的设计思路.md | browser-use-integration |
| Agent形态/多智能体的协作方式-Agent Team和Agent Room.md | agent-team-and-agent-room |
| 工具管理模块/Agent Bash 工具工程化：后台运行与沙盒权限设计.md | bash-background-and-sandbox |
| 工具管理模块/为你的Agent集成Skill系统.md | agent-skill-system |
| LLM模块/学习和整理PI的LLM模块.md | pi-llm-runtime-design |

建议新增 4 篇，与 ActSpace 文件、Bash 和审批模块直接相关，但属于工程研究文章，不作为现行产品说明：

| Practical 源路径（相对 docs） | 建议官网 slug |
|---|---|
| 工具管理模块/Bash工具实现和安全权限设计细节.md | bash-tool-design |
| 工具管理模块/Agent文件系统检索核心：Grep和Glob工具.md | grep-and-glob |
| 工具管理模块/Write和Edit工具的实现细节.md | write-and-edit |
| 工具管理模块/工具调度与权限模块的开发.md | tool-scheduling-and-permissions |

现有 Context 和评估文章不删除。本次不默认搬入通用概念、其他项目逆向文档、KAIROS 文章或空稿。Team/Room 文章保留历史探索原文，不据此编写“已支持 Team/Room”的功能说明。

正文、代码、段落、用词、引用和图片不改写。仅添加网站必需 frontmatter、适配路径与标题呈现。发布日期优先使用来源中已有记录和 Git 证据，无法确认不编造。保存来源与资源映射；对正文差异作可复核检查，图片比对内容哈希。源目录暂保留，避免 Practical 的现有目录和引用失效；删除来源需明确确认并处理引用。

## 官网文档目录（建议 7 组）

1. 开始使用：ActSpace 是什么、安装与启动、完成第一个任务。
2. 工作区与会话：工作区和 Git Worktree、会话管理与分支、Chat/Plan/Agent 与输入方式。
3. 模型与上下文：连接模型、模型用途与推理设置、上下文与压缩、Token/缓存/费用。
4. 工具与执行：文件读写和检索、Bash 与后台任务、权限与审批、联网搜索与网页读取、Browser Use、图片理解与生成。
5. 工作台：文件预览、代码审阅与 Git 操作、交互式终端。
6. 扩展：Skills、Subagent/Explore、英语辅助学习。
7. 设置与开发：设置和本地数据、常见问题、CLI、架构与贡献。

沿用已有页面 slug，新增页面采用描述性 slug。首页正文作为用户入口，不把 Runtime 内部术语当作新用户第一课。侧栏与 schema 分组同步调整，正文页间交叉链接一致。

每页按用途选择“解决什么问题、从哪里打开、操作步骤、结果/状态、限制与常见问题”；没有证据的内容不为了凑模板填充。

## 事实来源与边界

入口为 docs/README.md、docs/ARCHITECTURE.md、README.md；按模块阅读当前 design-docs、对应 execution-summary 和公开实现。

- 工作台：frontend 的会话栏、Composer、Workspace/Worktree、文件面板、终端规范。
- 模型：model-context 多供应商、模型目录、上下文与 usage；设置中心现行规范。
- 工具：tool-system、execution-safety、browser 专题。
- 审阅：core-review-change-sources 与 large-diff。
- 扩展：Skills、collaboration/subagent、english-learning。
- 开发：agent-plugin-runtime、CLI 当前入口与启动命令。

归档、roadmap 未完成项和未验收能力不能写成已交付。已发现旧官网把记忆作为当前存储对象、把 allowlist 当成现行审批机制，需要重写；当前 Browser Bridge 的真实 Chrome 验收边界也要准确说明。

## 实施与验证

确认后建立 exec-runs 记录，先搬运博客和资产，再分组编写功能文档并同步导航。新增内容来源索引，记录官网页对应的内部事实文件，供后续维护。

末尾统一运行站点测试、Astro check/build、check:docs；检查源文一致性、图片/内部链接、分类展示和目录。浏览器作一次最终抽查，不逐篇反复验证。

不提交、不推送、不部署。保留此前网站未提交的设计改动。完成后写 history，并将计划移入 completed。
