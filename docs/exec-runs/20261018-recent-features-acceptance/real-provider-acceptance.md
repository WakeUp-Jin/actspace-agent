# 真实连接补充验收

日期：2026-10-18。源码基线：`a13f8a1ee10eed387da575d80ac000cc844f2bff`。用户在初轮交付后授权直接使用已有真实 Key，通过 Computer Use 补验。仍然只验收和记录，不修 Bug，不更新、删除或迁移既有 DOCS。

本记录是初轮受控 Provider 验收的补充，不覆盖或改写其历史事实。真实连接名称、应用实例和模型以本轮原生 UI 发现为准；不输出原始 Key。交互继续由指定 `gpt-6.1-sol` 子智能体执行。

## 先列验收点

| 编号 | 界面、状态、行为与预期 | 初轮关联点 | 结果 |
| --- | --- | --- | --- |
| R01 | 原生设置和模型选择器确认已有真实连接、已配置状态及实际选用模型；新建专用测试会话，避免向历史业务会话发送测试 | M01/M02 | 通过；当前构建、既有连接及专用会话均已确认，见 RG1–RG3 |
| R02 | 真实请求正常流式完成；正文与轨迹一致，用量弹窗的模型、Token、时长和已知/未知费用有依据，Context 能读取本次请求 | T02/U01/U02/C01 | 失败（DA03）；真实流式、正文/轨迹、live用量和 Context 子项通过，历史轨迹计时缺失 |
| R03 | 若现有连接支持 Thinking，分别发送 OFF/ON 请求；观察开关、思考正文默认展开/折叠、轨迹详情及请求完成 | T03/T06 | 通过；OFF/ON 请求、运行时展开、完成后折叠及 ON 轨迹思考正文/模型均实测 |
| R04 | 自动权限下真实模型提出安全 Bash；单次允许/拒绝与实际执行一致；若产生前缀建议，验证会话授权的复用与隔离 | B01/B02 | 通过；三按钮、单次运行/拒绝、同前缀换参数复用、不同前缀审批与会话隔离 |
| R05 | 在专用临时 Git 工作区生成少量文本文件并调用 present；核对改动卡、交付卡、预览、Review 和实际系统打开/Finder 最终状态 | D01/D02/D03 | 失败（DA02）；alias 缺改动卡，canonical 路线其余卡片/Review/交付及系统打开子项通过 |
| R06 | 对已配置的真实搜索/抓取来源，通过 UI 检查启用状态并执行一次有明确目标的联网查询/读取；未配置的来源保留未覆盖 | W03/W04 | 通过（已配置来源范围）；DeepSeek 搜索/抓取及原智谱/Tavily组合真实返回，已恢复设置；未配置来源未覆盖 |
| R07 | 真实长回复中停止，保留部分正文；继续发送能恢复，刷新后历史不重复，统计与运行状态合理 | T04/U01 | 通过；定向追加真实取消、部分正文、已暂停队列、显式继续单次执行及刷新去重均验证，停止轮用量保持未知 |
| R08 | 若原生浏览器认证可用，补 Web 的真实 Provider 请求/停止恢复；认证仍受阻则保留明确限制 | Web W24/WA01 | 未覆盖；Chrome 原生通道可读，但未建立真实 Provider Web Host 路线；浏览器自动化通道仍认证受限 |

每个点按“通过 / 失败 / 未覆盖”归档；部分子项实测不等同整点通过。真实请求不能自动覆盖初轮的故障注入、超过500条明细、真机或未遍历主题/尺寸。

## 再按操作路线分组

1. **RG1 原生实例→设置→新会话**：确认 R01 的连接和能力，记录脱敏名称、应用来源与模型。此阶段不发送模型请求。
2. **RG2 专用测试会话→短回复→Thinking→轨迹/用量/Context**：连续覆盖 R02/R03，保留普通完成态、思考中间态和用量详情；按实际能力选择路线。
3. **RG3 专用 Git 工作区→安全 Bash 审批→文件交付→Review/系统打开**：连续覆盖 R04/R05。先对git status会话授权，后续同前缀变参数、不同前缀git diff、新会话git status分别观察。文件第1轮新增一个小文本并present；第2轮修改它、新增另一文本、创建后删除临时文本，再present两文件，核对单/多文件、临时过滤和第N轮Review。保留审批决策、执行结果、交付预览和系统最终状态，所有内容限定验收目录。alias 原路线记录缺陷后，在独立物理路径 `/private/tmp/actspace-real-20261018-88xbant8/canonical-workspace` 的新测试会话补查其余卡片子项；不修改原工作区以规避缺陷，结果仍合并到 R05。
4. **RG4 搜索设置→真实联网→长回复停止/继续→刷新**：覆盖 R06/R07；设置变更先记录原值，操作后恢复。
5. **RG5 原生浏览器条件检查→Web**：仅当原生浏览器可用并已有可用连接时执行 R08；不能用浏览器工程自动化冒充 Computer Use。

## 执行记录与证据

### 实例和连接发现

原生 UI 打开的 `/Applications/Actspace.app` 在 About 显示 `0.1.0 (0.1.0)`，没有可核对的 commit；其搜索设置只有4来源、缺少近期新增的 DeepSeek 项，说明不能用这个安装包签收当前源码功能。该应用原本未运行，由验收子智能体打开，仅查看设置，没有发送请求。

设置 UI 发现默认、可用的 `deepseek-flash`，Key 显示已设置；用户口述“Fresh”暂按此现有默认模型理解。另有智谱、Tavily 搜索配置，全局联网已开启。这里只记录 UI 配置状态，尚未证明真实 API 成功。其他用户连接无需遍历，不记录其原始配置或凭据。

后续正常退出本轮打开的旧安装包，再启动当前 HEAD 已构建的开发实例，沿用应用自行管理的真实连接；不同时运行共享 data 的两个实例，不复制/解密 Key。专用临时 Git 工作区为 `/tmp/actspace-real-20261018-88xbant8/workspace`，只含验收基线文本；其临时初始提交 `0b85e3b2d89f443fc37a6c817528b933fdf41ae5` 不属于产品仓库提交。

旧安装包已由本轮原生 CmdQ 退出，原生应用清单确认 isRunning=false。之后已在当前 HEAD 的固定构建开发实例发送真实请求；不把 Key 存在或旧包“可用”状态当作请求成功证据。


### RG1–RG3 当前已执行

当前实例 `Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`，Electron 39.8.10，固定 file renderer；沿用应用管理的现有凭据，无 synthetic fixture、CA 或 Vite 覆盖。仅新建以下验收会话，未向既有业务会话发送：

- `RealAcceptance-20261018-Main`：`075e242e-606b-4912-bd23-df3572ab2f7d`，cwd 为上述 `/tmp/.../workspace`。
- `RealAcceptance-20261018-Isolation`：`064981ac-d9fc-4921-9461-2cb9bc502c83`，同一临时工作区。
- `RealAcceptance-20261018-Canonical`：`cba12653-de67-4ceb-a8fd-fd842b809c9e`，由原生选目录登记 `/private/tmp/actspace-real-20261018-88xbant8/canonical-workspace`，临时初始提交 `72931406...`；与产品仓库无关。

**R02/R03**：Main 首轮 Thinking OFF 的真实简短回复完成，正文与轨迹一致；输入 6367、输出 97、总 6464，cache/reasoning 0，UI 预估 $0.002026。总 1.51s、TTFT 924ms、generation 583ms、166.4 tok/s。父侧仅对白名单验收 journal 做脱敏数值对账：1507/924/583ms，97÷0.583=166.38，与 UI 一致，重复 usage 事件只计一次。第二轮 Thinking ON 真实完成，输入 6541=6413 miss+128 cache，输出114已含52 reasoning，正文62，不能再额外加52到总量。预估 costUSD0.002061468，应用估算与价格快照不等同实际服务账单。Context <1%、约6.5K/1M，能显示本次请求分项。

证据：OFF用量（本地证据：`screenshots/real-off-usage.png`，不随仓库分发）、OFF计时（本地证据：`screenshots/real-off-timing.png`，不随仓库分发）、Thinking详情展开（本地证据：`screenshots/real-thinking-expanded.png`，不随仓库分发）。`real-thinking-running.png` 实际为**已完成初态**，不证明流式中状态；完成时 Worked 折叠，重开 Worked 后 Thinking 仍折叠，点击才展开，符合规范。真实 Bash 运行中另已捕捉 Thinking 默认展开正文：真实运行态（本地证据：`screenshots/real-prefix-reuse-different.png`，不随仓库分发）。短请求太快，流式正文增长另在 R07 检查。

**R04**：Main 对 `git status --short` 出现“拒绝 / 本会话允许 git status / 运行”三按钮，点会话允许后执行。下一轮 `git status --porcelain` 自动执行、`git diff --stat` 重新审批，拒绝后显示 Denied 且无重试。Isolation 新会话的相同 status 仍需审批，点运行完成；再发同命令仍需审批，本次拒绝，证明运行只单次且未跨会话授权。证据：前缀审批（本地证据：`screenshots/real-prefix-approval.png`，不随仓库分发）、复用与不同前缀（本地证据：`screenshots/real-prefix-reuse-different.png`，不随仓库分发）、会话隔离（本地证据：`screenshots/real-prefix-isolation.png`，不随仓库分发）、单次后再次审批（本地证据：`screenshots/real-single-run-repeat-approval.png`，不随仓库分发）。

**R05**：Main 两轮实际 write/edit/delete/present 均完成。单文件 present 卡点击可在右面板预览；“用文本编辑打开”实际出现只含两行验收文本的系统文档窗口；“显示文件位置”实际在 Finder 选中该临时文件，之后仅关闭本轮测试文档/目录窗口。证据：单轮交付（本地证据：`screenshots/real-file-round1.png`，不随仓库分发）、系统文本编辑（本地证据：`screenshots/real-system-textedit.png`，不随仓库分发）、Finder选中（本地证据：`screenshots/real-finder-reveal.png`，不随仓库分发）。

**DA02：alias 工作区文件改动卡漏显示。** 原生设置“显示本轮代码改动”原值 on，未修改；Main 首轮写 `/private/tmp/.../acceptance-one.txt` 并 present 成功，但回复下方没有“已编辑…”卡；CmdR 后仍缺失。第二轮修改 one、新增 two、创建后删除 ephemeral，再 present 两文件，仍缺卡，仅底部 Git Review +5/-0 与两张交付卡。预期每轮显示工具产生的改动卡并可进入该轮 Review，实际该入口缺失。影响 `/tmp` 与 `/private/tmp` 别名不一致的工作区文件路径。证据：设置on（本地证据：`screenshots/real-changes-setting-on.png`，不随仓库分发）、刷新仍缺（本地证据：`screenshots/real-alias-refresh-no-changes-card.png`，不随仓库分发）、第2轮重现（本地证据：`screenshots/real-alias-round2-no-changes-card.png`，不随仓库分发）。定位与推断分开：父侧白名单 journal 证实 header.cwd=/tmp、write结果path=/private/tmp；当前 compiled toolPreview 在该root下缺outputRelativePath，而使用物理root才得到相对路径；TurnTail 过滤缺少该字段的记录。此为工程定位证据，原生复现支持缺陷；未修改产品代码/registry规避。

canonical sibling 路线继续可测项：单文件卡 +2/-0，可打开“第1轮改动”，新增文件单pane；第二轮修改one +3/-2、新增two +2/-0、同轮临时创建删除ephemeral后，卡仅2文件合计 +5/-2，不含临时文件；点击打开“第2轮改动”，修改文件左右diff，悬停预览真实出现，两个present卡保留。证据：单文件及第1轮Review（本地证据：`screenshots/real-canonical-single-turn-review.png`，不随仓库分发）、多文件及第2轮Review（本地证据：`screenshots/real-canonical-multi-turn-review.png`，不随仓库分发）。这些子项通过不抵消 DA02，R05 总结果为失败。未遍历大于4文件折叠、全部类型和应用组合。


### RG4 真实联网、流式与恢复边界

**R06**：原始设置全局联网 on、DeepSeek 搜索 off、智谱 on、Tavily on、DeepSeek 抓取 off。通过原生 UI 临时开 DS 搜索/抓取，关闭智谱/Tavily以明确来源，保留共享 Key，没有读取/替换/新增 Key。一次 `web_search` 查询 IANA example domains reserved documentation，最多3结果；一次 `web_fetch` 读取 example.com，均完成。工具展开明确 `Providers: deepseek`、`Fetched ... via DeepSeek`；返回 IANA 保留域名等结果，抓取标题 Example Domain。这里以产品来源标签确认实际使用的来源，不额外推断模型传输端点或声称直连官方 API。

随后恢复全局on、DS搜索off、智谱on、Tavilyon、DS抓取off，再作一次相同短搜索。工具详情 `Providers: tavily, zhipu`，返回 IANA 与 MDN 等结果，未见来源错误；没有为每个来源分别新增独立请求，也不把整体 completed 本身等同每个来源成功证据。重进设置和 CmdR 后再次核对所有开关原值。证据：DS启用组合（本地证据：`screenshots/real-ds-search-fetch-enabled.png`，不随仓库分发）、DS来源详情（本地证据：`screenshots/real-ds-tool-source.png`，不随仓库分发）、真实返回（本地证据：`screenshots/real-ds-search-fetch-result.png`，不随仓库分发）、原聚合结果（本地证据：`screenshots/real-original-search-sources.png`，不随仓库分发）、恢复后重开/刷新（本地证据：`screenshots/real-search-restored-after-refresh.png`，不随仓库分发）。未配置 TinyFish/Exa、缺 Key 与账号故障分支未在真实凭据上制造；不继承初轮受控 Provider 的成功为真实成功。

**R07 首次尝试（未证明取消）**：canonical 会话请求有限1–300短句列表，原生观察到运行中正文从13行增至47行，证据：时点1（本地证据：`screenshots/real-stream-growing-1.png`，不随仓库分发）、时点2（本地证据：`screenshots/real-stream-growing-2.png`，不随仓库分发）。本轮 attempted 将 Thinking 关闭，但未保留生效确认，刷新后设置仍on，不能把本长轮签作实际OFF请求。Main早先明确OFF/ON两轮证据不受影响。

原生停止调用的一轮包含 getAX→截图→click→getAX，工具返回耗时38.30s；未保存点击的墙钟时间，无法证明实际点击发生在自然结束前。期间看到停止按钮 disabled、会话运行中；这仅为观察，不据此判定产品停止耗时或取消失败。父侧白名单 journal 对账：run `bf4dd450-ab55-4924-b770-0c6f667d59f3` 于05:08:09.106Z accepted、05:09:21.685Z末chunk、05:09:21.896Z turn/end completed、05:09:22.049Z run/finish completed，未见取消事件。因此本次**没有证明停止部分正文或显式继续成功**，也不新增停止Bug。原生工具延迟与产品延迟分开。

停止收尾观察期间，发送一条短标记请求进入队列，最终长回复自然完成300行，队列自动执行一次 `RECOVER-REAL-OK`。CmdR后长prompt1份、300正文行、恢复正文1份且空闲，历史无重复子项通过：刷新结果（本地证据：`screenshots/real-recovery-refresh.png`，不随仓库分发）。`real-stop-partial.png` 和 `real-stop-pending.png` 仅记录当时界面，文件名不代表实际停止已成立。这是首次尝试的覆盖边界；随后仅对 R07 定向追加以下一次有限请求，不重跑其他通过项。

### R07 定向补验：带点击时间的真实停止与显式继续

父侧以相同当前 HEAD 固定构建重新启动本轮实例（runner19669），只进入已有 canonical 验收会话，未改 Key、Thinking 或任何全局设置。请求标记 `R07-TIMED-STOP-400`，有限1–400短句、禁止工具和文件访问。发送后先短 AX 观察运行中和已生成正文，立即按该次新鲜状态定位“停止 Agent”，不在停止前截图。原生工具墙钟记录如下（UTC）：

| 操作 | 原生工具记录 |
| --- | --- |
| 输入回车发送 | 05:20:53.672Z–05:20:53.685Z |
| 下一次短 AX 返回运行中与正文 | 05:22:06.952Z；该次工具调用包含约49秒的原生状态读取等待 |
| 实际停止 click 前后 | 05:22:06.953Z–05:22:12.905Z |
| 短恢复请求进入暂停队列 | 05:24:04.197Z 观察到“1条排队 / 已暂停 / 继续发送” |
| 点击显式继续后状态 | 05:24:18.993Z |
| 恢复完成后刷新核对 | 05:24:57.703Z |

父侧只对白名单 canonical journal 做事件/数值核对：run `ce265bd3-2ec9-46ed-8eba-ce33c2cf742f`、request `c9a165b3-fceb-44fd-90cb-a7d084b8d049`；request/header05:20:54.218Z，queue/pause05:22:13.004Z，step/end05:22:13.393Z aborted、turn/end05:22:13.430Z aborted、run/finish05:22:13.628Z cancelled。此轮确实取消，与先前自然完成的300行轮不同。保留原生与后台两套原始时间；不假设跨进程墙钟毫秒严格同步。

取消后当前绑定一度持续返回运行中/disabled停止的 AX，而后截图已出现可编辑草稿和发送按钮；重选同一应用即得到正确的 Stopped/空闲树。AX与截图不一致，不能据此确认产品卡顿或状态缺陷，也没有登记新Bug。`real-r07-timed-stop-pending.png` / `real-r07-after-stop-disabled.png` 仅记录中间观察，文件名不证明终态或延迟原因。

终态确认部分正文保留236条完整短句及最后未完成句，显示 `Stopped`，没有补全400行。发送唯一短恢复请求 `R07-RECOVERY-AFTER-TIMED-STOP` 后先进入暂停队列，未自行解除暂停；点击“继续发送”后只执行一次，回复 `TIMED-RECOVER-OK`。父侧对账：accept05:24:03.351Z、queue/resume05:24:16.769Z，随后仅1次run/request，assistant05:24:18.869Z、completed05:24:19.488Z。

CmdR 后 timed prompt1份、恢复prompt1份、恢复正文1份、Stopped1份，236条完整句及碎片仍保留，UI空闲，8轮16步、142K tok、缓存85%。停止轮没有用量弹窗；后台usage为空，按未知处理，不制造0用量。恢复轮显示16.9K tok；后台216 miss+16640 cache+8 output=16864，reasoning0，预估costUSD0.00017424。证据：暂停与继续入口（本地证据：`screenshots/real-r07-paused-queue.png`，不随仓库分发）、恢复后刷新与单份正文（本地证据：`screenshots/real-r07-recovered-refresh.png`，不随仓库分发）。R07本次既定子项通过，不覆盖真实Provider失败正文或其他未列故障注入。

### Thinking 轨迹补查及计时观察

Main现有请求#2真实 ON 轮，打开请求详情显示模型 deepseek-flash、已完成；进入“助手消息”详情能看到思考正文与最终正文、114总输出/52推理/62正文，与聊天内容一致，见Thinking轨迹详情（本地证据：`screenshots/real-thinking-trajectory-detail.png`，不随仓库分发）。这是实际轨迹交互，不能由普通聊天 Thinking 展开替代。

刷新后该入口总时长992ms仍在，但 TTFT、生成、吞吐量均显示“首 token 时间不可用”。此前527ms/465ms/245.2tok/s来自 live **用量弹窗**，不是刷新前轨迹详情证据；父侧仅对白名单计时字段及当前源码对账，确认 durable journal 首 chunk 存在、assistant/message 未存 firstTokenAt；`runtime session-controller.ts:323` 的 slimHistoryWindow 丢已定稿 chunk，`trajectory/builder.ts:395` 依赖 chunk 推首 token。由此登记 **DA03 P2：历史轨迹助手计时缺失**，影响历史请求详情 TTFT/生成/TPS；R02总体失败。上述为源/数据定位，原生实际证据是当前详情缺字段，不能写成“刷新前同一详情已通过”。

### RG5 浏览器可用性及退出

一次 `cua.getApp('com.google.Chrome')` 原生通道成功返回已有页面 AX（约60.5s工具耗时）；没有点击、修改、关闭既有标签或浏览用户业务内容。浏览器自动化接口此前受 `unsupported Codex auth method: apikey` 限制，但这不等同原生CU全局不可用。尚未在原生 Chrome 建立可用的真实 Provider Web Host 路线，没有提取/转存桌面 Key 到独立CLI，R08仍未覆盖。

本轮真实Provider路线只在3个新验收会话及2个临时工作区执行，测试文本与证据保留。搜索设置已恢复并经刷新核对；显示本轮代码改动原本on且未变；canonical Thinking最终on与初始一致，Main原on也已恢复。没有更换默认模型、真实Key、主题或用户业务会话设置。旧安装包与本轮dev均原生CmdQ正常退出，最后原生清单只见旧安装包isRunning=false，dev已不在清单；不退出用户原本开的Chrome/Finder/TextEdit应用，仅关闭本轮测试文档/目录窗口。原生侧已确认应用退出；runner 退出码与本轮启动服务由父侧统一核对并在总报告闭环。

R07定向补验后已再次在原生模型选项核对 canonical Thinking 为 Value1，与原值一致；本次完全未改全局设置。随后原生 CmdQ 调用区间05:25:37.133Z–05:25:37.139Z，父侧已确认本次runner19669退出码0，canonical end-seed05:25:37.192Z，清理闭环；未关闭用户其他应用。

本补验主路线为 light、原宽窗，未重跑深色/480px及全部模型/文件/系统应用组合；初轮真实CU及其边界仍单独保留，不把补验结果改写成初轮全覆盖。没有修改产品源码、正式测试、已有设计文档，没有修Bug、提交或推送。

最终逐点合计：R01/R03/R04/R06/R07通过（5点），R02/DA03、R05/DA02失败（2点），R08未覆盖（1点）。初轮37点统计保持原样。
