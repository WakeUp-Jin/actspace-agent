## 2026-09-16 10:00 | Task: 消息流排版设计与实施计划

### Execution Context
- Agent: Codex / root
- Model: GPT-6
- Runtime: Codex desktop

### 用户诉求
将认可的 demo 整理为正式设计规范与执行计划，先审阅再实施。

### 改动与动机
- 新增消息流排版规范，明确文字基线、间距所有权、工具摘要层级和完整详情保留。
- 写明 demo 与产品差异：Read 的文件打开行为、Thinking 箭头、Bash 环境提示和真实状态不直接照搬样例。
- 新增待审阅计划，分排版与摘要两个独立切片，列出文件范围、测试命令、浏览器/Electron 验收与局部回退。
- 更新前端入口、中间消息区关联入口和 active 计划索引。
- 仅改文档，未实施产品代码、未改 demo、未提交。

### 文件
- `docs/design-docs/frontend/front-tool-stream-typography.md`
- `docs/exec-plans/completed/20260916-tool-stream-typography.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/exec-plans/README.md`

### 验证
- `pnpm check:docs` 通过。
- 新设计与计划的相对链接存在性检查通过。
- 本轮仅沉淀已有设计决策，不新增独立学习文档；产品实现与视觉验收尚未开始。

### 用户批准后的产品实施（2026-09-16）
- 用户要求“开始执行”，按已批准的两个切片完成产品代码。
- 消息容器统一过程/正文间距；Thinking、Read 两分支、Bash、文件变更标题统一基线。
- 动作、目标与元数据分层；Bash 主行缩短，完整诊断与常规沙盒信息保留在详情；未执行不呈现遗留成功输出。
- 保留 Worked、审批、文件打开、生成进度、按需加载与现有分页；shared 仅补已有 intent 透传，不改持久协议。
- 增加真实组件验收 fixture 与行为回归，更新已有测试的可访问文本查询；同步设计和工具契约，归档计划。
- 定向 107 项、shared 76 项、类型检查、构建和主题检查通过；全量存在范围外失败，详见[执行摘要](../../exec-runs/20260916-tool-stream-typography/execution-summary.md)。未提交或推送。
- 满足可迁移、有陷阱、有模式三个学习条件，记录[消息流间距责任](../../learnings/2026-09/20260916-message-flow-spacing.md)。
