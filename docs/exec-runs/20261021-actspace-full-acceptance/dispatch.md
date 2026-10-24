# 并行验收调度与剩余项映射

当前执行状态（2026-10-24，用户最新要求）：**验收暂停，Goal已置为paused；本次仅授权保存一个本地commit，不推送。** 晚间待用户主动继续，不自动恢复或启动新批次。此前持续执行安排在暂停期间不生效，恢复后仍遵守无人值守跳过规则；验收统计与未完成边界不变。详见[暂停与提交断点](pause-checkpoint-20261024.md)。

当前调度（2026-10-24，最新指令）：**无人值守；需系统密码、系统授权或用户现场配合的子步骤直接用户跳过，不提问、不等待、不反复触发弹窗。** 其他可自主完成的独立工作继续，非授权类前提各自保留，整体验收未完成。104通过/0失败/61部分或未覆盖，51Bug中50关闭；BUG-039工程已修复、用户跳过真实复验且未关闭。跳过不是通过或不适用。详见[当前规则与逐项清单](unattended-policy-20261024.md)；旧Goal状态及人工授权安排仅为历史。

## 当前断点（2026-10-24，BUG-051已关闭）

最新无人值守规则优先于本页历史调度：22个直接受系统凭据授权影响的编号及2个汇总项见[清单](unattended-policy-20261024.md)，下方逐编号状态已更新。人工Host授权批次已取消且未启动服务；不再等待SecurityAgent处理。其他需用户现场配合的OS步骤同样跳过，不撤销已通过步骤，不降低必需方式。Goal完整文本见[替换文本](goal-unattended-20261024.md)，应用保存的旧objective尚未能由工具直接修改。

实际Sol/high只读[61项复核](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/unattended-scope-audit-high/report.md)已经主侧审查：当前没有具备新条件且能带来新信息的无人值守候选；授权/人工子步骤直接跳过，其他设备/交付/凭据/性能/方法缺口仍逐项保留。不重复旧调用，不把只读审查或文档同步当全面验收完成。

104通过/0失败/61未完成，51Bug50关闭，仅039工程已修复、待用户手动复验，快捷唤起路线按用户要求跳过。当前无验收批占桌面；本批固定源码cd43ecdb/制品b4acff27，详见[最新闭环](historical-image-evidence-20261024.md)。旧调度段按发生时间保留，不能据其“当前”措辞重启已完成批次。剩余项的验收结论与资源等待仍分开，逐点最小条件见[剩余前提](remaining-prerequisites.md)。

## 此前断点：BUG-050关闭后的历史调度（2026-10-24）

[H/Usage主审](performance-query-evidence-20261024.md)完成H1/H2/U1/U2，2721冻结条目及原/副Journal不变，无模型请求或新Bug。main50861已正常退出，observer已停止、桌面释放。真实Memory Collect garbage按钮可达；尚未执行GC，14-A5仍未覆盖。

C的[Context查询主审](performance-context-evidence-20261024.md)完成明细、原文、路径两组与同阶段重挂计时。main78882/renderer78923已正常退出，Provider78726与observer均结束；只有1次本地HTTP主请求。原Journal、112个原文件及2721冻结条目不变，运行副本仅追加正常事实，原生桌面已释放。context_performance_native_high实际Sol/high/none，无产品Bug。

G1的[真实原生手动GC主审](performance-memory-evidence-20261024.md)完成2预热+12生命周期及四次Memory按钮，28本地HTTP在预算内；同阶段heap仍升、未见平台，14-A5继续未覆盖。2721冻结条目无漂移，observer/main15657/renderer15697/Provider15471均结束并释放。当前独占桌面为09菜单几何：main42074/renderer42107、CDP55091只读，独立profile/workspace palette-geometry-native-20261024，12无害Skills、零模型请求；原生Sol/high有限验证合法最小高度下的+主页/Skills及最多一次未发送草稿，不解锁高度、不用模型菜单代签。

## 最新本机批次：LOCAL-LIFECYCLE（2026-10-24，已释放）

[主审证据](local-lifecycle-evidence-20261024.md)完成11-A4/11-B1：冻结源码298条24a1e8a4、制品2423条56bbfa4f未漂移。独立profile为parallel-20261023/local-lifecycle-20261024/profile，main32170、shell36957；真实终端→B Review/刷新→Files/TARGET→显式B Review→隔离Bridge连接诊断→一次原生⌘Q。实际lifecycle_native_high为Sol/high/none；16:24:18.943Z code0，所有旧owned PID退出。只读进程采样结束，driver在应用退出后才停止，桌面已释放。短abb自然结束，Git PID未采到，不冒称退出瞬间活跃Git/abb中止。

前一LOCAL-NATIVE批PID13238/CDP51346已清理并释放：附件PNG/TXT反例受GoToWindow路由限制未到达，hover接口无move，modal下⌘Q未退出；后来app.close仅清理，不计通过。两批17原fixture文件、用户Chrome登记及2721冻结状态均未变，无Provider请求。

11-B1原范围为已有历史worktree树/预览/Review，来源审查未找到旧header迁移要求；当前原字节B样本已真实三步复验，按原范围签收。Created/Creating worktree过程块仍为未交付展示目标，不反复首轮造样或临时补功能凑覆盖。Host/IME/真实读屏/hover与附件反例继续保留。

## 最新原生批次：Context成功重试完成，资源已释放

F3-02已通过并释放。Context实例PID76528/CDP54838、同自有bug038 app/profile sidebar-pagination-native-20261023，冻结构建56bbfa4f/2721状态条目无漂移。session70371c27-885c-4943-8a23-cac10a1ebdc3的CR1–4主审通过，Provider仍8请求/无pending；原Journal同inode/281221字节/SHA恢复、held不存在。子智能体已恢复UI并释放桌面，主侧正常结束controller78103、关闭应用并确认退出后停止driver；sampler87230已自行结束，以上三个PID均不存在。

本批由实际gpt-6.1-sol/high的context_native_high执行CR1健康基线、CR2真实错误及失败重试、CR3恢复源后立即原生成功重试及轮询因果、CR4事实/请求/构建与UI恢复，见[主审证据](context-retry-evidence-20261023.md)。第一窗口因观察器缺陷中止且原样保留，不计产品失败；修正后有效窗口排除5000ms轮询和pending分支。独立context_retry_audit_high同为实际Sol/high，只读核对P2-D10原行与引用范围后，主审已签收聚合项。

## 最近原生批次：BRIDGE-READ（已释放）

BUG-049工程与真实CLI复验及独立只读审查已完成并关闭；主侧只维护文档，不修改当前验收制品。专用Chrome已正常启动，Desktop路径下Native Host脚本曾被OS拒绝读取，因此仅将自有测试Host/profile迁到新临时根，不修改用户全局manifest或权限设置。实际根`/private/tmp/actspace-bridge-read-eoj_q1ly`、PID33508、CDP60978、extension eneeikpgpieikinaimmgmdiafbgbanei、socket s-9148a447492f05e7.sock；1872文件冻结SHA25645003f8339aea70804eac7b10f800d0577a1697c2a0accaa24e40de2163eefe3。Bridge创建的owned tab380651238使用自有fixture URL加`owned=BR1`。

原派发给web_native（明确gpt-6.1-sol）的BR1–5为窗口/焦点、两种剪贴板读取、权限和恢复；实际两次原生绑定均超时，未执行读取、未触及剪贴板。专用Chrome/Host/driver均已结束。以上创建事实和派发要求不是执行成功证据，B-58/B-60仍未覆盖；P2-B01/03也不通过。见[实际终态报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/bridge-read-native/report.md)。无新能力不重复同条件绑定，不转CDP代签原生焦点或权限。

2026-10-23 用户批准并行验收、串行修复、统一回填。本表只管调度，不改变[coverage](coverage.md)中的验收结论、编号、范围或复合子步骤。初始69个未完成编号已全部映射；本轮3项通过后发现的P2-C02新边界已修复并复验关闭，当前103通过/1失败/61部分或未覆盖；新增BUG-050进入串行修复与原生复验队列。

## 调度规则

新增native_method_gate_high与local_fixture_preflight_high均实际model=gpt-6.1-sol、reasoning_effort=high、fork_turns=none。前者独占桌面做受支持原生方法门核对并关闭唯一owned81736，不调用模型；后者只读准备F1-09/P2-R02/09-P6-1独立夹具，不占桌面、不重建、不操作服务。两者均只写各自证据目录。

2026-10-24实查：R50报告已返回，当前无旧验收子智能体运行。新派r50_evidence_audit_high实际model=gpt-6.1-sol、reasoning_effort=high、fork_turns=none，仅在独立证据目录只读审查，不占桌面。主侧核对冻结版本与事实后回填；BUG-050尚未关闭。

BUG-050修后批R50-1–5已启动：原始Sol/high的`context_performance_native_high`独占桌面，main81736/renderer81783、CDP55092、独立`bug050-native-20261024/profile`；源码`c5152219`、构建`d043744e`，完整清单在同名本地根。全量2 worker2007项及类型/renderer构建已通过，期间不覆盖制品、不进行共享代码修复；BUG-050仍待真实复验，09-P3-4条件性翻转不由组件样例代签。

- 主智能体是唯一仓库编辑者，逐个修复Bug并维护代码、测试、配置、设计、history及公共台账。子智能体仅验收取证，在自己的独立证据目录写报告/截图，不修改共享文件。
- 所有验收子智能体明确指定`gpt-6.1-sol` + `high`；实际派发同时设置`model="gpt-6.1-sol"`、`reasoning_effort="high"`，不以任务文字代替参数。不可用或无法设置则报告，不静默降级或换Astra。按实际槽位派发，本环境最多3名子智能体同时运行；人员可复用，不固定绑定某类场景。
- 复用前核对原始启动配置并保留派发记录；follow-up不能改模型或推理等级。配置不符或无法确认时，在安全检查点结束旧批次，再新建明确Sol/high的子智能体，不能用消息声称已升级或倒标历史证据。
- 每批先列验收点、来源、预期和必需方法，再说明操作分组。场景不是方法：Host协议、Web连接和Desktop远端交互分别签收。资源忙则等待或领取其他任务，禁止把原生项目降级成浏览器/mock/CDP/源码检查。
- 同一桌面只有一名原生操作者；系统焦点、快捷键、剪贴板、主题、文件对话框、音频等共享资源需独占。独立profile不等于独立桌面；原生剪贴板与Browser剪贴板不可同时使用。
- 并行前核对profile、端口、工作区、Host、服务控制和制品不重叠。性能采样独占相关整机负载；不在重建/全量测试期间声称可比性能。
- 每批绑定源码和制品哈希；只有独立固定制品验收才与修复重叠，禁止覆盖验收制品、HMR或改动共用服务。无法隔离时先结束批次再编辑/重建；受影响旧证据标需复验。
- 子智能体交回逐项结果后即可领取独立下一批，不等主智能体修完。主智能体去重排队，优先严重/阻塞范围大的问题；修后进入复验队列，可由另一合适子智能体执行。复验通过且原子步骤齐全才关闭或勾选。
- 连续执行：单批完成后继续调度下一批；进度提问、约束调整和文档整理不作为Goal完成。不得重复输出启动/续接指令要求用户重开Goal；已有未完成目标保持原范围。历史证据不倒标High，安全交接后新派发才使用明确High参数。
- 调度状态：待执行、等待资源、执行中、待修复、待复验、完成、用户跳过（自行验收/系统授权/人工配合）。用户跳过须记录明确指令、范围和结果边界，不作为通过或不适用。外部前提写在条件列，不把“等待资源”写成通过；验收结论仍只有通过/失败/未覆盖。执行者未派发记未分派，不代表已经启动。

## 版本与资源登记

- `V0`：本轮只读盘点的dirty源码，HEAD `00d6b763`，source SHA256 `6af5577e1e0199563186af48ec15665e33e6171c64ed1f7642d0b758ac64d0c5`。完整清单及diff在本地`tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/baseline.json`与`baseline.diff`，不随仓库分发。
- `V0`不是运行版本证明；派发真实批次前补实际制品SHA256、PID/应用身份、profile、端口和服务所有权。文档修改不改变源码指纹；代码修复后另记新版本，不能沿用V0签收。
- NATIVE-REVIEW/NATIVE-048/NATIVE-DISCARD/NATIVE-COPY/F3/Context及LOCAL-LIFECYCLE均已结束并释放，BUG-049亦已关闭。T3-H/USAGE和C亦已退出并释放，09菜单几何批次亦已正常退出释放；BUG-050修复完成后另登记新制品再派原生复验。旧Provider24857/63493及control63494、Web独立Host20555/fixture86369不纳入本批资源，不发新模型请求或操作剪贴板。

## 路线契约

每个编号继承本表的必需方式、资源、V0基线及条件，实际执行版本在批次记录更新。路线内仅共享环境准备，不合并验收结论；原表每个分号步骤仍逐项核对。多资源路线先做可独立子项，缺口不扩大为整条不可执行。

| 路线 | 场景 | 必需验收方式与证据 | 占用资源 | 前置条件及修复影响 |
| --- | --- | --- | --- | --- |
| N-恢复 | Desktop | 真实 Electron CU；Journal/HTTP只读对账 | 桌面、隔离profile、54838、63493/63494、固定renderer | 当前构建加载后执行；BUG-047修复需复验；不得覆盖原生批次制品 |
| N-快捷 | Desktop/OS | 真实OS快捷键→Electron CU；观察窗口/焦点/过滤结果 | 桌面、全局快捷键、隔离profile、固定main/renderer | 2026-10-24用户跳过，由用户自行验收；不再派发；注册/handler成功不能代签 |
| N-输入 | Desktop/OS | 真实中文候选、原生粘贴/拖放/文件选择及Electron CU | 桌面、输入源、剪贴板、文件对话框、隔离附件 | 有候选/拖放实际证据才签对应子项；现有选图/粘贴结果保留；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| N-无障碍 | Desktop/OS | VoiceOver真实输出与Electron CU | 桌面、VoiceOver、系统音频、字幕或可听输出 | 需观察真实朗读；AX/DOM名称不代签；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| N-生命周期 | Desktop/OS | 原生Dock/退出/重开；自有进程与Journal对账 | 桌面、Dock、隔离profile、终端/Browser子进程 | 原生Dock路径尚缺；不同终点分别留证；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| N-声音 | Desktop/OS/服务 | 真实英语学习/音频播放停止/通知/快捷唤起与CU | 桌面、音频、通知、专用服务配置 | 真实可听音频/通知等各自证据；快捷子项按用户要求跳过，其余保留；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| N-错误 | Desktop/Host | 真实Electron CU；受控故障/receipt时序；原事实恢复核对 | 桌面、独立profile/故障副本、受控服务 | F3零事件无摘要、Context错误成功重试、14-A3扣留接纳回执分别构造；不改产品凑场景 |
| N-Host | Host/Desktop | 协议检查加真实Desktop配对/远端CU；两类证据分开 | 桌面、SecurityAgent、专用Host/profile/端口/远端目录 | 有效Desktop配对受系统授权工具限制；五Host/IME、SSH、上传下载各按原要求核对；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| N-Review | Desktop/Git | 真实Electron CU；专用仓库磁盘与Git对账 | 桌面、专用Git仓库、固定renderer | 仅测试仓库stage/unstage/discard；缺upstream/冲突按原子要求执行 |
| N-设置 | Desktop/Host/OS | 各设置页真实CU与持久化/行为对账 | 桌面、隔离profile；Host/声音资源按子项申请 | 按原台账已完成项续验；远端、音频和凭据缺口分别挂接；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| N-布局 | Desktop | 真实Electron CU；当前规范逐处核对 | 桌面、窗口尺寸、固定renderer | 09-P3-4先核对当前可达最小高度；规范复合项不越过Host/IME/AX缺口 |
| A-聚合 | Desktop/Host/侧边对话 | 复用明确版本的逐项证据；缺少的按原方式真实验收 | 只读核对；补验时申请实际资源 | 子项全齐才完成；P2-D12依赖F9，09-P5-1依赖P1–P4 |
| W-真实 | Web/Host | 真实浏览器与隔离Host；HTTP/Journal对账 | 独立浏览器profile、Host/端口/数据、固定Web制品 | P2-W02沿原剩余子步骤；不能用Desktop mock代签 |
| W-设备 | Web/PWA/OS | iPhone Safari/Tailscale与PWA真实安装更新/通知 | 真实设备、网络、浏览器存储、系统通知 | 缺真机；桌面窄屏不代签；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| B-扩展 | Browser Bridge/OS | 真实Chrome扩展+bridge/CLI；62 action细表逐项 | 专用Chrome/profile、bridge、fixture、下载；剪贴板/授权弹窗独占桌面 | B-58/B-60真实读取仍缺；P2-B01/03其他授权与隔离子步骤按原表保留；最新无人值守规则：需用户授权/现场配合即跳过，不等待；已有证据保留 |
| R-数据 | Desktop/可靠性/安全 | 隔离历史副本、生产装配/迁移、真实Electron CU与哈希 | 历史副本、隔离profile/索引；CU期间独占桌面 | 真实旧加密凭据、重建瞬态仍缺；11-B1已有历史worktree三项通过；F6-02最终整合依赖F9 |
| X-服务 | Desktop/商业服务/Git | 真实服务与Electron CU；专用GitHub PR路线 | 桌面、可恢复专用凭据/余额、专用GitHub远端 | F1-09缺部分余额/错误与计费；17-A5不清除现用Key；11-B2不向产品仓库发测试PR |
| F-整合 | Desktop/侧边对话 | 最终整合版真实Electron CU及性能/恢复 | 最终整合源码/固定制品、独立profile、多会话服务 | 交付门槛未满足；不负责合并独立分支，不以demo代签 |
| P-性能 | Desktop/性能 | 计划§8同阶段CPU/RSS/heap/功能采样及真实CU | 整机采样窗口独占；固定负载/profile/制品；停止其他重负载 | 14-A5需同阶段手动GC收敛；T4/F9未交付；只报真实可核实阶段 |
| R-制品 | Desktop/安装 | 满足macOS执行要求的真实制品启动/恢复/资源验收 | 可运行制品、隔离profile、桌面 | 现制品未签名被AMFI拒绝；不自动签名/发布/升级安装版 |

## 逐项分派表

下列编号的完整验收要求、已完成子步骤、未完成子步骤和原证据继续以[coverage](coverage.md)对应行及[剩余前提](remaining-prerequisites.md)为准。本表没有删减或替换原要求；派发任务必须带上原行全文及相关报告。

| 编号 | 路线（含方式/资源/条件） | 验收基线 | 调度状态 | 执行者 |
| --- | --- | --- | --- | --- |
| F1-01 | R-数据 | c5152219/d043744e，migration-native独立profile/55122/55123，无secrets | MG1–5完成；旧OS密文字节另等待 | migration_native_high（实际Sol/high） |
| F1-09 | X-服务 | c5152219/d043744e，fee-native独立profile/55112/55113，见下方FC合同 | FC1–5完成；余额/错误/其余用途等待相应服务 | fee_native_high（实际Sol/high）+主审 |
| F3-02 | N-错误 | f3-empty-desktop冻结构建56bbfa4f | FE1–3及原范围主审通过；已释放 | f3_restore_high / f3_high_audit；实际Sol/high |
| F4-01 | N-快捷 | V0；运行制品待登记 | 用户跳过人工子步骤：快速打开/系统全局快捷唤起；其余见coverage | 不请求现场配合；已完成证据保留 |
| F6-02 | R-数据 | V0；运行制品待登记 | 待执行 | 未分派 |
| F7-02 | N-恢复 | V0；1559942b构建/PID95881 | 已完成，coverage通过 | bug047_native/主审查 |
| F7-03 | P-性能 | 56bbfa4f；[H/Usage](performance-query-evidence-20261024.md)及[C](performance-context-evidence-20261024.md)已补，G1执行中 | 部分已验，继续补验 | 主侧/实际Sol-high |
| F9-01 | F-整合 | V0；运行制品待登记 | 待执行 | 未分派 |
| F9-02 | F-整合 | V0；运行制品待登记 | 待执行 | 未分派 |
| F9-03 | F-整合 | V0；运行制品待登记 | 待执行 | 未分派 |
| F9-04 | F-整合 | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；整合版远端入口禁用的真实Desktop验证；最终F9未交付仍另记 | 不派发/不等用户；历史执行者及证据见coverage |
| F9-05 | F-整合 | V0；运行制品待登记 | 待执行 | 未分派 |
| P2-D03 | N-快捷 | V0；运行制品待登记 | 用户跳过人工子步骤：快捷唤起及仍需人工的原生拖拽；其余见coverage | 不请求现场配合；已完成证据保留 |
| P2-D04 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：真实中文IME候选、人工原生拖放；其余见coverage | 不请求现场配合；已完成证据保留 |
| P2-D10 | N-错误 | context-retry冻结56bbfa4f；本轮应用/controller已关闭 | 原生CR1–4及原行聚合主审通过；资源已释放 | context_native_high / context_retry_audit_high；实际Sol/high |
| P2-D12 | A-聚合 | V0；运行制品待登记 | 待执行 | 未分派 |
| P2-D14 | N-Review | V1；d1922158构建/PID95881 | BUG-048已关闭；discard及其他缺口续验 | bug047_native/主智能体 |
| P2-D16 | N-设置 | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Host设置有效添加/重连/移除；其他设置证据保留 | 不派发/不等用户；历史执行者及证据见coverage |
| P2-D18 | N-声音 | V0；运行制品待登记 | 用户跳过人工子步骤：快捷唤起、真实可听音频/朗读/停止和需人工的通知授权；其余见coverage | 不请求现场配合；已完成证据保留 |
| P2-D19 | N-生命周期 | V0；运行制品待登记 | 用户跳过人工子步骤：当前工具不能执行的确切Dock重开；其余见coverage | 不请求现场配合；已完成证据保留 |
| P2-D20 | N-无障碍 | V0；运行制品待登记 | 用户跳过人工子步骤：VoiceOver实际输出；其余见coverage | 不请求现场配合；已完成证据保留 |
| P2-H01 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Desktop有效配对、在线/离线/撤销与选择器；Host/Web旧证据保留 | 不派发/不等用户；历史执行者及证据见coverage |
| P2-H02 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Desktop远端发送、审批、文件、离线/重连/移除及历史 | 不派发/不等用户；历史执行者及证据见coverage |
| P2-H03 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Desktop远端启停/维护/恢复与SSH UI；协议进程证据保留 | 不派发/不等用户；历史执行者及证据见coverage |
| P2-W02 | W-真实 | Web制品c5985d59/Host20555 | 已完成，coverage通过 | web_native/主审查 |
| P2-W04 | W-设备 | V0；运行制品待登记 | 用户跳过人工子步骤：当前工具不支持、需人工的安装/独立窗口及更新可见切换；iPhone设备缺失另记；其余见coverage | 不请求现场配合；已完成证据保留 |
| P2-B01 | B-扩展 | V0；运行制品待登记 | 待执行 | 未分派 |
| P2-B02 | B-扩展 | V0；运行制品待登记 | 待执行 | 未分派 |
| P2-B03 | B-扩展 | V0；运行制品待登记 | 待执行 | 未分派 |
| P2-R01 | R-数据 | 当前c5152219/d043744e防重+各原批历史版本，见[闭环](reliability-closure-20261024.md) | 已完成；验收通过 | 主侧执行/主审，r01_closure_audit_high只读核查 |
| P2-R02 | R-数据 | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Desktop远端附件边界及需OS解密授权的凭据迁移；本机安全证据保留 | 不派发/不等用户；历史执行者及证据见coverage |
| P2-R03 | R-制品 | V0；运行制品待登记 | 待执行 | 未分派 |
| P2-P01 | P-性能 | 56bbfa4f；[H/Usage](performance-query-evidence-20261024.md)及[C](performance-context-evidence-20261024.md)已补，G1执行中 | 部分已验，继续补验 | 主侧/实际Sol-high |
| 11-A2 | N-生命周期 | V0；运行制品待登记 | 用户跳过人工子步骤：确切Dock点击重开；其余见coverage | 不请求现场配合；已完成证据保留 |
| 11-A4 | N-生命周期 | LOCAL-LIFECYCLE冻结298/2423；main32170已真正退出 | LC1–4及原行主审通过；已释放 | lifecycle_native_high / 主审；实际Sol/high |
| 13-A2 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Desktop有效配对至移除连接的整条远端路线 | 不派发/不等用户；历史执行者及证据见coverage |
| 13-A3 | N-声音 | V0；运行制品待登记 | 用户跳过人工子步骤：英语学习实际朗读/可听音频及需人工的服务授权；其余见coverage | 不请求现场配合；已完成证据保留 |
| 13-A4 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：真实中文IME候选；其余见coverage | 不请求现场配合；已完成证据保留 |
| 14-A1 | N-恢复 | V0；1559942b构建/PID95881 | 已完成，coverage通过 | bug047_native/主审查 |
| 14-A3 | N-错误 | V0；运行制品待登记 | 待执行 | 未分派 |
| 14-A4 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：中文组字中切走/切回；其余见coverage | 不请求现场配合；已完成证据保留 |
| 14-A5 | P-性能 | 56bbfa4f；G1 main15657/renderer15697，55081/55082 | 执行中；2预热+12测量，阶段0/4/8/12原生手动GC | context_performance_native_high；实际Sol/high |
| 14-A7 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；真实Desktop远端后台审批/队列、断连重连与徽标 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A1 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Desktop选真实Host/工作区/模型并发送 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A2 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；同一Host再次新建时默认模型 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A3 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；不同模型远端会话切换及重启保持 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A4 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；远端工具批准/拒绝及正确Host路由 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A5 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；远端断连/恢复、禁用发送和草稿 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A6 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；host.describe真实失败后的Desktop状态恢复 | 不派发/不等用户；历史执行者及证据见coverage |
| 15-A7 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；移除Host后的历史、离线标识和审批标记 | 不派发/不等用户；历史执行者及证据见coverage |
| 16-A2 | N-无障碍 | V0；运行制品待登记 | 用户跳过人工子步骤：VoiceOver实际朗读；其余见coverage | 不请求现场配合；已完成证据保留 |
| 16-A3 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：原生拖入图片；其余见coverage | 不请求现场配合；已完成证据保留 |
| 09-P1-2 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：真实中文IME候选按键；其余见coverage | 不请求现场配合；已完成证据保留 |
| 09-P3-1 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：搜索中的真实中文IME组字；其余见coverage | 不请求现场配合；已完成证据保留 |
| 09-P3-3 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；真实远端模型菜单及下一条请求路由 | 不派发/不等用户；历史执行者及证据见coverage |
| 09-P3-4 | N-布局 | PG旧制品56bbfa4f；修后另登记 | BUG-050主审关闭；条件性翻转仍未覆盖 | 主智能体修复；context_performance_native_high（原始Sol/high） |
| 09-P3-5 | N-无障碍 | V0；运行制品待登记 | 用户跳过人工子步骤：VoiceOver真实输出；其余见coverage | 不请求现场配合；已完成证据保留 |
| 09-P4-1 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；在线Host/工作区新建及状态/悬停 | 不派发/不等用户；历史执行者及证据见coverage |
| 09-P4-2 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；远端运行断连/重连的状态/Context/停止行为 | 不派发/不等用户；历史执行者及证据见coverage |
| 09-P4-3 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；480px已配对Host子菜单；已验本机菜单几何保留 | 不派发/不等用户；历史执行者及证据见coverage |
| 09-P4-5 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；五Host已配对菜单及真实IME；五Host/IME各自前提仍保留 | 不派发/不等用户；历史执行者及证据见coverage |
| 09-P5-1 | A-聚合 | V0；运行制品待登记 | 授权/人工依赖子步骤用户跳过；其他未交付/方法缺口单列；汇总未覆盖 | 主智能体统一回填；不等待用户 |
| 09-P5-2 | N-布局 | LOCAL-NATIVE同冻结版本 | 授权/人工依赖子步骤用户跳过；其他未交付/方法缺口单列；汇总未覆盖 | 主智能体统一回填；不等待用户 |
| 09-P6-1 | N-输入 | V0；运行制品待登记 | 用户跳过人工子步骤：真实IME及原生拖放；其余见coverage | 不请求现场配合；已完成证据保留 |
| 17-A5 | X-服务 | V0；运行制品待登记 | 待执行 | 未分派 |
| 11-B1 | R-数据 | LOCAL-LIFECYCLE同冻结版本、原字节历史B | 树/预览/Review主审通过；校正无来源迁移门槛 | lifecycle_native_high / local_lifecycle_audit_high；实际Sol/high |
| 11-B2 | X-服务 | V0；运行制品待登记 | 待执行 | 未分派 |
| R18 | N-Host | V0；运行制品待登记 | 用户跳过系统授权依赖子步骤；Host添加/重连/移除即时列表 | 不派发/不等用户；历史执行者及证据见coverage |
| R20 | N-输入/N-Host | LOCAL-NATIVE同冻结版本 | 用户跳过系统授权依赖子步骤；远端普通文件选择与引用；本机PNG/TXT真实原生证据保留 | 不派发/不等用户；历史执行者及证据见coverage |

Browser细表的B-58/B-60归B-扩展，保持原62 action分母且不重复计入165项。BUG-039归N-快捷，BUG-047归N-恢复；Bug状态与相关父编号是否全通过分别判断。

## 批次记录

| 批次 | 编号/子步骤 | 实际版本与环境 | 资源/执行者 | 状态/报告 |
| --- | --- | --- | --- | --- |
| 准备 | 全部69个未完成编号 | V0；348个dirty路径；尚无本轮运行制品 | 主智能体；不占桌面 | 分类完成，先补BUG-047文档/检查，再加载当前构建 |

| WEB-01 | P2-W02剩余子步骤核对、BUG-047 Web共享消费者、Web测试/类型检查 | V0源码；不build、不改dist、不操作原生桌面 | 独立日志；web_acceptance | 已审查；124测试/typecheck通过，源码/证据报告见本地web/report.md，不代签UI |
| BRIDGE-01 | B-58/B-60与P2-B01/B03路线预检 | 只读status/help/既有证据；不申请剪贴板 | 独立报告；bridge_preflight | 已预检；本地bridge/report.md，待可绑定隔离Chrome再读取 |

| NATIVE-047 | R47-1–6；关联F7-02/14-A1 | 构建SHA2561559942b2f343c2892ef362e361bb859742582b75a070637869b814dbb10f7e3；PID95881/com.actspace.acceptance.bug038；CDP54838；sidebar-pagination-native-20261023/profile；Provider63493/control63494，初始4请求/无pending | 桌面独占；bug047_native（gpt-6.1-sol） | R47-1–6通过并审查；BUG-047关闭，桌面已释放 |

| NATIVE-039 | R39-1–5；BUG-039关联项 | 同固定构建/PID95881；原配置未改 | 桌面独占；bug047_native（gpt-6.1-sol） | 基线未收到OS回调，R39-1–4未覆盖；R39-5恢复核对通过。报告parallel-20261023/native039/report.md；资源已释放 |
| WEB-NATIVE | WN01–04；P2-W02 | Web c5985d59；Host20555/fixture86369，61869/61872；新增请求id4–7 | 独立Chrome tab；web_native（gpt-6.1-sol） | 全通过；本地web-native/report.md；tab关闭/无pending，P2-W02完整证据审查通过 |
| AUDIT-REVIEW | P2-D14逐子项证据/当前规范 | V0；只读，不代签新增UI | bridge_preflight；不占桌面 | 已完成；本地review-audit/report.md |

### NATIVE-REVIEW：当前构建选项效果与Git写操作补验

前置审计AUDIT-REVIEW已完成，见本地`parallel-20261023/review-audit/report.md`；它不是新增CU通过。P2-D14原范围及LastTurn交付缺口保留。当前289个baseline业务路径与514个固定制品文件哈希均未漂移。

- RV-1：真实原生打开本批专用fixture，核对root、scope和刷新；旧R05/R11/R21/R22不全量重跑。
- RV-2：实际换行/完整上下文/词级高亮/空白过滤的开关效果，正文和scope不串；菜单勾选不代签效果。
- RV-3：同一图片富预览开关；Files、展开/收起与可达Diff模式代表检查。
- RV-4：两hunk tracked文件只暂存第一段、Staged正文仅第一段、取消暂存后index清空且worktree两段保留；小文件file stage/unstage、discard取消/确认，真实UI与Git/磁盘对账。只修改本批测试fixture，不在产品仓库stage/commit。
- RV-5：复制git apply命令需先备份完整剪贴板并取得所有权；本批先不执行，等待单独安全夹具。LastTurn未接通，不重复模型请求，也不删除原要求。

实际分组：文本Review连续完成RV-1/2与相关Files/Diff，再图片RV-3，再独占fixture写入RV-4；按点报告中间证据。源码V0、构建1559942b、原生应用PID95881/profile sidebar-pagination-native-20261023；Git fixture为`parallel-20261023/review-native/fixture`，HEAD244b026，开始快照fixture-before.json/diff。同桌面、窗口、测试Git目录独占，主智能体不重建、不热更新、不并发修改该目录。执行者bug047_native，显式gpt-6.1-sol；待派发→执行中。结果统一主审回填。

NATIVE-REVIEW 新发现 BUG-048：关闭换行时有效图片和文件/hunk操作被共享长画布推到屏外。P2-D14改为失败，其余独立RV-4继续；主智能体记录根因并串行修复，制品仍冻结，释放后才重建复验。Browser读取链路只读审计已完成，见本地bridge-read-audit/report.md，不新增B-58/B-60通过。

### NATIVE-048：Review 布局修复定向复验

主智能体已串行修复、运行修前红测（新增1失败、原3通过）、修后4/4、Desktop全量2007通过/7跳过、两进程类型检查和token/theme/renderer-bridge门禁。静态renderer构建成功；V1源码d83f4fc0，制品d1922158，完整514文件及dirty源码标识见本地bug048-build.json。原294个baseline业务路径记录未改变，另新增两个原先干净的文件改动。全仓diff检查仍有CodeRenderView.tsx原有EOF空行（哈希与baseline相同），本次改动路径检查通过。

验收点：N48-1原生CmdR加载新renderer index-Buv3e8Kd.js；N48-2原fixture混合长文本和有效图片在nowrap/scrollLeft0可见且文件/hunk操作不出界；N48-3原生拖动横向滚动条后非代码内容仍可见且代码实际横移；N48-4右栏390→840真实resize，图片/操作宽度跟随；N48-5换行及足宽split代表回归；N48-6浅/深主题及480px整窗代表检查并恢复环境。若原生工具不能完成某输入则如实未覆盖，禁止CDP代操作。按同一fixture连续路线，保留关键截图与只读几何，新版不回签旧版全部Review通过。

本批不改Git、不调用模型、不碰剪贴板。discard观察由独立只读审计定位，RV5/LastTurn仍未覆盖。主智能体不覆盖制品、不HMR、不改共用服务；子智能体明确释放后再调度下一原生批次。


### NATIVE-DISCARD：原生确认与专用文件还原

NATIVE-048六点全部通过、环境恢复，514制品及296源码条目无漂移。当前执行者仍为显式gpt-6.1-sol的bug047_native，独占桌面/焦点/专用fixture；不改构建、服务或其他文件。主侧已确认driver原page/context dialog listener均为0，现持续加入只观察listener（page=1/context=0）及CDP opening/closed事件落盘，不调用accept/dismiss/写IPC。

RVD-1核对fixture身份、HEAD、index、small及其他文件哈希；RVD-2原生还原→Cancel，保留sheet和closed.result=false、磁盘不变；RVD-3再次原生还原→OK，记录closed.result并立即核对small等于HEAD、index仍空、其他文件未变。成功仅签对应discard子步骤，旧失败观察保留；若true仍未改文件，交主侧按请求/结果单独定位后登记Bug，不猜根因。RVD-4恢复原主题/布局/原R14空草稿并释放。无模型请求、剪贴板、stage/unstage或新产品功能。


### BRIDGE-READ：B-58/B-60真实读取（等待桌面）

独立profile、Chrome完整app副本、NativeHost manifest、abb和extension位于本地parallel-20261023/bridge-native，尚未启动。运行依赖packages/**/dist及owned桥接文件共1871项已固定，SHA256 bfda9b89，frozen-build.json；这不是全Chrome framework哈希声明，也不证明首次安装原生授权已验。仅在NATIVE-DISCARD释放后启动owned进程并分派显式gpt-6.1-sol，禁止资源忙时改用浏览器方式代签焦点/权限。

BR1先核对实际进程/profile/socket/扩展ID以及原生CU可准确绑定owned fixture窗口；全路径getApp若映射用户日常Chrome则不点击，报告限制。BR2独占全部系统剪贴板，安全备份所有item/type字节与changeCount，仅在所有权未变时写已知plain+HTML标记；原生聚焦owned页，记录实际焦点及权限。BR3真实Runtime→NativeHost→扩展clipboard_read_text返回与标记精确一致；BR4 clipboard_read返回plain+HTML且strong语义正确，保留实际权限提示/处理过程。BR5先关闭owned读请求和可能的权限提示，再按完整所有权核对恢复全部原剪贴板，核对制品未漂移、只关闭owned进程/标签。读超时不能直接归因产品；未决异步读取不允许接触恢复后的用户剪贴板。

主侧helper仅输出类型/长度/哈希，不输出原用户内容；备份目录0700、plist0600。真实原生焦点/权限由子智能体验收，协议返回由主侧定时执行并对账。逐点报告，B-58/B-60只有取得真实值才签通过；P2-B01/B03的首次安装与真实LLM审批缺口不随本批自动通过。


### NATIVE-COPY：Review复制命令（排队，先于Browser读取）

同专用fixture延续，当前small已由原生确认还原，其余未暂存变更及未跟踪文件保留。CPR1先安全备份系统剪贴板全部item/type，目录0700、plist0600，不输出原内容；记录fixture完整before。CPR2真实Unstaged→菜单“复制git apply命令”，反馈成功，OS读取只捕获预期profile/tmp/review-patches内命令；核对patch为真实tracked diff（含二进制），仅执行git apply --reverse --check，不实际apply。CPR3 Uncommitted含untracked应明确拒绝、剪贴板全字节与changeCount不变；CPR4空Staged应明确拒绝、无误写。CPR5只在所有权仍等于本批命令快照时完整恢复原剪贴板，核对所有Git文件/index未变化，恢复System/原R14空草稿/1440窗口/390关闭右栏/左260并释放。

操作方法为显式gpt-6.1-sol真实Electron CU，OS helper只布置/核对与恢复，禁止拦截navigator.clipboard或执行写IPC代签；不与Browser剪贴板或其他原生路线并发。复用已编译pasteboard-helper，capture-command须带当前profile/tmp/review-patches精确目录。此批不调用模型、不做Git写或改源码。只读负例与补丁验证不改变工作树。


### F3-SEED：真实 CLI 空子任务样本（独立数据准备）

F3-02子步骤；CLI仅生成真实持久化父explore→子空终态→父完成的数据，不代签原生详情、重试或空态。主智能体准备新的f3-empty/workspace、cli-data、cli-artifacts，真实入口apps/cli/dist/cli.js，依赖制品沿1871项固定清单；不build、不占桌面、不读Desktop配置或用户凭据。新loopback Provider只支持本批固定标记和合成凭据；记录实际端口/进程、源码哈希及请求相位。

通过准备门槛为CLI正常退出、真实父子Journal关联、子completed且无正文/摘要、父完成；不符即记录夹具或兼容前置缺口，不改造header/codec或伪造结果。原始CLI数据冻结后，待桌面空闲再复制到全新Desktop隔离根，先真实Electron读取健康样本，然后正常退出做副本header-only故障，再原生加载/耗尽/空态及恢复。主智能体执行数据准备；原生阶段另派显式gpt-6.1-sol。


F3-SEED实际CLI正常退出但子tool失败，合法空响应遗漏assistant/message造成open request，已登记BUG-049。原Journal冻结，停止使用此样本签收F3。主智能体等待NATIVE-COPY结束后串行红绿修复/构建；Browser读取尚未启动，依赖manifest重建后须重新核对。NATIVE-DISCARD四点及主侧磁盘复核通过，旧失败观察保留不推定原因。

NATIVE-COPY CPR1–5全通过，主侧patch/版本核对通过，完整剪贴板恢复，Git不变。BUG-049两项新红测复现主/子open request失败，原partial四项通过；主智能体已进行最小Loop修复，正在工程验证，尚未关闭。


SECURITY-NATIVE准备：55102 Provider/55103只读CDP、独立security-native-20261024/profile和/tmp canary。采用当前c5152219/d043744e保存顺序清单，尚未启动；本机安全原生操作者待分派。BUG-050及方法门均已释放桌面。


### SECURITY-NATIVE：本地文件安全真实 Desktop 子步骤（2026-10-24）

来源：coverage 的 P2-R02、正式计划安全/系统边界及本地 security-native-prep-20261024/source-audit.md。必需方式在派发前固定为真实 Electron Computer Use（gpt-6.1-sol / high），以实际权限卡/工具结果、真实 Journal 和本地 Provider 请求对账；协议、源码和只读 CDP仅辅助取证，不代签交互。验收版本为源码 c5152219、构建 d043744e（清单保存顺序聚合，296源码/2342制品逐文件固定）；未提交改动包含在清单中。此批不覆盖迁移、远端Host或所有安全场景，P2-R02复合结论仍逐子步骤审查。

验收点：SN01 Agent/default 模式读取 workspace/inside.txt 无额外权限卡且结果为真实 canary；SN02 读取 outside-a 出现工作区范围卡，原生拒绝后无执行/内容；SN03 新请求同一路径仍询问，原生仅允许一次后只读取批准的 canonical A；SN04A .env 文件出现敏感文件审批且只允许一次；SN04B 新请求相同 .env 必须再次询问，拒绝后无内容；SN05 .ssh/id_acceptance_canary 由 protected policy 直接拒绝，不出现可批准卡且无读取；SN06 link→A 待批后由主侧确认 Journal 尚无决定/执行，仅将自有link原子交换到B，原生允许旧卡后必须被资源变化保护拒绝，不读取B。最后正常CmdQ，恢复link→A，六份canary哈希不变、无额外模型请求。

操作分组：先核对owned应用/profile、Agent/default及合成Provider，连续完成SN01–03；再完成SN04A/B与SN05；最后SN06在待批中间状态留截图/AX与确认JSON，等待主侧交换完成后继续，随后恢复退出。逐点报告现象、步骤、版本和必要证据，不能只以最终完成文字判断工具成功。SN06是受控数据布置，不通过产品API替代批准。

资源：独占共享桌面、焦点、owned app com.actspace.acceptance.bug038 与 security-native profile；55102 Provider、55103被动观察器；/tmp/actspace-security-native-20261024 全新 canary 工作区、两个外部目录及专用符号链接。无剪贴板、主题修改、商业端点、用户凭据或真实用户文件。主智能体不重建/HMR/改共享服务；子智能体仅写 native-evidence。主侧布置/取证/恢复；security_native_high（spawn实际设置 model=gpt-6.1-sol、reasoning_effort=high）执行中。调度准备→执行中与验收结论分开，失败回主侧统一登记。


### FEE-NATIVE：F1-09 目录/手填/未知费用与标题辅助（等待桌面）

来源为原 F1-09 的价格和用途子步骤，必需方式固定为真实 Electron CU 设置/发送/查看与正常重开，主侧以真实回环HTTP、Journal和生产Usage投影逐请求对账；mock或源码不能代签。FC1真实UI将Fee local fixture倍率1改0.5，核对gpt-4o-mini实际目录有效价及来源后发FEE_NATIVE_FC1，费用=本批Provider用量×已冻结有效价；FC2首次标题辅助有独立requestId、只计一次且不新增Run；FC3保留倍率0.5，通过真UI手填input2/output5后同会话发FEE_NATIVE_FC3，新费率为2/5且FC1/2快照不改；FC4真UI换actspace-unknown-price-20261024发FEE_NATIVE_FC4，有用量而cost=null，Usage明确未知价；FC5核对3Run及全部请求/用途/用量/known与unknown费用，正常CmdQ重开后无新HTTP或重复事实，再正常退出。只签这几个子步骤，不代签商业余额、错误及全部用途。

新独立fee-native-20261024/profile/workspace，55112 Provider/55113被动CDP，当前同296源码/2342制品 c5152219/d043744e（保存顺序聚合）；模型与合成凭据仅预置新fixture，真实倍率与手填变化由原生UI完成。未注入目录缓存或价格；后台公开目录如更新，以实际冻结有效来源重算，不把本地目录叫当前官方报价。Provider只返回文本，无工具，无价格/cost字段；主请求报告10000输入/2000输出，标题1100/300（均合成用量，便于UI可见金额，不是真实字数或商业账单）。核心3主+1标题；最多6次模型HTTP，超限停止核查；列表GET另计。原Profile/用户设置不接触。

分组：先连接倍率/模型详情与FC1/2；同会话连续手填FC3、换模型FC4；最后Usage/轨迹聚合与跨进程FC5。关键中间设置、每个请求计费及最终重开截图/AX，主侧白名单HTTP与只读投影。共享桌面/焦点/owned app串行，等待SECURITY-NATIVE确认退出与恢复后才启动；不覆盖其构建/服务/profile。执行者待派发，必需实际gpt-6.1-sol/high。调度等待资源，验收仍未覆盖。


### R01-DEDUP：同submissionId生产Host协议闭环（独立并行）

原P2-R01“重复请求防重”子点；必需方式为当前完整生产CLI Host进程/Client RPC与本地合成HTTP Provider，不代签Desktop未知回执14-A3或OS交互。既有进程测试已经通过，但临时原始receipt/Journal被清理；本批仅补保留的实际联合对账，避免以租约测试替代。DUP1同一合法submissionId在运行中/完成后重复submit均返回同task，冲突内容被拒绝；DUP2真实HTTP/Journal/task/run只执行一次；DUP3正常停Host重开再提交同ID仍复用，旧事实哈希不变且0新模型请求；DUP4仅关闭自有Host/Provider，保留证据。

占用新r01-dedup-20261024目录、动态loopback端口、无害workspace、合成环境Key与独立dataRoot，当前c5152219/d043744e固定生产CLI及依赖，不build、不占桌面/剪贴板/用户配置，与FEE原生费用路线资源独立（该批非性能采样）。主侧准备/执行/取证，最多1main+1title，非识别额外请求停查。分组为首次启动/认证/创建→同ID重复与冲突→正常停止/重开/同ID确认→清理。保存脱敏请求计数、实际receipt和snapshot、原Journal哈希及版本；不落管理pair code/token/Authorization。调度准备，结论未覆盖。


SECURITY-NATIVE SN01–SN06全部主审通过并释放桌面，见[证据](security-evidence-20261024.md)。FEE-NATIVE已启动main2725/renderer2771，执行者fee_native_high（spawn实际gpt-6.1-sol/high），55112/55113及独立profile，执行中；源码/构建仍冻结。


### MIGRATE-NATIVE：F1-01旧计费三分支及停用清理（准备）

验收点先固定：MG1生产完整Electron读取无密钥旧v4/layersVersion0副本，reference显式4/20/cache0.4保留手填；MG2缺省manual旧价4/20/cache0.4乘旧倍率0.5后变手填2/10/cache0.2，新手填不再乘；MG3 token旧显式价丢弃，回到实际冻结目录价×0.5（gpt-4o-mini预期0.075/0.3/cache0.0375，以生产目录及公开有效值对账）；MG4 disabled自定义模型及definition/override删除，utility引用回跟随，保留defaultChat/explore；MG5迁前精确备份、原生模型详情/来源/用途与持久值逐项一致，正常CmdQ二启同值且settings/backup哈希不变，0模型请求。旧OS密文字节兼容另保留，既有v2 additionalCredentials extra1真实完整应用迁后删除证据复用，不新增真Key。

来源F1-01和model-provider-redesign迁移规则。必需方法为真实完整应用迁移加原生CU（实际Sol/high），生产公开readonly list、文件/备份哈希辅助；不以迁移单测代签。只用新migration-native-20261024/profile、workspace、loopback55122拒绝型观察服务/55123被动CDP，c5152219/d043744e逐文件固定；无secrets、不读取用户Key、不商业调用、不build。主侧串行准备所有配置；子侧仅原生读列表/三模型详情/用途，禁止发送/连接/刷新目录或改设置。分组：首次启动前保护原配置→三连接模型详情连续检查→用途/disabled清理→正常退出/主侧核对与重开→相同界面和无重计/无HTTP→正常退出。桌面当前FEE独占，本批等待其最终CmdQ、主侧恢复后才启动；执行者待派发。调度准备不等于通过。

FEE-NATIVE FC1–5原生及主审完成，2725/19703两次CmdQ exit0，4HTTP/3Run/37400Token/未知1不增，自有Provider2700精确结束；见[费用证据](fee-evidence-20261024.md)。MIGRATE-NATIVE main32148已启动、guard30910/55122零HTTP，observer只读；实际spawn migration_native_high model=gpt-6.1-sol/reasoning_effort=high，独占桌面执行中。R01-DEDUP原范围主审通过，当前104/0/61，不将调度完成当全面完成。


### USAGE-REBUILD-NATIVE：F6-02仅构建期提示与同副本二启（准备）

验收点：UR1从已停机且无持有者的performance-native/profile-history建独立副本，固定1 Journal/1751557B/1101活动（100合成轮1000工具+1真实Provider轮），仅删除副本派生sqlite及sidecars/owner和明确旧cache；UR2真Electron原生进入Usage，实际观察可理解的检查/同步/重建中间态→自然就绪，原生截图/AX必需，完成态或被动内部phase不代签；UR3结果101请求/1000工具/1101活动、72299Token，与原ID集合/Journal逐项对账，0新模型请求；UR4原生CmdQ、新PID冷重开同profile保持、无重计、源和副本旧事实hash不变；UR5最终F9整合未交付继续未覆盖，不以当前14签最终schema。

方法预先固定真Electron CU（必须实际Sol/high）+原生截图/AX，主侧仅被动观察/首次原生查询完成后的公开readonly或SQLite对账。分组：一次固定已有数据准备→直接原生设置/Usage并立刻捕获中间态→就绪/事实→CmdQ二启结果/退出。不人为延迟产品、不倍增/循环删库碰状态、不强求rebuilding字样；当前同步可能在300ms首次轮询前完成，未见中间态如实未覆盖。

资源：新usage-rebuild-native-20261024/profile，自有workspace/55133只读CDP与独占共享桌面，当前c5152219/d043744e固定源码/制品；不Provider、不商业请求/Key、不变原样本。仅离线副本清理清单，保留sessions-v2/harness-artifacts/harness-state和已有附件（本样本无附件，不冒称本批验附件）。source停机/文件holder及hash由主侧确认；当前MIGRATE独占桌面，UR等待其完整两次CmdQ释放后才启动，执行者待分派。精确来源/清理边界见本地usage-rebuild-preflight-high/report.md。


### R20-NATIVE-FILTER：本机图片选择负例的新导航路线（准备）

原R20两场景分列：本批只补本机Open面板PNG可选/TXT不可选（实际禁用或明确拒绝），不签远端普通文件。既有完整路径GoToWindow无法正确确认是已证方法限制，不重复同路由。本批在Desktop新建唯一自有“ActSpace R20 Acceptance 20261024”文件夹，仅合法PNG与TXT；原生Open通过实际侧栏Desktop→本批可见文件夹导航，不进入GoToWindow，不用协议选文件。若侧栏/文件夹本身不可操作，记录未覆盖并原生取消，不循环路径确认。

验收点RF1真实图片入口与原生Open；RF2同目录PNG可选且Open可用，TXT显示禁选/Open不可用或确切过滤（不能仅未见文件就推断）；RF3选择PNG后实际预览，移除恢复空草稿/附件0，不发送；RF4取消/正常CmdQ、仅核对并清理新建两canary，其他Desktop文件不读写。必需方式是真Electron/OS原生CU（实际Sol/high），截图/AX/按钮状态，中间负例不可由终点预览代签；源码filters仅辅助。

资源为新r20-filter-native-20261024/profile与55143被动观察，当前c5152219/d043744e冻结，无secrets/Provider/模型请求；主侧仅准备自有canary与应用，子侧只原生操作取证。共享桌面等待MIGRATE和UR完整释放后调度。Desktop仅创建此前不存在的唯一命名test目录，清理前保护两原canary hash；不读写现有用户文件/剪贴板，不触碰原失败夹具。执行者待派发，调度准备、结论未覆盖。

R20实际RF1–RF4已主审通过，详见[本机过滤证据](r20-filter-evidence-20261024.md)；main57342真实CmdQ exit0、无请求/Journal，限定两canary目录清理完成，桌面释放。父项远端仍未覆盖。

MIGRATE-NATIVE实际MG1–5通过且恢复结束，见[主审](migration-evidence-20261024.md)。UR main46669/55133已启动，usage_rebuild_native_high实际spawn model=gpt-6.1-sol/reasoning_effort=high，独占原生桌面；仅固定既有副本一次查询，R20等待其释放。

UR批次结束：[原生与主审](usage-rebuild-evidence-20261024.md)UR1/3/4通过，UR2只见纯loading未覆盖，UR5最终整合未交付；46669/54279两次原生CmdQ exit0、41事实及1101活动全部ID/字段相等。R20 main57342/55143已启动，r20_filter_native_high实际spawn model=gpt-6.1-sol/reasoning_effort=high独占桌面，执行原合同的新Desktop侧栏路线；不重复GoToWindow。

### PWA-DESKTOP：安装、独立窗口、离线与更新（准备）

先固定验收点：PW-D1真实浏览器安装ActSpace；PW-D2由真实安装入口进入独立窗口，正常Web配对、会话与关窗重开；PW-D3在线SW控制且assets预热后，仅停自有Host，再冷开/正常reload仍有外壳与实际离线说明；PW-D4恢复同origin Host，正常auth.resume及原历史，无重发；PW-D5两个正常生产构建A/B，同origin发布B、窗口可见触发更新，真实Toast点击前不强制刷新、点击后controller切换及同会话草稿恢复。PW-I1 iPhone/Tailscale与PW-N1当前Web v1未交付系统通知各自未覆盖，不能由桌面代签，也不为验收新增通知。

方法预先固定：实际gpt-6.1-sol/high执行真实浏览器/OS安装及独立窗口CU；业务页面可用该浏览器受支持的真实浏览器CU，不能CDP注入安装、--app伪独立窗口或localStorage注入token。SW/Host/Journal只读旁证。先核可精确绑定owned浏览器/窗口的方法门；此前Chrome clone两次原生超时不重试相同绑定，不操作用户现有Chrome。若真实安装入口/独立窗口无工具支持，只停止相应子点，不将iPhone缺失扩大成全部桌面路线阻塞。

方法门实际Sol/high已结束，只新建/关闭owned blank，未触其他tab：CU Chrome session仍复用既有profile/window，没有受支持的精确原生安装菜单/standalone窗口绑定；PW-D1/D2继续未覆盖，不重复clone失败。PW-D3/D4/D5各自的SW冷页离线/恢复/真实更新可先在唯一owned localhost origin的真实浏览器tab执行，明确只签浏览器PWA机制子点，不签独立窗口与安装。普通tab并不代替D1/D2，必需浏览器交互仍由实际CU完成；不用CDP input/业务API代签。全新tab不保证全新storage，故以本批此前未使用的唯一origin及确切tab ID隔离，不读取用户其他origin。

分组与资源：主侧新pwa-desktop-20261024目录、独立Host dataRoot/workspace/回环origin和browser profile；A为当前生产dist副本，B如需由正常Vite build输出到独立outDir，禁止覆盖共享dist/HMR，性能采样已结束。正常CLI host init/check/serve/pair，合成受控Provider或明确mock仅PWA生命周期，不商业、不读用户Key，真实一次码只在私有夹具文件及现场使用、不进报告。一次安装→正常配对/固定短任务→独立重开→SW预热→停自有Host/冷开→恢复；独立第二组A→B更新，保留A哈希assets、sw最后发布，不能手改SW缓存字节制造更新。共享桌面等R20完整退出，主侧可串行准备固定制品/Host；实际origin、PID、browser隔离与executor就绪后追加，当前仅准备，不新增通过。

### SEND-REJECT-NATIVE：09-P6-1普通发送明确失败恢复（准备）

原统一CU计划G7要求普通发送失败，并区分Provider运行失败、提交明确拒绝与unknown；没有强制断网门槛。SF1原生文字+真实Open选择唯一自有PNG，确认原草稿/附件预览；SF2主侧在原生确认后仅原子改名该精确自有源，原生一次发送，自然附件导入ENOENT在Task接纳前返回rejected，界面保留原文字/附件并给可理解错误；SF3核无task/run/request/header、pending已清而草稿可编辑，恢复源原字节，原生移除附件/清空草稿；SF4正常CmdQ、文件和版本保护、限定清理。A/B恢复目标可顺路检查，但不为本批增加完整隔离新门槛；未知回执14-A3继续独立未覆盖，不用此明确拒绝签它。

必需方式实际gpt-6.1-sol/high真Electron/OS CU：选图、草稿、失败中间态、错误与恢复、退出均真实输入，主侧仅精确自有文件改名/恢复与readonly事实旁证；不注入pending/receipt、preload或storage、不停Provider冒充提交失败。新send-reject-native-20261024 profile/workspace/55153被动CDP；仅复制已停机Fee专用合成连接配置及其假凭据到新profile，不含用户设置/Key/历史，连接改本批55152只拒绝观察服务，无商业请求。新Desktop唯一自有目录只放合法PNG，确认path确实为原生选择源后才施加故障，不猜测缓存路径、不改用户文件。桌面先等待PWA方法门释放；准备就绪、版本/资源身份与执行者稍后回填。限一次发送，若自然明确拒绝未触达则保留实际，不通过改变IPC/网络方法补结果。

SF实际send_reject_native_high spawn model=gpt-6.1-sol/reasoning_effort=high，main68019/renderer68067/55153，guard55152，仅原生业务输入，执行中。PWA主侧准备A生产副本与正常Vite B独立outDir，Web typecheck/build通过，A SW657f7102…ea9、B SW282d342f…6afb；原296源码/2342制品逐文件未变。自有Host70157/55162、HostId4544123a-c79c-46b7-8eb7-4db07d7272a8，显式--mock仅生命周期，浏览器origin统一http://localhost:55162。等待SF释放桌面后派SW/UI批；D1/D2方法缺口不改为通过。

PWA只读旁证准备：首次Host尚无浏览器配对/会话时正常stop，将生产Host移到自有55164，在原55162放透明回环HTTP/WS转发观察器。只记录static路径/status/字节hash和WS连接计数，不记录header/token/配对码/RPC正文、不改SW或业务响应；认证仍由真实Host正常配对。唯一浏览器origin保持http://localhost:55162。离线时精确停自有观察器与Host，再同origin启动；更新B先准备全套并保留A assets，index/sw原子切换且sw最后。该旁路用于核实际下载的A/B制品，不代替真实浏览器点击/离线/Toast证据，不开启第二商业或性能路线。


2026-10-24 SF1–SF4原生及主审通过，见[普通发送明确失败恢复](send-reject-evidence-20261024.md)：一次真实发送自然ENOENT，原草稿/附件可编辑、Task/Run/request/HTTP/pending0，main68019正常CmdQ exit0，原header精确保留且只追加正常end-seed；296源码/2342制品未变，自有PNG/目录清理及guard67991精确结束。09-P6-1仍缺真实IME/拖放，14-A3仍缺unknown，不新增整行通过。

PWA生命周期已派 pwa_lifecycle_browser_high，实际spawn model=gpt-6.1-sol/reasoning_effort=high。准确owned localhost tab独占CU；前端55162透明proxy79130→Host79115/55164（旧未配对70157已正常停止），仅mock生命周期。真实安装/独立窗口D1/D2无工具继续未覆盖，D3–D5独立执行中；主侧等待各阶段信号再停/恢复服务及发布正常B。总数仍104/0/61、50Bug49关闭，Goal active。


### PURPOSE-COST-NATIVE：用途已知数值补批（等待桌面）

来源F1-09及purpose-cost-evidence-20261024只读审查。先固定验收点：NC0真实原生UI读回main/vision合成模型、倍率1与手填input2/output5，并正常Open导入唯一自有合法PNG；NC1一次真实inspect_image内部vision请求，独立request/父工具/Token/已知费用一致；NC2一次真实bash的auto-review，审核请求独立计费、工具实际printf成功；NC3同会话原生/compact确实压缩可压区，独立请求计费且不新增Run；NC4全部HTTP/Journal/生产Usage逐ID只计一次、已知费用精确且正常CmdQ冷启动无新请求/Run。title/chat已有规则可复用，explore既有真实请求USD0.0001146及生产投影可复核，不为矩阵额外发explore。商业余额/管理Key错误仍另列。

必需方法是真Electron/OS Computer Use（实际spawn gpt-6.1-sol/high）完成设置、Open、发送、轨迹/Usage和两次正常退出；主侧仅准备自有fixture及被动HTTP/Journal/公开Usage旁证，不以服务测试签UI。新purpose-cost-native-20261024独立profile/workspace、动态loopback Provider和被动端口，当前c5152219/d043744e296源码/2342制品固定，不build/HMR、不商业或用户Key。只复制Fee自有合成secrets及setting骨架，重建本批fixture-main/fixture-vision明确合成模型；模型元数据对应Provider公布的实际合成能力，main text/tools、vision text/image。所有prompt改新profile。价格真实UI填写，不注入价表或Journal。

分组：等待PWA释放桌面后，新Session正常设置替我审批/选自有PNG，唯一任务依次inspect_image→bash printf PURPOSE_COST_SAFE_ACCEPTANCE→final；完成后同Session原生/compact，连续核vision/review/compact与Usage；正常CmdQ后主侧固定同profile重开，再原生核历史/费用并CmdQ。PNG通过Desktop侧栏唯一新目录，不用失败GoToWindow，不读用户文件。只在关键设置/中间请求/工具结果与重启留证。主侧保护/清理唯一canary及其新目录。

最多7次模型POST：main3×100入20出、title11/3、vision100/20、review23/7、compact17/5；只对实际发生且符合身份的请求计算，预计451入95出546总Token、1Run/3主步骤/2工具、known7/USD0.001377（input2/output5每百万）；不能把预测写为通过。模型成本由生产服务估算，Provider不返回cost；Token为合成provider-reported，非商业账单。额外POST或工具/schema/可压区不符即停止扩展交主侧，不静默重试或伪造工具结果。审核fixture批准仅验证管道，不宣称商业判断质量。调度准备→等待PWA共享桌面，执行者待分派；子侧只写native-evidence，全部编辑仍由主侧串行。


2026-10-24 [PWA浏览器生命周期](pwa-browser-evidence-20261024.md)主审完成：D3真实停服冷reload离线外壳/说明、D4自然恢复原Session且完整Journal字节不变已通过；D1/D2安装/独立窗口方法缺口、D5可见active属性工具拒绝且无Toast、iPhone及未交付通知分别未覆盖。owned tabs关闭、自有Host/proxy全部正常/精确退出，源码/共享制品不变。PURPOSE-COST-NATIVE main90132/被动52339/Provider87892动态52267已就绪，purpose_cost_native_high实际spawn model=gpt-6.1-sol/reasoning_effort=high独占桌面，只补压缩/审批/视觉已知费用，最多7POST。总数仍104/0/61，Bug50/49关闭，Goal active。


PURPOSE-COST-NATIVE在发送前原生确认：当前新建是lazy Session（App.tsx handleCreateSession），权限控件只有activeSessionId后显示，不能按原顺序发送前选择替我审批；不是新增Bug，也不注入空Session。0POST时调整本批Provider合同：正常唯一发送后，首main真实HTTP响应在fixture可控等待门停留，Session自然已创建；原生设置替我审批，主侧只读核真实permission/mode-set后释放同一HTTP，再执行两工具/完成/压缩。控件生产disabled=false，运行中权限可调整，不操作产品暂停或额外任务。该受控延迟不用于性能签收，未改变7POST/1Run预算。主侧串行更新自有Provider同52267端口并重新冻结其hash；源码/共享构建不变，子侧等待更新就绪再发送。


2026-10-24 [通知合同只读审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/notification-contract-audit-20261024/report.md)：历史OS通知明确来自Kairos notify_user important→Electron Notification→点击聚焦（20260704 history），v2 cutover已退役main/IPC/UI/config，正式D18又明确不恢复Kairos。当前默认生产main→Runtime/Profile→desktop+English装配、设置及内部task_notification链未找到系统发送端；这是有界静态证据，不证明任意外部插件不存在，也不签OS行为。D18通知应保留原编号与交付/来源映射缺口，不再笼统写仅缺系统权限；Web v1规范明确排除推送通知，更新Toast为页面提示。不得为验收新增功能或人工构造OS横幅。未发现新运行Bug，不改总数；朗读、快捷唤起等继续按各自缺口。


### 2026-10-24 用途已知费用原生闭环

[NC0–NC4与主审](purpose-cost-evidence-20261024.md)通过费用限定范围：真Electron设置2/5/倍率1、实际inspect_image→auto-review/受控bash→一次/compact，7HTTP/1Run/3步/2工具/546Token、known7/USD0.001377，暖冷原生逐条金额与公开Usage/SQLite一致，主usage重复事实只计一次。两次CmdQ exit0、Provider98744精确结束、296源码/2342制品不变；原Journal暖冷字节相同。首main等待门仅解决lazy Session后的原生权限选择，非性能证据；商业余额与错误继续未覆盖，F1-09及104/0/61总数不改。冷态原历史附件Preview disabled新增观察由主侧定位，源PNG仍原字节保留，不先判缺文件或宣称附件恢复通过；不影响费用事实。Goal继续active，主侧串行排查该实际新现象。


### 2026-10-24 BUG-051串行修复派发合同

已确认[BUG-051](bugs/BUG-051.md)压缩后冷启动历史图片预览误拒，P2-D17重开，当前103通过/1失败/61未完成、51Bug49关闭，未关闭039/051。主侧唯一编辑，先生产Registry红绿回归再修复当前surface/历史引用边界；原费用批已退出且制品哈希保护，诊断新副本main12143/52349无Provider、无新Send。必需方法真实Electron/OS CU，实际gpt-6.1-sol/high：B51-0修前历史disabled留证并正常CmdQ；B51-1修后同历史图点击打开Image Tab；B51-2工具/压缩摘要往返归属正确；B51-3正常退出同固定新构建冷启动再打开；B51-4无额外请求/Run、Journal及artifact原字节、正常退出。原生按修前、修后暖/冷三场景连续执行，截图/AX只关键状态；主侧readonly IPC/Journal/文件旁证另列，不能代签点击。profile/工作区/源图均自有，独占共享桌面，root等修前退出再构建；远端UI权限缺口不改变。修后明确新源码/制品版本，受影响旧证据待上述定向复验，不能在工程绿测后关闭。


### 2026-10-24 BUG-051 当前构建定向复验派发

主侧已完成工程修复与红绿回归，版本HEAD00d6b763+298源码`cd43ecdb18d93ab236460d06358020932bfec5e6e829e46e4027facd7e5dfef7`/2342制品`b4acff273c9b5f446283b7b5c0a3731dc85f96b94871973ee3df24600f22130d`。原296源码未漂移；新增此前clean的registry与新回归测试，不能继续用旧c5152219指称修后版本。Desktop全量2014通过/7跳过、类型检查、Electron构建、Host artifact安全5项及文档检查通过。

完整点为B51-1原压缩历史图片实际打开Image Tab、B51-2工具/摘要往返无串位、B51-3正常退出且仅移走自有源图后再冷启动仍打开同artifact、B51-4无新Send/HTTP/Run与原Journal/图字节保护、正常退出恢复。第一组main29720连续执行1/2→CmdQ，主侧再移走自有源PNG并冷启，第二组3/4；不同点独立判定，不以enabled或IPC成功代替实际点击。资源为唯一共享桌面、bug051独立profile/原样真实Journal与artifact副本、52349被动只读CDP；Provider早已停止，源码/制品冻结。purpose_cost_native_high保持原实际gpt-6.1-sol/high负责原生；主侧唯一编辑及事实主审。另一实际Sol/high子智能体仅作独立授权/回归源码审查，不占桌面、不编辑共享文件。

调度=原生执行中，验收结论仍P2-D17失败，103通过/1失败/61部分或未覆盖；51Bug49关闭，039/051未关闭。规定复验和主审前不提前回填通过。


### 2026-10-24 BUG-051闭环与当前可执行边界

[历史图片恢复主审](historical-image-evidence-20261024.md)完成B51-1–4：实际Image Tab、工具/摘要往返、原源图缺席冷启与事实保护均通过。正常两次CmdQ exit0，整Journal逐字相同、HTTP仍7；298源码cd43ecdb/2342制品b4acff27无漂移，独立授权审查0确定问题。BUG-051关闭，P2-D17结合原复合证据恢复通过；104通过/0失败/61部分或未覆盖，51Bug50关闭，仅039未关闭。当前桌面和本批服务已释放，所有旧通过保留各自原版证据，不声称新版本全部重跑。

用途费用、UR重建、R20本机过滤、真实发送前拒绝、PWA离线/自然恢复、通知来源审查等已可执行路线均已完成；旧建议不再作为待领取任务。61原编号及必要子步骤继续见dispatch/coverage和remaining-prerequisites，不把等待条件、观察未收敛或未交付当通过。无新增系统方法/合法授权/专用资源或交付版本时不重复已失败方法、循环GC或商业长流；Goal未达到完成标准，不标记complete、不要求用户重开。


### 2026-10-24 连续三轮阻塞审计

BUG-051闭环后连续三个Goal轮次核对同一组前提，仍无可独立推进动作：298源码/2342制品无变化，分支/HEAD不变、484个dirty路径保留且index为空；F9主仓整合仍缺，真实OS输入/观察方法、Desktop正常系统凭据授权、专用设备/凭据/远端、可运行安装制品与最终交付等条件未变化。有限内存/几何/重建观察继续未覆盖，不重复无信息负载或修改产品造状态。原生实例/Provider均已退出；授权审查报告已收纳，完成的残余running子任务已停止，无待收新验收结果。

当前调度为等待外部条件，已满足Goal blocked审计阈值；这不是complete或用户暂停。165项104通过/0失败/61部分或未覆盖，51Bug50关闭仅039待真实OS派发；原编号/方法/范围和证据全部保留。逐点原因及最小条件见remaining-prerequisites；不要求重新创建Goal，条件发生变化后从原断点续验，并重新开始阻塞轮次审计。内部核对证据为bug051-history-image-20261024/goal-gate-revalidation-02.json与03.json。


## 2026-10-24 快捷唤起按用户要求跳过

用户明确要求“快捷键先不用验收啦，我自己手动验收，跳过吧，文档里面标注跳过”，取代此前可配合人工触发的安排。系统全局快捷唤起及BUG-039的R39-1–4调度为“用户跳过（自行验收）”；不启动实例、不派发子智能体、不再请求逐步人工按键。R39-5原值恢复及已有录制/设置/工程回归证据保留，本次没有新增真实验收或产品改动。

F4-01、P2-D03、P2-D18仅相关快捷唤起子步骤标注跳过，其他范围不免验。验收结论仍未覆盖，BUG-039工程已修复、待用户复验且未关闭；104通过/0失败/61部分或未覆盖、51Bug中50关闭的计数不变。跳过不作为通过、不适用或全面验收完成。其余最小条件见剩余前提，未重复已无信息的受阻路线；等待用户实际结果与版本后据实回填。

## 2026-10-24 最新用户调整：无人值守，不等待系统授权或现场配合

用户明确将需要系统级授权的验收改为跳过，并说明可能五六小时不在场。此前“可以配合系统授权”的安排被取代。主智能体取消人工Host授权批次（未启动业务服务），同步正式计划、coverage、dispatch、前提、交接和Bug索引；凡需系统密码、人工授权或现场操作/听读确认的子步骤直接用户跳过，不提问、不等待、不反复触发弹窗，其他独立可执行工作继续。

系统凭据授权直接影响22个原编号，另2个汇总项；同一配对前提复用，不代表22次密码。其他OS人工子步骤单列；只改调度，验收结论仍未覆盖，原范围、编号、子步骤、历史证据和165分母均保留。104通过/0失败/61部分或未覆盖、51Bug中50关闭不变，039工程已修复、用户跳过真实复验且未关闭。非授权的设备/交付/专用凭据/状态及性能缺口保留各自原因，不改写为通过或不适用。

当前Goal工具无法修改objective；Sol/high子智能体尝试只读取得Codex应用以检查公开编辑入口时，Computer Use以安全原因明确拒绝，未进行UI编辑。完整替换文本已准备，应用保存的原Goal文本尚未改写；当前聊天和仓库最新规则已生效，不要求用户重新开启Goal。详情、影响清单和工具原始报告见[无人值守规则](unattended-policy-20261024.md)，完整文本见[Goal替换文本](goal-unattended-20261024.md)。本次仅同步流程文档，无产品修改或新增验收通过。
