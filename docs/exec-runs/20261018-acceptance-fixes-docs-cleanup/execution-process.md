# 执行过程

- 用户批准从 main 建分支，修复验收缺陷并执行已审阅的 DOCS 清理计划，最后一次提交、推送并创建 PR。
- 初始状态：main 与本地 origin/main 同为 `a13f8a1e`；仅上一轮的 8 份验收/审计文档未跟踪。创建 `codex/acceptance-fixes-docs-cleanup`。
- 首次刷新远程 main 因连接 GitHub 超时失败；发布前重新核对。
- 根因核对：Web 缺少显式 resume 入口；审批按钮沿用 30px 默认尺寸；历史精简剔除了携带首 token 时间的 chunk；文件工具将 canonical 文件路径与 lexical 工作区根混算相对路径。

- GitHub 直连超时后使用仓库约定的本地代理成功 fetch；远程 main 仍为 `a13f8a1e`，与建分支基线一致。
- 回归先红后绿：Web 缺少 resume、别名工作区写/改/删返回绝对路径、历史精简丢首 token metadata 均已复现。路径权限 admission 与外部绝对路径边界保留。
- ENG01：分阶段诊断发现旧 `rejects(RECOVERY_BLOCKED)` 断言与 pristine builtin 自动升级合同冲突；实际 acquire 成功后租约未释放，使 finally shutdown 等待。更新为验证 revision、executionDigest、新 Host 权限并 finally release；保持原 15 秒超时，Runtime 全量 57 项通过。
- DA01：实际统计行的 grid item `min-width:auto` 撑宽轨道；聚焦 Context 按钮又触发祖先横滚。增加最小宽度约束及行/胶囊换行，定向实机复验继续进行。
- 只读深度审查发现 resume 冲突回包与模拟测试不一致：真实 Host 返回 `{snapshot,error:REVISION_CONFLICT}` 而非抛 `kind:CONFLICT`。已按真实合同处理，限制一次重试；审查方独立执行 35 项相关测试通过，无剩余产品发现。
- Desktop 首次全量测试在与多个构建并发时出现 session-ipc-budget 30 秒超时；其余 1927 项通过、7 项跳过。单独复验该文件 5 项通过（2000事件打开约6.2秒），随后限制4个worker重跑全量，保留初次失败事实。
- 31 个 HTML 原件与依赖已经桌面备份并逐文件 SHA-256 校验。旧 Logo 通过 Git 历史恢复到备份侧；动态引用的 11 张旧窄屏截图及1张宽屏截图均已缺失，写入 manifest，未伪造。共44文件、8,357,579字节，等待三个代表预览后移除原件。
- 按计划归档10个实现完成的计划，当前导航及 incoming 相对链接同步；Space仍是mock、Web D4/iPhone未覆盖、Site阶段B未实施、O01原生性能观察均保留。修正Context/SQLite状态、验证指南测试标记、架构Web入口、队列暂停语义及失效官网链接。

- 用户明确取消备份页面打开检查；已按授权再次核验31原件/桌面副本哈希并移除仓库副本。未继续预览，不将预览作为阻塞。共44备份文件和manifest保留在本机桌面。

- Web 真实 Host + 可控 Provider 定向复验：停止后暂停、新发保持暂停、撤回、刷新后继续、失败后切正常模型继续、维护/断连禁用与重连恢复均通过；390px浅深主题的实际审批两按钮均50×44。真实Web模型和原生WebCU不据此声称通过。
- 仓库基础 CI（docs、卫生、密钥、主题、tokens、Action SHA、package cutover、shell语法）通过；Site发布记录同步后23项测试及46页构建再次通过。
- 新验收报告的本地截图仅保留文字路径，避免提交指向ignored文件的Markdown链接；截图本体不随Git分发。

- Desktop 限4 worker全量出现同一IPC文件的afterEach清理hook超时；最终单worker全量1928通过、7跳过，未改超时或跳过配置。Agent Service 33项与Client 26项全部通过。

- Desktop原生核心复验通过：482px实际窗口Context/统计行完整；真实模型新第7轮write/edit显示2文件改动卡，刷新后保留且usage未重复；旧Thinking第2轮显示TTFT527ms、生成465ms、245.2tok/s，与脱敏对账一致。自持真实实例已CmdQ。全部主题/尺寸与历史类型组合仍按报告保留覆盖边界。
