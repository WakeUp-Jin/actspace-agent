# 工程检查与当前版本证据

基线 HEAD：`1a83adcc73d946ab646fff62b2d3e00d04db859f`。本轮不改产品源码、正式测试或锁文件。原始日志位于本机 `tmp/codex-acceptance/20261101-unified-acceptance/engineering/`，此处以普通路径描述，避免未分发证据造成新的文档断链。

| 范围 | 结果 | 说明 |
| --- | --- | --- |
| E1–E2 当前构建 | 通过 | frozen install补齐新包本地链接后，全仓typecheck 49.75s、Desktop完整构建31.19s；源码2732文件与产物690文件留哈希 |
| E3 包/插件/生成物 | 通过 | package检查、Desktop build graph、cutover/boundaries、plugin catalog、README及契约矩阵 |
| E4 边界与进程 | 通过 | renderer bridge、IPC、Harness events/recovery、Agent Host process检查及测试 |
| E5 全包/根脚本 | 失败 | 根脚本逐项执行；66个有测试结果的包合并后3783通过/1失败/22跳过，runtime按补测101替换、stats补16，不重复计复跑；另有文档脚本失败 |
| 主题/token | 通过 | frontend tokens/theme检查及tokens测试 |
| Desktop测试 | 通过，有跳过 | 262个文件通过、2跳过；2133测试通过、7跳过，不能把跳过算通过 |
| Runtime补测 | 通过 | 28文件101测试；新包链接补齐后的针对性复测 |
| Harness stats补测 | 通过 | 包内16测试；Desktop投影相关5测试也已在全包链通过 |
| H16规则查询样本 | 失败 | 冻结编译模块、内存SQLite独立查询33个样本，12类规则32通过/1失败；UA-003 |

| 问题 | 复现与证据 | 定性 |
| --- | --- | --- |
| UA-001 | check-docs.log、test-current-docs.log；6条缺失截图引用 | 当前HEAD已有的文档缺陷，不能因历史存在而忽略门禁失败 |
| UA-002 | all-package-tests.log、harness-evaluation-recheck.log；单包独立复跑同样失败 | 固定20ms取消与准备阶段存在竞争，尚不能据此认定产品取消错误 |
| 初始依赖链接缺失 | typecheck.log、desktop-build.log、install.log、rebuild-results.json、supplemental-results.json | 环境准备问题；frozen install后解决，未改锁文件，不计产品Bug |

根测试链的文档步骤会提前失败，因此本轮独立继续了所有后续脚本及包测试。没有用一次失败的根命令声称已运行后续测试，也没有把初始环境失败混入最终产品故障数。

R7、R4等现有自动化只能支持其自动化子步骤。真实步数上限、三小时审批超时以及任何没有实际触发的界面状态仍按未覆盖处理。H16现有测试包含统计增量/重复投递、归档重建、半行/截断、跨月与隐私元数据验证；独立规则样本补充了阈值定位证据，不修改正式测试，也不冒充真实UI命中。

收尾重新执行 `pnpm check:docs`：仍仅UA-001的6条旧截图断链，本轮新增报告/计划迁移链接无断链。64点正式台账及分组计数复核一致，59点CUA/数据子台账无重复/空子项/失效证据引用。最终产品2732文件、冻结构建690文件哈希与HEAD/分支均未变。
