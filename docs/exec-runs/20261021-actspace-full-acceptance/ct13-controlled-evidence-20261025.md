# C-T13受控同实例三轮证据主审

2026-10-25，本批补正式§8 T2的同会话/同PID三完整轮共同路线；C-T12原partial保留。功能范围仍截至50befa8c，不纳入新后台任务。证据目录：`tmp/codex-acceptance/20261021-actspace-full-acceptance/scope-50befa8c-20261024/ct13-native/`。本页时间为2026-10-24 UTC，原生操作者实际Sol/high，主侧唯一仓库编辑者。

## 绑定版本和逐点结果

HEAD7d3cc898含未提交BUG-052修复；2356源码SHA `e1cfe1e4a562eb90b6b030d9807e80406238238e9ea23f9c069f90209bcf9e67`，2350制品SHA `c6f24ceaa48990ca4e04950131eba14a35915c15cb2ac04557b3940727037c85`，`frozen-build.json`/`post-verify.json`全部逐文件不变，index为空。静态renderer无HMR，main84837/renderer84840/CDP55244；profile为已退出CT12的owned合成副本，新workspace/ABB及原生新A8590079c-4555-4eca-9390-5a96555596ce，复用普通B2baadea0-9935-4827-8492-5ad59759ab34。旧A/B Journal逐字节未变；不称干净profile。Provider84831/63780为本地确定性OpenAI Chat服务，无商业凭据或真实模型生成。

| 验收点 | 结果与必要证据 |
| --- | --- |
| CT13-1 | 通过：原生正常新建A，复用既有连接/模型/用途及B；同A同PID三轮，无B请求，`G1-new-A-unsent.ax.txt`和`phases.jsonl`。 |
| CT13-2 | 通过：三轮首流早段A→B→A/原生滚动；各当前message≥4000汉字后增长≥1000、HTTP仍open才原生Stop。三条STOP Journal为aborted，HTTP closed/completed=false；不是自然结束冒充停止。 |
| CT13-3 | 通过：三次原生发送后显示暂停，POST保持2/4/6，点击继续后才3/5/7。新回复每条4052→5076汉字且open，最终每条9810汉字/11863字符完整结束；新旧message/runId分列。 |
| CT13-4 | 通过限定方法：各轮HTTP结束E/+30/+120有连续被动UI和资源，+120前无下一请求；六条Provider送出正文=Journal=warm公开投影逐字一致，三条完成target exact、三条截断无丢尾。资源见下表，不能签收敛或泄漏。 |
| CT13-5 | 版本/预算/事实保护通过：7POST=6main+1title，各marker一次，无halt/额外B请求；新A6终态turn/6step、toolEvents为空、工具执行0、标题auxiliary-start/end各1。Provider/观察器已精确正常结束，应用保持同实例交接C-T14；原生退出/driver清理合并在该后续批末尾，不冒签已退出。 |

## 三轮同阶段与内存确认触发

| 轮 | 首流当前汉字双点→STOP实收 | 恢复HTTP E | E/+30/+120 firstAfter heap bytes | E+120 renderer RSS KiB |
| --- | --- | --- | --- | --- |
| 1 |4094→5112→5149|16:57:22.329|22,080,744 /21,125,192 /24,144,928|249,952|
| 2 |4021→5044→5080|17:02:47.488|29,715,128 /43,140,080 /26,903,792|260,032|
| 3 |4021→5044→5112|17:08:09.876|46,239,832 /24,522,672 /37,542,428|285,808|

取资源绝对目标后的首个≤2秒样本；偏移分别为R1 +505/+325/+757ms、R2 +1013/+75/+1253ms、R3 +245/+317/+499ms，nearest样本与firstAfter分列，不能把目标前的nearest当目标后。main E+120 RSS分别318640/281984/289152KiB，未与renderer相加或跨PID合并。采样为250ms有界当前树/DOM、1s ps和CDP Runtime.getHeapUsage；没有GC、heap snapshot或峰值声明。macOS `man ps`核实%CPU是最长约一分钟衰减平均，纠正先前“进程存续平均”解释；原数值不修改。

2537 UI观察/1491资源样本；原生可信click→首次匹配的被动状态观察为A/B切换39.3–238.1ms、Stop110.5–199.6ms、显式继续49.1–221.9ms。它们是250ms采样下的已观察状态完成上界，不是绘制或输入SLA。未出现这些动作超过1秒可复现无响应，但不外推全部交互性能。原生截图/AX与只读当前树、HTTP、离线对账各自标明。

E+120 heap及renderer RSS连续增长，触发正式§8规定的同规模三轮确认。历史正文随轮数增多、未GC和采样位置均限制解释，不能登记为已证实内存泄漏。主侧已单独登记C-T14一次6main/0title/6POST、保持同A/PID和版本的确认合同，见[调度](dispatch.md)；不自动追加更多轮次，也不代签14-A5旧生命周期平台。

## 证据局限与原始记录

`native-report.md`逐点列原生路线、当前运行态ID→UI终态v2-ID→Journal实际UUID的区别、人工时点和错误。R1状态文件写入中读取曾出现JSON SyntaxError，原请求继续，采用有限只读解析重读在同请求内完成阈值→Stop，没有重发；原错误不隐藏。人工完成观察R2比E晚23.286秒，+120人工记录晚34.449秒；R3 +120晚4.765秒，连续被动目标相位独立存在，不能用晚到截图冒称精确人工时点。下一轮真实HTTP分别在前轮E后134.454/165.036秒。

原生证据为`R*-early-route.ax.txt`、`R*-stopped.*`、`R*-paused.*`、`R*-continue-midstream.png`、`R*-completed.png`、`R*-idle120.png`。HTTP与逐字对账为`provider-transcripts.json`、`events.jsonl`、`export/`、`reconcile.json`；只导出warm公开投影，不称冷启动。资源和可信事件为`observations.jsonl`、`resources-analysis.json`、`phase-resources.json`、`interaction-observations.json`；新补离线分析不修改原始事实。

本批不代签商业Provider恢复中段缺样、真实LLM质量/成本、14-A5收敛、F9/T4未交付、系统授权/人工跳过；F7-03/P2-P01等复合原行仍部分覆盖。原165行104/0/61及52Bug51关闭保持，BUG-039由用户自行验收且未关闭。单批完成不表示Goal完成。

最终退出已由同实例[C-T14闭环](ct14-controlled-evidence-20261025.md)完成：原生CmdQ后main84837于17:34:52.324Z exit0，renderer消失，owned Provider/driver精确清理。该补记不改变CT13当时保持存活交接的事实。
