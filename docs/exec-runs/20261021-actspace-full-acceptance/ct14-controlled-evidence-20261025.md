# C-T14规定确认及同实例六轮资源主审

2026-10-25，本批由正式计划§8“结束后保留内存持续增长，再做同规模3轮确认”触发；合同已在首请求前明确登记。只补截至50befa8c范围，不是后台任务新功能、不自动CT15。实际Sol/high的scope_performance独占桌面，仅取证；主侧唯一仓库编辑者。原始证据目录为`tmp/codex-acceptance/20261021-actspace-full-acceptance/scope-50befa8c-20261024/ct14-native/`，本页时刻为2026-10-24 UTC。

## 版本、资源身份与逐点结果

沿CT13同A8590079c-4555-4eca-9390-5a96555596ce、普通B2baadea0-9935-4827-8492-5ad59759ab34，同main84837/renderer84840/CDP55244、同profile/窗口/主题。HEAD7d3cc898含未提交BUG-052修复；2356源码SHA `e1cfe1e4a562eb90b6b030d9807e80406238238e9ea23f9c069f90209bcf9e67`、2350制品SHA `c6f24ceaa48990ca4e04950131eba14a35915c15cb2ac04557b3940727037c85`，逐文件核对不变，静态renderer无HMR。CT13旧7POST日志保留，旧Provider/观察器精确结束后才启动本批Provider7483/观察器7484；不得跨进程合并它们的资源。

| 验收点 | 结果、证据与边界 |
| --- | --- |
| CT14-1 | 通过：零POST基线、同A/同main及renderer/版本/设置，`baseline.ax.txt`、`CT14_BASELINE_ZERO`及`frozen-build.json`。不是新建干净profile。 |
| CT14-2 | 通过：三轮早段原生A→B→A/滚动，各首流4021→5044汉字、HTTP仍open才原生Stop，实收5149/5112/5149汉字、aborted；暂停POST保持1/3/5，显式继续才2/4/6；新message4052→5076汉字/open，最终各9810汉字/11863字符自然完成。`phases.jsonl`、原生AX/截图和HTTP分列。 |
| CT14-3 | 规定的确认负载与同阶段采样通过；三轮E/+30/+120后才下一负载，无强制GC/heap snapshot。资源结论仍受限，不能把采样完成当内存收敛通过。 |
| CT14-4 | 六条新HTTP送出正文=Journal=warm公开投影逐字一致，三条停止无丢尾、三条完成target exact。旧A/B全文及CT13 A原前缀不变；新A累计12终态turn/12step、tools0、标题auxiliary-start/end累计各1而本批新增0。原生退出及owned清理见本页最终闭环。 |

6main/0title/6POST、六marker各一次、halted=false；没有商业请求或工具执行，usage为fixture声明。`reconcile.json`、`journal-protection-result.json`及warm `export/`保存完整事实，不能称冷重启恢复或真实模型质量/计费。

E分别17:19:56.001、17:24:51.392、17:29:51.906；下一轮HTTP相对前轮E为+129.961/+140.439秒，最后无下一请求。人工完成偏移+268/+228/+193ms，最后+120人工晚2729ms，原字段取时差1–2ms照实保留；连续被动绝对目标样本另列。1971 UI观察、921资源样本，12个可信原生click均匹配预期状态，切换56.7–337.8ms、Stop74.2–252.4ms、继续55.1–262.5ms；均为250ms采样下首次已观察完成上界，不是paint或输入SLA，未外推所有交互。

## 六轮同阶段比较

目标后首个≤2秒资源样本，heap为bytes、RSS为KiB；另取每轮完整E+30..120窗口的heap最小/中位/最大，不择点消除增长。

| 批/轮 | E / E+30 / E+120 heap bytes | E+120 renderer RSS KiB | idle30..120 heap min / median / max |
| --- | --- | --- | --- |
| CT13 R1 | 22,080,744 / 21,125,192 / 24,144,928 | 249,952 | 18,692,496 / 22,705,476 / 31,139,040 |
| CT13 R2 | 29,715,128 / 43,140,080 / 26,903,792 | 260,032 | 20,463,540 / 31,417,020 / 55,078,792 |
| CT13 R3 | 46,239,832 / 24,522,672 / 37,542,428 | 285,808 | 22,589,056 / 28,582,320 / 38,373,160 |
| CT14 R1 | 33,015,512 / 29,802,952 / 36,542,436 | 237,616 | 23,629,212 / 29,892,600 / 40,876,788 |
| CT14 R2 | 46,132,868 / 27,268,920 / 31,629,732 | 271,664 | 25,112,944 / 32,412,776 / 43,011,540 |
| CT14 R3 | 40,324,020 / 26,603,652 / 30,708,052 | 252,272 | 26,603,652 / 30,493,078 / 41,379,124 |

CT14三轮firstAfter实际偏移依次+998/+570/+741ms、+927/+2/+931ms、+1099/+187/+347ms。main E+120 RSS分别321360/329296/388608KiB，与renderer分列。macOS ps %CPU为最长约一分钟衰减平均，不称瞬时或进程存续平均；各原值保存在`phase-resources.json`。

CT14 E+120 heap36.54→31.63→30.71MB，未复现CT13三轮24.14→26.90→37.54MB的单调上升；renderer RSS也不单调。但六轮idle窗口heap最小值18.69→20.46→22.59→23.63→25.11→26.60MB仍上升，main RSS另有增长，且对话历史由6条增加到12条assistant、没有可比GC/对象保留路径。结论为“规定的一次三轮确认完成；固定E+120持续单调上升未复现；稳定平台和泄漏均未证明”，不能关闭14-A5旧生命周期平台，也不能登记已证实内存泄漏。无自动CT15/新GC循环；进一步归因需要原场景合法对象owner/retaining path及可比保留工作集方法，不能重复同样负载求平台。

`resources-analysis.json`保存每请求当前正文双点、相对首个实际4000点增长≥1000及HTTP open；`phase-resources.json`的nearest与firstAfter分开；`six-round-comparison.json`含六轮E/+30/+120及完整空闲分布；`interaction-observations.json`保存可信事件匹配。三轮所有+120前均无下一POST，无峰值、GC事件或绘制性能声明。

## 最终闭环与剩余范围

观察器7484在最后+120后SIGTERM正常结束exit0，随后只读导出，防止export干扰性能窗口。原生CmdQ请求17:34:52.139Z，main84837于17:34:52.324Z正常exit0/signalnull，main/renderer均消失。Provider7483及driver84834按精确命令归属SIGTERM清理；Provider exit0，driver包装进程随后exit1，后者是清理结果，不冒称应用退出失败或driver正常成功。`owned-cleanup.json`、`native-exit-status.json`、原ct13-native/app-exit.json和`post-verify.json`分列渠道。桌面释放，未安装、提交、推送或发布。

受控原子路线补齐不代签商业Provider恢复中段缺样、真实LLM语义/成本、14-A5收敛、未交付F9/T4、OS授权/人工跳过。F7-03/P2-P01复合行仍部分覆盖；原165行104通过/0失败/61部分或未覆盖保持，52Bug51关闭，仅039用户自行验收未关闭。Goal尚未完成，逐编号原因、证据和最小条件见[范围台账](scope-50befa8c-20261024.md)。
