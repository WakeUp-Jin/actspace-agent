# actspace-agent

ActSpace 是一个本地优先的 Agent 工作台：桌面端（Electron）、Web / PWA 客户端和插件化的 Agent Runtime 都在这个仓库里。

`AGENTS.md` 故意保持简短，只负责做导航，不负责塞满所有规则。仓库内的 `docs/` 才是本地知识的正式来源，总导航是 `docs/README.md`。

如果一次代码或流程变更会让某份文档过期，就在同一轮任务里顺手把它改掉。

## 每轮开始先读

- `docs/REPO_COLLAB_GUIDE.md`：仓库级协作、提交、文档同步、测试约定和编码行为纪律。
- `docs/ARCHITECTURE.md`：仓库整体结构、依赖边界和架构专题导航。
- `packages/README.md`：`packages/` 的地图。改包、加插件前先读；每个能力目录有自己的 README，由 `pnpm check:docs` 校验。

## 做前端前必读

- `docs/design-docs/frontend/front-新功能开发清单.md`：**新增或改动前端功能前必读**。第 1 节是交付前的 UI 自检，其余是样式、组件、文件拆分、状态、IPC、安全、测试和验收规则，每条链到对应规范和检查命令。
- 清单之后读三份全局规范：`front-视觉token规范.md`（颜色、字号、圆角、主题硬约束）、`front-文案与状态表达规范.md`（说明文字、状态表达、空值写法）、`front-组件与交互模式规范.md`（按钮、弹层、设置行、表格、对标与 demo）。
- 再按 `docs/design-docs/frontend/README.md` 的路由表读对应区域规范；验收方式见 `docs/FRONTEND_VERIFICATION.md`。

## 代码改完前要读

- `docs/HISTORY_GUIDE.md`：什么时候记 history、怎么命名、怎么脱敏。

## 按任务需要选读

- `docs/PLANS_GUIDE.md`：什么时候要写 execution plan，怎么维护，两种执行模式。
- `docs/exec-runs/README.md`：执行计划时的过程记录和验收文档怎么写。
- `docs/design-docs/index.md`：设计文档唯一索引；后端、Runtime、工具、安全等设计从这里进入。
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`：v2 后端 Agent 测试策略、package lifecycle、Runtime 与 Host 覆盖边界。
- `docs/RELIABILITY.md`：运行稳定性、观测性和上线前的基本要求。
- `docs/SECURITY.md`：认证、数据处理、外部集成等安全默认约束。
- `docs/CICD.md`：CI/CD 与供应链安全。
- `docs/coding-standards/README.md`：编码规范和团队自定义约定。
- `docs/nono-profiles/README.md`：夜间模式的 nono 沙箱配置和启动方式。
- `CONTRIBUTING.md`：提 PR 前后的默认检查项和协作要求。
- `docs/releases/README.md`：如何维护面向用户的发布记录。
- `docs/references/README.md`：沉淀到仓库里的外部参考资料。

## 外部能力代码

- `browser-bridge/`：Browser Use / Browser Bridge 代码（Go CLI + Chrome Extension + 协议层），是顶层 Host capability，不属于通用 workspace `plugins/` 目录。操控浏览器（`browser-tools`）和英语学习（`english-learning`）默认不加载，用户在 扩展 › 插件 中开启后重启生效；开关存在 `settings.tools.plugins`，可关闭与否、默认值来自 `PLUGIN_CATALOG` 的 `display`。
- 旧 `plugins/fs-watch/`：已退役的历史路径；v2 不再加载或启动它。

## 阶段完成后的学习沉淀

只记「下次还会踩、读代码看不出来」的教训。动笔前先读 `docs/learnings/WRITING_GUIDE.md`，并在 `docs/learnings/README.md` 里搜同主题：已有同类就补进那一篇，不新建。不够格的在 history 里顺带提一句即可。

## 工作规则

- 优先选择小而清晰、对仓库和 Agent 都友好的抽象。
- prompt、规则、架构约束尽量都版本化落在仓库里。
- 复杂任务不要只靠聊天上下文，应该落 execution plan。
- 本地开发启动建议使用 `pnpm dev:log`，终端输出会同步写入根目录 `logs/`；排障时优先查看 `logs/latest-dev.log` 或最近 2 天的 `logs/dev-*.log`。
- 完成的代码变更要记到 `docs/histories/`。
