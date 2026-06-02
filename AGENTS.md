# actspace-agent

这个仓库是一个面向 Agent 协作开发的基础模板。

`AGENTS.md` 故意保持简短，只负责做导航，不负责塞满所有规则。仓库内的 `docs/` 才是本地知识的正式来源。

如果一次代码或流程变更会让某份文档过期，就在同一轮任务里顺手把它改掉。

## 每轮开始先读

- `docs/REPO_COLLAB_GUIDE.md`：仓库级协作、提交、文档同步与测试约定。
- `docs/ARCHITECTURE.md`：仓库整体结构、依赖边界和架构专题导航。
- `docs/design-docs/core-beliefs.md`：Agent-first 的工作原则和这个模板的设计出发点。

## 代码改完前要读

- `docs/HISTORY_GUIDE.md`：什么时候记 history、怎么命名、怎么脱敏。
- `docs/QUALITY_SCORE.md`：当前质量分层和主要短板。

## 按任务需要选读

- `docs/PLANS_GUIDE.md`：什么时候要写 execution plan，怎么维护。

- `docs/PRODUCT_SENSE.md`：产品价值、取舍方式和优先级判断。
- `docs/RELIABILITY.md`：运行稳定性、观测性和上线前的基本要求。

- `docs/SECURITY.md`：认证、数据处理、外部集成等安全默认约束。
- `docs/SUPPLY_CHAIN_SECURITY.md`：依赖、SBOM、制品 provenance 和仓库级供应链安全默认做法。

- `docs/CICD.md`：仓库的 CI/CD 骨架以及后续如何接入真实项目。

- `docs/FRONTEND.md`：前端协作入口、设计文档和验证规范导航。
- `docs/FRONTEND_VERIFICATION.md`：桌面端前端修改后的浏览器 mock、Electron 真实验证和 Computer Use 验收方式。
- `docs/design-docs/front-主题与配色规范.md`：**改任何带颜色的样式前必读**。三态主题机制 + 「颜色必须随主题翻转、禁止 `text-black`/`bg-white`/`#hex` 等非主题感知字面量」的硬约束，且要求浅/深双主题都验过。

- `docs/design-docs/index.md`：设计文档总索引；按 `agent-` / `front-` / `lab-` 等前缀进入对应专题。
- `docs/design-docs/agent-testing.md`：后端 Agent 测试策略、目录约定和覆盖范围。

- `docs/CODING_BEHAVIOR.md`：编码行为纪律——改代码时的操作级约束。
- `docs/coding-standards/README.md`：编码规范、Skill 推荐清单和团队自定义约定。

- `CONTRIBUTING.md`：提 PR 前后的默认检查项和协作要求。
- `docs/releases/README.md`：如何维护面向用户的发布记录。
- `docs/references/README.md`：沉淀到仓库里的外部参考资料。
- `docs/references/llm-agent-dev-skill-fixes/README.md`：`llm-agent-dev` Skill 修复分析归档；需要追溯历史修复方案时再读。

## 阶段完成后的学习沉淀

完成一轮代码变更后，检查本次变更是否**至少命中以下两条**：

- **新概念**：开发者之前没接触过或理解模糊的技术点。
- **可迁移**：这个知识在其他项目中也能复用。
- **有深度**：不是一句话能说清的，需要理解原理或权衡。
- **有陷阱**：容易踩坑、反直觉、或曾经踩过坑的点。
- **有模式**：代表一种可重复使用的设计模式或架构思路。

命中则读 `docs/learnings/WRITING_GUIDE.md`，按指南生成学习文档到 `docs/learnings/YYYY-MM/`。
未命中可在 history 中顺带提一句，不需要单独写学习文档。

## 工作规则

- 优先选择小而清晰、对仓库和 Agent 都友好的抽象。
- prompt、规则、架构约束尽量都版本化落在仓库里。
- 复杂任务不要只靠聊天上下文，应该落 execution plan。
- 本地开发启动建议使用 `pnpm dev:log`，终端输出会同步写入根目录 `logs/`；排障时优先查看 `logs/latest-dev.log` 或最近 2 天的 `logs/dev-*.log`。
- 完成的代码变更要记到 `docs/histories/`。
