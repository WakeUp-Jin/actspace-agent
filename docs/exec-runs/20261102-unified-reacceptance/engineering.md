# 本轮工程与数据证据

对象是 `codex/verfiy_two_1` 当前未提交修复；HEAD `1a83adcc73d946ab646fff62b2d3e00d04db859f` 不能单独代表这些修复。非文档2734文件和新构建436文件分别冻结哈希。产品代码、正式测试、锁文件及 Git 状态受保护。

| 本轮独立执行 | 结果 |
| --- | --- |
| `pnpm --filter @actspace/desktop build` | exit 0，包含依赖和完整 Desktop 制品 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0；66包测试汇总3793通过、0失败、22跳过；Desktop 2138通过、7跳过 |
| `pnpm check:docs` | exit 0 |
| `pnpm test:current-docs` | exit 0 |
| 独立规则查询探针 | 当前编译代码33/33；合成数据，非200次真实请求 |

本轮完整测试包含 evaluation 的沙箱启动后取消、准备中取消、开始前已取消三种情况。没有将用户报告的单包连跑3次冒充为本轮执行。标题时序、模型事实优先级与空库 dataVersion 0→1/不反复查询由现有回归测试另证；原生UI证据另见覆盖台账。

## 真实继承计数

在本轮独立数据目录中，原生UI创建 main、侧聊、fork、fork2 和5个子Agent，真实DeepSeek执行后同步。按各Journal的lineage边界独立取自有事件，与持久化SQLite对照：

| 范围 | 请求 | 轮 | 工具调用 |
| --- | --- | --- | --- |
| 包含复制前缀的原始事件总数 | 47 | 24 | 29 |
| 自有执行应计/实际计入 | 22 / 22 | 14 / 14 | 11 / 11 |
| 应排除的继承部分 | 25 | 10 | 18 |

main 为13请求/6轮/9工具，side、fork、fork2 各为1请求/1轮/0工具。委派表按 requested/completed/child-terminal 的 invocation 并集核对，不能只用父侧 requested 推断子会话表行数。9个会话均一致；Usage 中继承requestId数为0。side的plan和fork的agent模式、main@1 revision保留。Usage有23条LLM请求（含辅助请求）及11条工具活动，338452 token，不能要求它和Harness的22主请求机械相等。

## 重建与规则夹具方法

正常退出独立实例后，仅对临时统计库按旧全前缀语义重放三个继承会话并设置schema15。这是用真实新建Journal构造的旧计数语义夹具，并非生产旧二进制生成的原库。另加入没有Journal的已删除分叉归档（10请求/5轮/6工具）及3条规则样本元数据归档。

真实Electron worker重启后自动重建到schema16。9个原会话的 `harness_request`、`harness_turn`、`harness_tool_rollup` 和 `usage_activity` 行与重建前正确v16备份逐行相同；Usage仍为338452 token。全部请求35=真实22+删除归档10+规则3，不能把合成归档额外计数当成重复Bug。已删除旧归档仍保留10/5/6，符合无Journal无法重算的已知限制。

规则归档用3个模型筛选维度分别隔离：200 exposures/1 call（命中）、199/0（样本不足）、200/2（调用率1%，不命中）。工具元数据使用actspace.filesystem-read，真实inventory映射到filesystem-read；UI逐条验证展示及规则跳转。它们是显式合成统计，不是200轮真实模型执行。

租约故障、延迟标题及受控Provider失败也只用于临时目录。它们可验证真实Electron/Host/IPC/UI路径，但不冒充真实DeepSeek网络时序。租约故障日志中的History fallback超过5000事件是受控锁下的有界降级限制，不是本轮新增产品缺陷。

原始日志、脱敏审计JSON、AX与截图保留在本机 `tmp/codex-acceptance/20261102-unified-reacceptance/`，不作为仓库内截图链接提交。

## 延迟标题与失败子Agent

真实DeepSeek首轮标题在轮末之前到达，用于C2；C1则使用本机受控Provider：正文立即返回，标题延迟5秒。新会话 `turn/end` seq15 时间13:22:48.398Z，`session/title-set` seq18 时间13:22:53.304Z，晚4.906秒，期间没有新轮。transcript标题立即为LATE_TITLE_1102，FIXTURE_ACK_1102只出现一次。

失败子Agent由真实DeepSeek父会话调用explore，子用途绑定本机Provider，8秒后返回400。子Journal request/header seq9记录acceptance-1102，turn/end seq13为failed；原生列表/详情仍显示该模型。此样本不带usage，不用于关闭“带Token失败”旧未覆盖项。完成和停止的DeepSeek子Agent另有原生证据；重启后用途绑定改成本机模型，旧子Agent仍显示deepseek-flash，不把当前用途绑定当历史模型事实。

标题、正文和分叉/侧聊链接另以Journal重放审计：这是同一冻结实现的结果一致性核对，不独立证明格式正确。正文一致，部分仅last-activity元数据随轮后事件存在差异；没有重复章节锚点、reasoning原文或凭据泄漏。

## 后续重启稳定性

受控Provider新增父/子请求后，最终11个真实UI创建会话（包含受控Provider会话）自有26请求/17轮/12工具再次全部与Journal匹配，继承Usage requestId仍为0。全库39请求=自有26+合成归档13。末次正常退出/重启后，schema仍16，last_rebuild_at仍13:15:23.400Z；请求39行、轮22行、工具rollup202行、Usage40行均与重启前逐行哈希一致，没有再次全量重建或重复记账。已结束子会话的每秒读取次数未插桩测量，不据此声明I/O性能通过。
