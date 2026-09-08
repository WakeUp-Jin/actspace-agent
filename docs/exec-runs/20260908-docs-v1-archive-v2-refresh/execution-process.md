# Docs v1 归档与 v2 校准 — 执行过程

## 2026-09-08

- 用户批准：只归档 v1，v2 原位更新，保留精简的 Member/Room/Team 产品设计。
- 复核工作区：无已跟踪文件改动；无关未跟踪文件保持原样。
- 基线：1,219 个 docs 文件，现有文档门禁覆盖 29 个入口；文档检查与 3 项测试通过。相对链接初扫有 19 处候选断链，不能视为完整语义验收。
- 源码复核：CLI 仅有 run 业务命令；bootProfile 返回 BootedProfile，生产 bootProfileRuntime 返回 BootedRuntimeProfile；Session Format 仍为版本 1。

- 完成 50 个 v1 文件移动和 3 份协作完整稿快照；10 个迁移的 PNG/HTML 资产 SHA-256 与迁移前一致。
- 完成 10 个已实现计划入口到 completed、1 个无独立工作的重定向到 discarded；计划子文件计入逐文件映射后，本轮共移动 92 个文件，另存 3 个快照。
- 原位重写两份总体/Runtime 架构和插件组装规范，校准有效契约的启动/应用职责；v2 决策未搬移。
- 检查扩展到 40 份当前事实文档，并递归检查设计、归档、计划、执行记录的 Markdown 链接与 HTML 资产。新增退役 API、旧归档路径、未标识归档入口、深层断链和带空格/括号路径回归。
- 修复原先核心 Service 规范的计划断链；将 Profile-first 已删除的两条历史源码链接改为明确的历史路径文字，保留证据。
- 并行中文界面任务新增计划和代码改动：保留其内容，仅将该计划登记到共享索引。未操作产品代码或无关未跟踪文件。
- 文档检查、6 项文档测试、仓库卫生与 diff 空白检查通过。全 docs 扩展扫描仍有 16 个历史/学习候选断链，记录为既有债务，不修改其源码证据。

## 2026-09-09 后续复核

- 用户追加：核对 exec-plans 中真正完成的计划，并找出 design-docs 可清理、合并的文档。
- 复核剩余 10 个 active 入口，逐项追溯联合执行摘要和当前代码；完整清单见 [后续复核](followup-audit.md)。
- P2 原清单全勾选、旧摘要记录 G2 PASS，但当前 validator 只实现基础检查。只读负向探针显示 inject/provide 不一致、不存在的相对 sourceRef、无效 composition digest 未被拒绝，因此最终保留 active，补出原计划的剩余语义任务；没有新增计划归档。
- 原生成器产物落后于 7 个 package 的 exports/dependencies。刷新 JSON/Markdown 后字节 `--check` 通过；未修改生成器、allowlist 或产品代码。
- 合并 Context 重复数据定义到原 Usage/Context 主规范，面板原路径保留交互规则；明确当前 Service 三层契约与 P0 设计背景的阅读关系；修正 seq 起点及旧事件名当前化的冲突。
- 更新 P1-B、Context 和基础组件的可执行下一步。全仓 typecheck 失败于独立中文界面任务的 fixture 类型错误；未修改该任务代码。
- 设置中心/模型/Usage 与工具预览/流式修复的进一步章节合并已有明确去向，未批量删除或搬移 v2 文档，未建立 archive/v2。

- 随后中文界面任务自行完成并归档，原临时类型错误由该任务修复。本轮重新执行全仓 typecheck/test，均通过（Desktop 97 个文件、651 个用例）。
- Context 的 G1 已补齐，将其 README/P00/P01 三个计划文件移入 completed 并修复引用，保留 G2 人工清单；最终 active 为 8 个。此前“没有新增计划归档”是中途复核结果，以本条和最终摘要为准。
