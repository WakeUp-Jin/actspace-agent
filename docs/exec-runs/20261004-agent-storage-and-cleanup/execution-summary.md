# 存储与第二轮清理：执行摘要

2026-10-05 后续结算：本文保留当轮实施与验收快照；重构范围内的剩余清理及界面门禁已由[最终收尾](../20261005-agent-refactor-final-closeout/execution-summary.md)完成，逐项 35/35 通过。

状态：代码、文档与自动化验证完成；本轮真实 Electron Computer Use 已覆盖主要链路，发现的三处问题均修复并复验。仍有明确未覆盖子项，不能宣称全部验收通过。用户授权实施，未提交或推送。

## 交付结果

1. 存储方式与 Session 业务解耦：新增 `@actspace/session-storage`，JSONL 与独立 Memory 使用同一 handle/provider 契约。冷读、列表、恢复、fork 和缓存一起迁移。文件布局、writer lease 与物理修复留在 JSONL。附件复制仍是独立 port，不假装已实现数据库附件存储。
2. 统一任务入口：本地首发、远端、排队共用 submitTask 与 Host snapshot；`/compact` 是队列中的应用操作，可在等待时取消。通用 Run outcome/value 不再要求默认 Loop 文本结果，Headless 等 settlement 后返回。
3. 删除审计 C01–C14 的无消费者 API、别名、重复启动包装和旧 DTO，测试跟随当前契约。保留存储 port、任务/通知职责区别、Host/Harness/Run 边界。详见[代码审计实施结果](../../design-docs/agent-plugin-runtime/agent-refactor-code-cleanup-review.md)。
4. 修复关闭重试、多个 Session 失败仍释放、恢复后的 Client 增量；补充解决 JSONL acquisition/close 竞争、读取缓存无界保留，以及 Cordis 释放顺序导致 Session 最后落盘失败。Host 明确先 drain 执行、关闭 Session，再释放插件树。
5. 默认 Harness 构建与运行共用定义；矩阵覆盖实际 package/manifest 和领域事件声明。生产 manifest 校验声明服务集合，负向测试覆盖失配；未宣称已构建动态消费者语义分析器。
6. 当前架构文档按最终源码重写或精简；六组旧后端计划改为短回溯入口，并逐项记录独有剩余工作。[旧计划处理表](legacy-plan-resolution.md)和[文档审计结果](../../design-docs/agent-plugin-runtime/agent-refactor-docs-cleanup-review.md)说明取舍。

## 自动化与进程证据

以下均为本轮结果，不沿用前一轮验收。构建与测试分开执行，避免构建清空 dist 与测试并发导致的 ENOENT。

| 检查 | 结果及范围 |
| --- | --- |
| 依赖闭包构建、CLI package 构建 | 通过 |
| `pnpm -r typecheck` | 最终共享类型清理后通过 |
| Session persistence / JSONL / Memory / projection-cache | 44 / 5 / 3 / 2 项通过；内存不证明磁盘耐久性 |
| Runtime | 最终 48 项通过，含非默认 Run、存储读取/fork、shutdown 重试 |
| Cordis adapter / Agent Service | 最终 36 通过 1 跳过 / 28 通过 |
| Host / Headless / Desktop App / Subagent / CLI | 44 / 2 / 12 / 11 / 11 项通过 |
| Desktop | 完整 1001 通过、2 跳过；最后测试 fixture/旧类型清理后定向 59 通过（含 CU6 新增恢复回归），类型检查通过 |
| Host 进程 | 7 项通过 |
| CLI 进程与打包 smoke | SIGINT 2 项通过；打包产物持久化、跨进程续聊通过 |
| Harness 恢复进程 | SIGKILL 恢复 1 项通过 |
| 文档/矩阵/事件/包检查 | 文档链接与 current-docs、矩阵 3 项及生成一致性、事件分发、46 包边界和 legacy-removal 通过 |

一次全 workspace test 在 Runtime 的新增 manifest 校验处中断；定位并修正静态 browser-tools 声明和测试的裁剪 manifest 后，Runtime 独立全套通过。以上按实际复验范围记录，不声称整条 `pnpm -r test` 最后一次完整成功。

实机验收由 `gpt-6.1-sol` 子智能体执行，逐项状态、复现与证据见 [Computer Use 验收](computer-use-acceptance.md)。真实 UI 使用隔离本地 Provider 和 Host，不等同于线上 Provider、云部署或发行包验证。

## 实机发现与修复

- CU6：运行中 Reload 后用户输入与轮次导航重复，Provider 请求仍为一次。原因是 Task snapshot 恢复占位与持久化用户消息同时拼接。按稳定 renderKey 去掉重复占位，保留持久化消息元数据；新增回归先复现 2 条、修后 1 条，相关 renderer 59 项及 Desktop 类型检查通过。Sol 已在新的 running 任务 + busy compact 队列场景下 Cmd+R 复验：用户消息和轮次各一条，running/Stop 与队列恢复，CU6 修复通过。

- CU4：摘要失败后队列暂停，点击重试仅入队不执行。重试入口现仅在 receipt 确认且该任务仍 pending 时恢复暂停队列；普通发送不自动 resume。测试 fixture 同步失败暂停语义，相关 59 项通过；Sol 已复验摘要失败后点击重试直接进入 running 压缩、发送禁用，无需额外继续。

- CU7 重开时发现开发 composite 构建的 Todo 投影 filter 参数隐式 any；显式 unknown 后同一 `build:deps:dev` 屏障通过，Sol 已确认重开后原 Session、压缩块、设置恢复，继续发送成功且请求唯一。Todo 定向 3 项通过。

## 真实界面覆盖与剩余门禁

Sol 已覆盖本地首发、流式、自动标题；队列排序/插入/撤回/删除/停止暂停与继续；同 Session Plan/Agent 和模型切换；压缩 running/skipped/失败重试、busy 排队取消；Reload；正常退出重开；远端配对、任务、审批、结果文件预览、离线禁止发送/保留草稿与重连唯一发送。细节及证据以逐项验收表为准。

未覆盖：图片选择器无法通过原生工具取得选中反馈，因此附件预览/发送与非法输入拒绝不计实机通过；队列编辑撤回草稿；推理参数/skills 配置消费；自动标题与手动改名竞争；busy compact 取消后重排到最终执行。对应已有自动化不能替代这些真实交互门禁。

## 统计与保护

[前后统计](refactor-stats-after.md)以本轮开始时的脏工作树为 before；其中 Git diff 是相对 HEAD 的累计变化，不能全算为本轮产出。源代码目前净减少 906 行；测试净增加 38 行。文档字符以最终统计为准，包含新执行记录。

SHA256 对照确认原有 815 个 histories/learnings 文件未变；新学习记录另建。既有前端工作台设计、产品概念及 myplan 未改动。不删除或迁移用户配置、历史数据。

## 保留边界与债务

- SQLite/MySQL 生产实现、迁移工具、自进化工作流和手机前端不在本次范围。
- 冷读仍是完整快照，revision 变化重放；缓存仅保留最多 3 项及 16 MiB 序列化估算。没有增量文件偏移或磁盘 checkpoint，缓存限额不等于峰值内存上限。
- 独立 CLI 确定性 retry/error fixture 转技术债；没有借旧计划退役把它标为完成。
- package-cutover 普通模式完成，但报告 apps/site/.astro 内 3 个既有 `/eval` 残留；未宣称 strict 模式通过，也未修改这批无关网站生成物。
- 其他未来功能计划保持原状；未进一步批量删除缺乏唯一性核查的 exec-runs。

## 2026-10-05 过程记录归并

原过程页的实现、三处缺陷根因与阶段性测试均已由本文和相邻 Computer Use 表承接。阶段测试数量不替代最终结果；旧记录中的 active 状态已随实施生命周期转为 completed，未验子项由最终收尾计划承接。
