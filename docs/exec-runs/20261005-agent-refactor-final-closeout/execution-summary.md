# 最终重构收尾：实施与验收结算

状态：2026-10-05，本次批准范围的代码、目录与文档清理及验收已完成。隔离源码自动化通过，Computer Use 35/35 项签收，两个产品缺陷均已修复并复验；计划已归档。未 commit/push。

## 最终任务结算

本轮完成原批准的最终收尾计划，不新增架构阶段或未来产品功能。

| 任务 | 最终状态 | 证据 |
| --- | --- | --- |
| T1 代码/测试清理 | 完成 | 消费者闭包、Cordis 生命周期与无效包装清理；附件两项缺陷修复复验 |
| T2 根目录整理 | 完成 | 根路径映射与实际路径核对，artifacts 退出跟踪 |
| T3 文档合并/校准 | 完成 | 主规范同步、旧计划结算、导航与入链增量检查 |
| T4 自动化/进程验证 | 通过 | 隔离完整基线；后续 Desktop 1,006 项与显式 SSH 复验 |
| T5 Computer Use | 35/35 通过 | gpt-6.1-sol 真实交互；标题菜单使用用户授权的 System Events |
| T6 结算交付 | 完成 | 统计、逐路径清单、817 份保护校验、计划归档 |

两项产品问题已闭环：超限附件被错误归类为提交未知；远端队列编辑丢图片。fixture 的图片、保活、SSH 装配、指纹维护，以及 CU 读取延迟均独立记录，没有混算为产品缺陷。未来自进化工具、手机前端、数据库实现与并行工作台设计不进入本轮。

## 修改结果

- 统一 Cordis `apply` 装载，删除 23 个插件仅供旧测试使用的 activate 工厂、旧 activation adapter、空生命周期包装与未用符号；保留有实际资源的释放路径和模块边界。
- Inbox 写侧收窄为后台通知，用户任务由 Host Task 管理。修复 CLI 失败诊断、重试请求终态/冷恢复、Headless resume 暂停队列，以及 diff 内容以 `++/--` 开头时的行数统计。
- JSONL/中性 storage/Session/projection 分工保留；Host/Harness/Run 与客户端边界不变，不引入未来自进化工作流或新的产品配置。
- 诊断和 native 实验脚本按用途归类；根目录基线 52 项，按处置表清理后 40 项；Finder 后续又自动生成一个已忽略的 `.DS_Store`，当前磁盘计数为 41 项。删除空 output、退役 target、已确认生成缓存与散落临时指令。artifacts 整体忽略，7 个原跟踪文件取消跟踪，本地文件保留。
- 合并重复架构内容，校准 ABI、Task、设置、工具预览、模型与存储规范；三个已实施计划移入 completed，旧链接保留短入口。保留独立研究、未来计划、验收证据和已有工作台设计 WIP。

逐项处置见 [cleanup-ledger.tsv](cleanup-ledger.tsv)，根路径见 [root-path-map.tsv](root-path-map.tsv)，模块证据与保留限制见 [module-review.md](module-review.md)，具体修复过程见 [execution-process.md](execution-process.md)。清单覆盖 1,112 个原始登记行，并单列新增/迁入文件；同一路径具有 module/root 双重职责时分别登记。保留不等于证明无冗余。执行期间另外出现前端 assets 图片和 docs/desktop-frontend-refactor 独立方案，属于并行工作，原样保护且不计本轮成果。

## 自动化结果

在系统临时目录建立独立 clone，复制当前未提交源码与新增文件，排除旧 dist、artifacts、依赖、日志和真实配置；复制清单与哈希保存在本机 `tmp/refactor-final-closeout/snapshot-hashes.json`。未改主工作区源码索引，只有授权的 artifacts 取消跟踪进入暂存区。

| 检查 | 结果与证据 |
| --- | --- |
| frozen install；site check/test/build | 通过；clean-checks 01/03/04/08 |
| 仓库 `pnpm run ci`、check:repo、check:docs | 通过；final-checks 01–03 |
| typecheck、build、完整 pnpm test | 最终复验通过；final-checks 05–07 |
| matrix / packages / desktop graph / legacy / strict cutover / Harness events | 通过；clean-rechecks 01 与 clean-checks 13–17；完整测试含正负例 |
| Browser TS/JS 与 Go protocol/CLI | 通过；clean-checks 18/23 |
| CLI 真实 HTTP 进程 | 原11项覆盖 CLI1–CLI6；新增fixture SSE保活/请求编号恢复后12/12，隔离快照复验通过（provider-keepalive-snapshot.log） |
| 新建 CLI 包及隔离 smoke | 通过；clean-checks 20/21，未使用主工作区旧 tar |
| Host 协议与真实隔离 sshd | 通过；clean-checks 22，ACTSPACE_TEST_SSH=1；不是云部署验收 |
| 真实 Cordis / observer / lifecycle | ACTSPACE_REAL_CORDIS=1，完整测试执行；专门 real Cordis 回归 37 项通过 |
| 43 个领域包未使用局部符号检查 | 全部通过；unused-final.json；不证明动态导出可删除 |
| diagnostics / native spike | help、synthetic 输入与本机 adhoc native prepare/run/package 成功；不是签名/公证 |
| 附件拒绝与提交回执边界 | CU3.3 发现的准备错误分类已修复，IPC/附件/队列 18 项通过，Desktop typecheck 成功；完整 Desktop 最新 1,006 项通过及显式 SSH 1 项通过，既有 IME 跳过；CU3.3 真实界面拒绝与草稿保留已复验通过 |
| Markdown lint | CI 同版 0.22.0；新增错误 0，原有错误单独登记，未宣称全仓 lint 通过 |

上述日志均位于本机 `tmp/refactor-final-closeout/`。本机通过不等于远端 CI 已运行。初次失败保留在原日志：`pnpm ci` 命中内建命令、矩阵未更新、干净 typecheck 缺 Client 构建、迁移入口缺索引、Host 设置页字体 token；对应修复与成功复验分开记录。

完整测试有一个原有 Editor PoC IME 用例显式 skip（独立 Composer PB 工作，源码已注释）；不计为通过。当前必需的 Cordis/SSH 用例通过显式开关执行，没有用 skip 替代其验收。

CLI tar：`artifacts/agent-cli-managed/darwin-arm64/actspace-agent.tar.gz`，23,998,637 bytes，SHA256 `c573e63c0d6f2377cbde732a32d9412b1b71ad0fc701f5e33626b441960c7c0c`。这是本轮隔离构建产物，未作为源码提交。

CU4.3 另外发现远端队列编辑丢失附件，已修复持久 artifact 到 Composer 的投影和重新上传链路，定向测试与完整 Desktop 回归通过；真实 Reload 后编辑、批注/图片/正文回填、修改重发唯一执行与草稿清空已复验通过。

## 原始目标证据

| 目标 | 具体证据与当前结论 |
| --- | --- |
| G1 可替换 Harness/Loop，旧 Run 固定组合 | harness-run 的 `runs replaceable implementations from real fixed artifacts and retains the old lease until execution stops`；managed-runs 的结构化返回值测试。自动化通过 |
| G2 授权、候选失败隔离和释放 | activation 的 defaults denied / stale concurrent candidates / authorization expiry / durability failure / old implementation cleanup failure / candidate initialization failure。自动化通过 |
| G3 恢复阻断与维护 | activation 的 missing artifacts / Host contracts changed；harness-recovery、host-blocked/receipt 真进程。自动化通过，不把重连当崩溃恢复 |
| G4 Host/客户端独立，接纳不重复 | host lifecycle/receipt/subagent-drain 真进程通过；CU 已通过退出重开持续运行、断连禁用、重连手动唯一发送、文件预览保存和 SSH 连接释放；远端附件失败时批注/正文/图片保留、恢复后唯一接纳也已通过 |
| G5 内容队列与配置、预算、子 Run | run-manager 的 latest config at consumption、configuration after asynchronous lease、overlapping approvals、absolute deadline、pin cancellation；subagent 的 independent generation 与 disposal waits terminal。自动化通过；CU 队列排序/指定撤回/停止暂停/继续、Reload 和审批取消已通过；含附件与批注的队列编辑经修复后也已签收 |
| G6 存储中立 | storage-neutral 的 cold reads/lists/pages/exports/forks without filesystem、checkpoint failure still closes；Memory/JSONL 契约、provider-seam/recovery-fork/fork-artifacts 通过 |
| G7 Cordis 单一基底 | real Cordis、事件模式守卫、observer 异常/异步隔离、Loop checkpoint、Runtime shutdown 顺序通过；不宣称回滚已发生的外部副作用 |
| G8 易维护与保护 | 逐路径结算、根映射、已知漂移守卫与链接增量完成；817 个原历史/学习文件不变，CU1 设置/连接重开与原会话续聊已真实验证；最终边界见 CU 报告 |

## 保护与目录例外

817 个原 histories/learnings 文件内容哈希和路径均一致，新增本轮学习不覆盖旧记录。本轮处置范围的 Markdown/HTML/锚点入链比较无新增断链；并行 frontend-refactor 文档及动态 HTML 模板的扫描结果单列，不修改其正文；95 条执行前已存在的扫描结果保留为基线，其中包括站点路由等需要语义区分的引用，不靠重写历史消除。

`.tmp/` 中 4 个独立 clean-checkout 仓库存在绝对路径或外部链接绑定，按批准例外原位保留；不把“没有活动进程”误判为可以移动。sandbox-runtime 的 Git 状态与所有文件哈希核对后迁入 `tmp/reference-checkouts/`。Native Messaging 注册检查未发现引用本次实验配置，实验资料移入 `tmp/browser-bridge-fixtures/`；系统配置未修改。

## 规模与完成边界

统计见 [before](refactor-stats-before.md) 与 [after](refactor-stats-after.md)。统计脚本覆盖当前整个工作树，HTML 设计稿也计入源代码，且包含执行期间的独立前端新增工作；全仓增减不是本轮净删减成果，不能归因到本轮清理。当前设计 Markdown 从 26,113 行降至 25,400 行；根入口减少 12 项。领域 packages 的生产源代码净减少 161 行，相关测试净增加 51 行；Desktop/CLI 生产源码合计增加 81 行，Desktop 测试增加 64 行，用于明确错误边界与失败诊断（统计不含把迁移算成删除）。新增确定性测试、可复建验收设施和结算记录会增加文件/行数，不能把总行数下降当成模块化目标，也不能把迁移与制品退出跟踪算作删除生产代码收益。

[Computer Use 逐项报告](computer-use-acceptance.md)由 gpt-6.1-sol 完成，35/35 项按约定分支及代表位置签收。SSH 使用隔离系统 ssh/sshd 的测试装配，界面路径必须另行实际操作。未来自进化工具、手机 Web 前端、数据库生产实现和独立工作台功能不属于本轮。

本轮未 commit/push。[最终计划](../../exec-plans/completed/20261005-agent-refactor-final-closeout/README.md)已移入 completed。

标题竞争最终证据：原生菜单由用户授权的 System Events AXPress 操作，其余输入/发送/观察仍由 Computer Use 完成。Session 940fe0b5 接纳后 19.024 秒写入手动名，早于产品 30 秒期限；Provider 57 标题、58 正文，释放后无自动覆盖，页面与侧栏保持手动名。之前超时/未命中操作保留失败过程，不计为通过。额外 Reload 曾遇开发 Vite 进程停止，独立恢复后再次真实 Reload，手动标题与正文完整保留，不作为标题缺陷。隔离 Desktop 已正常退出，Provider/Host 与本轮 renderer 已停止，SSH fixture 进程已不存活；数据与证据保留。

用户复审后的目录合并：删除独立鹈鹕动画；两个工具流 HTML 归入 design-docs/frontend；Host 指南与 systemd 示例归入 agent-plugin-runtime，内部装配说明合入总体架构。design-demos 已移除；agent-host 只留一份保护历史入链的短跳转页。演示和示例内容哈希不变，现行引用同步并通过 check:docs；临时 desktop-frontend-refactor 仅更新路径引用，未整理其内容。
