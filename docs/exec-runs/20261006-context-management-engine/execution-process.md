# 上下文管理引擎执行过程

## 2026-10-06：开始执行

用户授权执行 P1–P4。工作区只有前面设计/计划文档修改，无既有运行时代码修改。先按 P1 固定旧转换行为，再迁移生产请求；各阶段单独记录检查，不把静态阅读当作实机验收。

- 进行中：P1.1 转换兼容基线。

## P1：请求转换

- 工作树缺少 node_modules；安装锁定依赖后原始 runtime 闭包构建通过。新增包内类型依赖后使用离线锁文件更新，无外部版本变更。
- 转换前新增 2 个 fixture，与文件引用/输出附件测试合计 6 项通过。随后提取唯一消息转换器及共享渲染/冻结，Factory 注入引擎，初次与恢复请求共同经过 Context。
- runtime 闭包构建通过；Context、Prompt、Loop、Runtime、Shared 测试通过；包边界检查通过。英语学习与默认 Harness 的真实组装 mock 测试通过，尚非外部 provider 或 UI 验收。

## P2：来源和状态

- 默认 Harness 六来源单独注册；Host 预先准入两个 v1 required Context Codec。Session header/envelope/core 事件/Surface 格式保持不变。
- AGENTS/Skill 按 Turn 加载；模型 Prompt 选择保留扩展点。动态信息与临时插槽为 surface:null 补充事件，完整工具批次后合并；重试复用逻辑 step 绑定。
- 英语学习改为 Host 持有的按 Session/Agent scope 隔离的扩展注册表，删除生产 system-prompt/assemble 事件。同一轮更新 ABI 与生成契约矩阵。
- Context、Prompt、英语学习、Loop、Runtime 测试通过；旧 JSONL 转换的 bytes/seq/Surface 不变测试通过。

## P3：压缩

- ContextCompactionCoordinator 成为手动与自动压缩唯一提交入口，按 Session 串行。策略只选择区间和生成摘要，协调器保留四条连续 core 事件。
- 接入固定 OpenCode 模板及 MIT 原文，完整保留 Relevant Files。前次摘要按有效替换身份识别，与新历史各输入一次；取消信号贯穿 LLM，Surface 改变则丢弃过期候选。
- 原有压缩测试和新 Prompt/工具批次边界测试通过。

## P4：披露与恢复

- 文件读取成功提供命名 detail，Loop 在提交结果后 awaited 交接；失败、目录、任意 shell 命令不猜读计数。读缓存增加 Session/replaceGeneration；正文/unchanged 都是成功读取。
- JSONL Host 返回真实 Journal 文件；内存会话不伪造文件。路径不授予权限。索引使用现有 artifact 存储与类型化引用，fork 沿用 SessionStore 复制机制。
- 候选事件按 256 KiB 分批，候选 flush → core 四事件/flush → applied/flush。索引生成或 applied 追加失败后，只补派生状态，不再次调用 summarizer。
- 0/1/100/101/10000 引用、跨周期睡眠读取、重启/fork 计数隔离、持久前缀切点、候选 flush 失败、索引失败、applied 追加失败、索引不随计数重建均有定向测试。
- 10000 明确引用加原始消息文件/Journal 产生多个候选事件；最终展示仅 100 活跃文件和一个睡眠索引。目录由 Host stat 过滤。
- 默认 Harness 装载测试实际启用披露；JSONL Host 路径与 typed-index fork 测试通过。

## 最终检查与实机边界

- 全仓 typecheck、build、repo/packages/package-cutover/v2-legacy-removal 检查通过；CLI 真进程 12/12 通过。
- 完整 pnpm test 的桌面断言 1006 通过，但出现 Composer HoverCard teardown 后 window is not defined 的异步异常，命令首次退出失败。未改无关组件；Composer/Context/投影定向 100/100 和 Desktop 全量复跑 1006/1006（2 skip）通过。保留首次失败，不将其抹去或声称已修复该时序问题。
- 使用隔离数据目录启动真实 Electron，委派 gpt-6.1-sol 做 U1–U8。窗口未连接模型，不导入真实凭据；可验证部分与未覆盖项由 Computer Use 报告逐项列出。

## 真实 Provider 分组验收（完成取证）

- 用户批准增加临时日志并用真实桌面验收，只收集问题，统一留待后续修复。复用授权的模型配置至独立临时目录；原用户数据不改写。Computer Use 由 gpt-6.1-sol 执行。
- 在 Context、toLlmInput、prepare、压缩及 Host 观测点增加环境变量控制的临时日志，原文件逐一备份，验收后按原 bytes 恢复；不改变逻辑。
- 已验证真实分页、Agent/Chat/Plan、手动压缩、100上限、睡眠读取延迟恢复、权限拒绝、源文件和 Journal 重读、正常重启与 fork。最终35次请求的转换与53份持久输入快照核对一致（包括fork继承副本），图片与文本附件逐块转换正确；确认7项真实功能问题，不能标整体通过。
- 詳细分组/逐项结果和复现证据见 [本轮报告](real-desktop-acceptance-20261006.md) 与 [数据证据](real-desktop-data-evidence-20261006.md)，模型切换、附件、停止、空压缩及自动压缩均完成路线；英语开启受阻、Provider重试和压缩失败/取消保留缺口。没有修复业务代码。

- 自动压缩在50%配置、Kimi256K容量、约60.7K实际tokens时触发，事务完整但比例错误；尾请求cycle1正常。阈值恢复80%。
- 大文本暴露累计TaskSnapshot超过1MiB的DURABILITY_BLOCKED，保留故障会话和日志；没有删事件或修复。
- 持久保存去掉完整prompt/凭据的逐请求核对JSON；7项确认问题、2项候选及未覆盖项由桌面报告收拢。临时插桩还原和闭包构建结果在收尾补记。

- 收尾：正常GUI退出且主进程/dev链路结束；6文件按备份sha256逐一恢复，删除临时源码helper及dist残留，保留既有实现改动。runtime闭包构建通过，默认Harness重建35个ESM文件；临时日志符号不再存在于受影响src/dist。docs及diff检查通过。
