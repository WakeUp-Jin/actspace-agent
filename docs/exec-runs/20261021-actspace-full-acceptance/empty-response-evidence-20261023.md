# BUG-049 正常空响应的证据闭环

2026-10-23。主智能体修复和主审查，bridge_preflight独立只读审查；未提交或推送。结论：BUG-049的CLI/Core空响应生命周期缺陷已关闭，P2-C02恢复通过；F3-02原生故障空态不由本报告代签。

## 根因及回归

`packages/core/agent-loop/src/loop.ts`原先仅在content非空或failure存在时写assistant/message，合法空成功响应没有请求终态，step/end被Session不变量拒绝。修复无条件写唯一assistant/message，保留空数组、真实usage与结束原因，不放松不变量或制造正文。

`src/test/empty-output.test.ts`分别用main/subagent验证合法空done、唯一且顺序正确的请求收尾、后续轮次可写及冷Journal重放后可关闭。新增两条修前失败，既有partial-output四条通过；修后Core全包10文件51测试通过。当前Runtime定向3文件6测试、CLI真实进程19测试通过；Core及Runtime类型检查、Core及Runtime构建、58个workspace manifests边界检查通过。上述套件不累加成一个无重叠测试数。

本地日志根为`tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/bug049/`，保留red.log、green.log、runtime-current.log、cli-process-current.log、types.log、runtime-types.log、build.log、runtime-build.log及packages.log。

## 实际生产入口

合成Provider经真实HTTP/SSE返回空content、stop及100/0/100用量。CLI正常运行持久化父explore→子空结果→父完成：父e2935880-ca4f-46fa-8dba-ab81228a171b，子2d4911d2-9327-478e-b9f0-977e718aa2e7。

| 核对 | 原始事实 |
| --- | --- |
| 子请求闭合 | request/header9 → 唯一assistant/message11（content=[]、stop、真实usage）→ step/end12 → turn/end13 → run completed14 → 唯一child-terminal completed15 |
| 父工具成功 | tool/result18为completed且failure=null，modelOutput空text，引用同子/invocation；父25正文、26/27/28正常结束 |
| 持久事实及导出 | 原父/子Journal、CLI result和trace一致，父退出0之外还单独核对了子成功与父工具状态 |
| 冷进程再次空主轮 | 独立Node PID40481，记录真实argv、起止时间、code0/signalnull；新增request36 → 空assistant38 → step39/turn40/run41正常结束；旧父152789字节前缀及旧子66465字节完全一致 |

首批原始数据与输出位于本地`parallel-20261023/f3-empty-green/cli-data-current`及`cli-artifacts-current`；冷进程证明位于`parallel-20261023/bug049/cold-process/process.json`、cli.log、cli.stderr.log、data及artifacts。冷进程Provider已正常停机code0，stderr为空。CLI、Provider和所有数据均为自有夹具，不是商业Provider或原生UI证据。

## 实际消费版本

HEAD为00d6b763，包含现有未提交改动。领域包构建后首轮真实CLI仍失败，原因是入口实际使用旧Runtime固定Harness；重建Runtime的37个固定ESM后才取得当前成功样本。

存档Harness发布时将七个共享模块specifier固定为Host file URL；按artifact.json还原该合法转换后，37个JS与当前Runtime逐字一致，38个artifact文件及7个Host模块integrity均通过。不能将发布转换产生的字节差异误作旧代码，也不能只比agent-factory一个文件便声称整个闭包一致。

原bug049-build.json源码列表遗漏loop.ts，保留原文件，另补bug049/closure-manifest.json：298源码状态条目（293个实际非空SHA、5个null状态）及2421制品/存档条目，build SHA256 a1b783f31131be54e532195d893f91289b1137b0fde718cc53b235a5bd6c952b。loop.ts SHA256 bb40b0efccefbd3feda4bb1c52ea7d311dac23e52c396bbe5f0479e6150e1bc7；回归文件14f7625881f627f39953666379047dece3eb37bcdcbdad3e7c35b184c065686b。

独立审查的完整方法、37文件比较脚本和原始核对见[本地审查报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/bug049-audit/report.md)。初次旧bundle失败和同Session重复固定tool-call-id的夹具失败均保留，不把它们写成当前通过或新产品Bug。

## 后续原生验收已完成

F3-02后续真实Electron健康样本、停机header-only副本、重试耗尽无摘要空态及恢复已按原要求验收，完整复合范围主审通过，见[独立原生恢复证据](subagent-recovery-evidence-20261023.md)。CLI健康样本只用于数据准备，不改写header/profileId/codec来制造兼容，不把存储故障副本称为自然零事件；本报告的CLI结果仍不代签原生交互。
