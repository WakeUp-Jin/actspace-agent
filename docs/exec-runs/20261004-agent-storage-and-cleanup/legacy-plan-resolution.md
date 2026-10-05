# 旧后端计划结算与回溯

2026-10-04：六个旧执行入口被当前清理计划替代。取消过时实施步骤不等于其所有门禁都通过。histories/learnings 不改正文；旧文件保留短入口保障回溯，不再作为 active 待办导航。

| 原计划 | 独有目标的归属 | 本轮处理 |
| --- | --- | --- |
| P1 Session Core/Persistence | 中性读写/恢复/fork/冷读 → 本轮 storage S1–S4 | session-storage 新契约与 JSONL/Memory 实现；不为旧包名新建空壳 session-core；SQL 生产实现和迁移另案 |
| P1 Service roles | 契约、所有权、实际消费者 → application A4 / documentation D2 | 删除无生产消费者的通用 Provider/Consumer helpers；保留真实 Cordis Service、manifest admission 与局部接口 |
| P1 Profile/Bundle/Patch | Host 重启、Harness 新 Run 选择、失败释放 → application A5 | 取消旧全局 restart-only 叙述；工具禁用/恢复、shutdown 重试和 CLI one-shot 在本轮验证 |
| P2 Contract Matrix | 声明来源覆盖、来源失效与事件模式 → documentation D2 | 补真实 manifest/package/domain events；不再开发第二套完整语义引擎；依赖/能力/实际激活由各自生产验证器负责 |
| P1/P2 umbrella | G1 跨包/CLI、G2 声明验证 → 本轮验证摘要 | 删除重复状态；当前通过与未覆盖只在本轮摘要维护 |
| Cordis event ABI final acceptance | P00–P04 的历史证据保留于原 exec-runs；P05 retry/error CLI fixture 仍缺 | 转入技术债明确跟踪，SIGINT 或库级 retry 不替代进程级 retry/error 证据；fresh clean-room / packaged / 真实 Provider 等也必须按具体批次证据判断 |

## 明确保留的待办与非承诺

- CLI deterministic retry/error：需要真实 CLI 子进程接入可控模型 HTTP fixture，覆盖一次可重试错误后成功、最终错误退出、stdout/diagnostic 分离、Journal/replay 与资源释放。本轮无此 fixture，不标完成；见[技术债](../../exec-plans/tech-debt-tracker.md)。
- sourceRef 目前只校验文件，不解析 symbol。完整动态 consumer 图、任意跨包私有导入的语义证明未实现；取消统一矩阵引擎方案，后续发现具体失败再扩充对应守卫。
- 本轮构建测试的是当前工作树，不等于已提交 commit 的干净 checkout，也不证明签名/公证和真实云部署。
- 七个独立未来功能计划保持原状态；旧 Composer queue 页仅作历史链接入口，不继续维护另一份队列待办。

## 逐文件处置

短入口保留所有原路径，当前导航改到本轮计划或有效专题。无整份搬迁、无 histories/learnings 改链。原长文的独有目标按上表接收；脚本/生成器不读取这些计划正文，链接守卫在本轮复验。

| 原路径 | 处置 | 历史原文 |
| --- | --- | --- |
| `docs/exec-plans/active/20260829-actspace-p1-session-core-persistence/README.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-p1-session-core-persistence/README.md` |
| `docs/exec-plans/active/20260829-actspace-p1-service-roles/README.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-p1-service-roles/README.md` |
| `docs/exec-plans/active/20260829-actspace-p1-profile-bundle-patch/README.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-p1-profile-bundle-patch/README.md` |
| `docs/exec-plans/active/20260829-actspace-p2-contract-matrix/README.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-p2-contract-matrix/README.md` |
| `docs/exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p00-session-journal-acceptance.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p00-session-journal-acceptance.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p01-cordis-dispatch-acceptance.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p01-cordis-dispatch-acceptance.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p02-agent-loop-tool-runtime-acceptance.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p02-agent-loop-tool-runtime-acceptance.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p03-scope-subject-lifecycle-acceptance.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p03-scope-subject-lifecycle-acceptance.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p04-eventhub-removal-acceptance.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p04-eventhub-removal-acceptance.md` |
| `docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p05-cli-run-replay-clean-room-acceptance.md` | 缩为回溯入口；独有工作见上表 | `1bc434d:docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/p05-cli-run-replay-clean-room-acceptance.md` |
