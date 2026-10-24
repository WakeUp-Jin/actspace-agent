# Composer 与运行上下文规范对照

本项对应历史 09-P5-2。主智能体只读对照当前[聊天输入框规范](../../design-docs/frontend/front-聊天输入框规范.md)、[Workspace / Git / Worktree 规范](../../design-docs/frontend/front-workspace-git-worktree-context.md)与本轮实际交互报告，不新增 UI 通过结论，不用源码代签交互。

| 当前要求 | 本轮证据与判断 |
| --- | --- |
| 多行输入最高 200px，超出内部滚动；多行保持到内容清空 | [真实 Electron](cu-electron-20261022.md)记录 textarea clientHeight200 / scrollHeight354 / overflow auto。[后续输入区有限补验](host-git-followup-20261022.md)的09-P1-1行另验无显式换行228字、逐字Backspace至一字/空：458个input/rAF样本同节点、聚焦、caret=end，stacked保持到清空再inline。该连续路线已取证；不是原生IME或逐帧视觉无闪签收。 |
| Skills 可多选，选择后菜单不关；子页 Esc 返回，主页 Esc 关闭并回消息输入框 | 同报告实际 Enter 选择及鼠标追加两个 Skill、两级 Esc 稳定回焦。Tab、左右键、Backspace及循环已由后续批次补实证；现场根菜单无禁用项，未对不存在的禁用行声称操作过。 |
| 队列最多露四行、内部滚动；压缩中禁用引导并说明原因 | [审批队列专项](desktop-approval-queue-20261022.md)实际 clientHeight144 / scrollHeight180，聚焦第五行 scrollTop36；压缩期间禁用引导及悬停原因均有实证。 |
| 运行位置主菜单宽 240px，三个本机菜单不能被窄窗裁剪 | [Git 专项](desktop-git-20261022.md)480×800 时运行位置宽240、工作区宽260、分支宽300，右界均在窗口内。该宽度与可达性符合已测子点；Host 子菜单未配对，不代签。 |
| 非 Git 隐藏分支；无提交 Git 显示 symbolic branch 并禁用新工作树，说明需要先创建提交 | 同报告非 Git 无分支、空 Git 显示 main，两类禁用原因分别与规范一致。 |
| 本机分支选择延迟到首次发送才切换 | 同报告选择 feature-fixture 后磁盘仍 main，首次发送后磁盘为 feature-fixture，时机符合规则。 |
| 新工作树基于选择分支提交创建；对话中分支·工作树是只读事实；工作树hover/focus显示原工作区与base branch（workspace规范:56–61、189、276–282；输入框规范:140） | [首轮补批](host-git-followup-20261022.md)09-P4-4首轮恢复后completed，状态为actspace/63390151 · 工作树，hover/title为“原工作区：committed · 基于 feature-fixture”；磁盘branch/root一致。另有非空6消息正常重启逐ID恢复。后续实际Tab32次跳过来源标签，DOM为`SPAN tabIndex=-1`，键盘焦点无法显示来源，违反规范，记[BUG-029](bugs/BUG-029.md)；未声称截图捕获OS原生title气泡。右侧Review/文件树实际绑定source root见BUG-023；未用首轮完成终点代签“Created worktree”瞬时提示。 |
| 菜单互斥，关闭不抢被新浮层接管的焦点 | 主报告已有侧栏切换关闭 + / Context、空白区点外关闭不抢焦点。后续真实运行位置→+→模型、Context→模型路线已补，代表共性并明确具体路线；不追加全部两两组合的隐含要求。 |
| Plan/Chat chip和发送箭头随模式/主题着色，名称不是按钮，×独立退出回输入框（输入框规范:49、74、105） | [后续模式主题补批](host-git-followup-20261022.md)09-P1-3两行已有真实浅深：Plan黄字软黄底/黄底箭头；Chat绿字软绿底/绿箭头。深色Chat稳定复核与首次过渡截图已区分；不再列浅深chip“未操作”。cu-electron报告V03及模型报告“普通UI有限缺口批次”已验非按钮名称、独立×、Backspace退出与回焦；未以色彩样本声称重新量过所有24px/13px尺寸。 |
| 五类placeholder按模式/阶段切换（输入框规范:214–222） | Agent对话“继续追问…”及Plan“描述要规划的改动…”见[Electron报告](cu-electron-20261022.md)2026-10-22补充V03（第203行）。Chat“问点什么…”、运行“继续追问，运行中发送会进入队列…”及退出Agent后的“继续追问…”见[模型报告](desktop-models-settings-20261022.md)普通UI有限缺口批次V03行及chat-running.json；F7-stage-open-code/open-table原始DOM也保存运行句。上述四句与规范一致；后续[有限UI增量](desktop-models-settings-20261022.md)在已注册Acceptance Files工作区的真实Agent新建页记录完整“描述你要做的事，@ 引用文件，/ 调用命令”，与规范逐字相同，last-placeholder.json/png。未把各主题重复全部文案排列作为额外门槛。 |
| 档位请求、远端事实与可访问性 | 五用途、Composer High→HTTP reasoning=high已实证。有效远端状态/工作区事实仍缺安全有效Host；原生VoiceOver/IME分别没有实际系统观察，普通DOM名称/节点采样不代签。它们不使上述本机状态、chip、placeholder变为未操作。 |

已确认的弹层 Esc/焦点问题分别见 BUG-007、BUG-018、BUG-019；工作树分组的归档归属问题见 BUG-020，普通分叉列表身份见BUG-022，右侧执行目录见BUG-023，工作树来源焦点提示见BUG-029。这里引用已登记问题，不复制编号。

2026-10-23 状态更新：上述缺陷已经修复并定向复验关闭；BUG-029 的键盘可达、完整来源提示、Escape 和480 CSS px浅/深主题已通过[真实原生复验](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/bug-029-retest/REPORT.md)，上表保留修前证据。09-P5-2当前为部分完成，不能继续按修前缺陷记失败；安全有效Host的对应状态/文案、首次创建瞬时提示、hover-only及原生读屏/IME仍未覆盖。已有本机证据按上表保留，不新增全主题×全文案×全键盘排列门槛；本次为证据同步，未新增UI通过结论。
