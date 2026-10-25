# C-T12 受控长流增量证据（2026-10-25）

功能范围截至50befa8c，实际HEAD7d3cc898加未提交BUG-052修复。只补F7-03/P2-P01的可独立受控性能子步骤，不替代真实商业端点，也不覆盖未交付F9/T4。原165编号和104通过/0失败/61部分或未覆盖保留。

## 版本、方法与结果

本地证据根为`tmp/codex-acceptance/20261021-actspace-full-acceptance/scope-50befa8c-20261024/ct12-native/`。完整2356源码SHA `e1cfe1e4a562eb90b6b030d9807e80406238238e9ea23f9c069f90209bcf9e67`、2350制品SHA `c6f24ceaa48990ca4e04950131eba14a35915c15cb2ac04557b3940727037c85`，结束逐文件未变，index为空。静态Electron main59803/renderer59824，owned profile/workspace、Provider63780/CDP55242；无HMR或商业请求。实际Sol/high只做原生操作与独立取证，主侧唯一编辑。

| 验收点 | 结论及证据 |
| --- | --- |
| CT12-1 | 通过：原生创建连接/模型/用途，真实B短任务及A长任务，不注入Session。 |
| CT12-2 | 部分：同A和PID三次首流，R1/R2因操作轮次延迟自然完成，停止/暂停/继续未执行；不是Stop产品失败。仅R3完整原生停止→真实暂停→显式继续。不能签连续三完整轮。 |
| CT12-3 | R3首流4021→5044汉字、恢复新消息4017→5040汉字，均同消息增长1023且HTTP open，原生及被动旁证通过。R1/R2中段及增长由被动观察器另有记录，不倒签其原生完整停止路线。 |
| CT12-4 | 5条assistant/message全部与Provider实际送出正文、warm公开投影逐字一致。R3停止5112汉字/6160字符，finishReason=aborted；续流9810汉字/11863字符完整结束。R1/R2自然结束及R3续流的E/+30/+120绝对时点被动资源齐全；人工E/+30有延迟，报告明确保留，不冒签精确人工时点。 |
| CT12-5 | 通过限定边界：7POST=5main+2title，2套auxiliary-start/end，5turn均终态；tools=0且Journal无工具执行事件。23项工具定义不等于执行。usage为合成，不算真实token/cost或商业速度。 |
| CT12-6 | 通过：原生CmdQ 16:33:17.787Z exit0，主/renderer消失；主侧按精确归属结束Provider59796/driver59800。观察器随CDP关闭结束。 |

## 采样解释与剩余

250ms有界当前树/DOM及可信事件观察、1s ps RSS/CPU与Runtime.getHeapUsage；无强制GC/heap snapshot。资源时点与HTTP结束绝对时间对应，偏移实际保留于`resources-analysis.json`，是采样值而非峰值、绘制SLA或泄漏结论；本机macOS `man ps`核实%CPU为最长约一分钟的衰减平均，不能视为精确瞬时CPU或进程存续平均。1327资源样本、2108 UI观察，观察往返median3.37ms/p956.17ms/max75.07ms。采样自身成本存在，不与商业旧样本跨PID合并。

逐点原生报告为`native-report.md`，HTTP为`provider-transcripts.json`/`events.jsonl`，Journal及warm公开投影为`export/`，逐条对账为`reconcile.json`，版本为`frozen-build.json`/`post-verify.json`，退出及清理为`app-exit.json`/`native-exit-status.json`/`cleanup.json`。warm snapshot不能称冷启动投影。原始阶段误名END_IMMEDIATE已追加TIMING_CORRECTION，原数据不覆盖。

本批停止预算不等于没有可执行路线。R3已证明及时原生停止方法可行；主侧已完成必要性审查，另行明确派发C-T13七POST上限三轮补批，结果待主审；不自动重试或将本批partial抹去。商业恢复正文相位、原同实例三完整轮及14-A5无平台等缺口各自保留；BUG-039用户自行验收，仍未关闭。
