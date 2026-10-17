# main 前端统一验收台账 — 2026-10-15

状态：**2026-10-16 验收执行已收束，产品未全部通过。** 60个验收点：53通过、5失败、2部分覆盖，无待执行主项。按 [已归档计划](../../exec-plans/completed/20261015-main-frontend-acceptance.md) 只验收、记录问题，未修复、未提交。部分覆盖的未验子项和外部依赖仍保留。

## 基线与依据

- 规划版本：main / `00e5a159d2bc45fe6f6a7ec4d4da7a5162a9f745`；开始清点时工作区干净。指纹：`tmp/codex-acceptance/20261015-main/baseline.json`。执行时重新核对版本。
- 范围：轨迹及修复、模型页头 / 连接卡片、会话统计、轮尾用量 / 交付、侧栏、默认工作区；Harness 升级只验相关启动 / 恢复 / 运行链路。
- 历史依据：[首轮轨迹报告](../20261014-trajectory-streaming-split/acceptance-20261015.md)、[修复复验报告](../20261014-trajectory-streaming-split/acceptance-20261015-recheck.md)。历史通过代表当时版本，当前台账不自动沿用通过。
- 证据根：`tmp/codex-acceptance/20261015-main/`。本地截图 / 日志不随仓库分发；每个场景每次运行使用独立子目录，不覆盖旧 JSON 或截图。
- 每项注明实际方法：原生 Computer Use、Playwright 浏览器 mock、真实 Electron、真实 Provider、工程测试、只读源码 / 运行时检查，不能互相冒充。

## 历史问题接续

| 历史编号 / 缺项 | 上轮已知状态 | 本轮对应 |
| --- | --- | --- |
| B01 旧开发窗口持续空轨迹 | 全新进程未复现，旧 HMR 根因未知 | T09；新进程通过不自动关闭旧窗口异常 |
| B02 停止状态不恢复 | 修复复验没有有效 UI 全链路证据 | T08 |
| B03 关闭 Thinking 请求失败 | 修复样本通过，当前 main 需重验 | T10 |
| B03-R1 失败行灰色 | 已确认颜色类覆盖；上轮未修复 | T11 |
| 输出中途失败刷新后才显示 | 该分支未覆盖 | T12 |
| 真实正文 / 预览增长 | 原证据被覆盖、截图跨会话 | T06，必须同会话重新取证 |
| 真正新词搜索 | query 基线和命中时间缺证据 | T07 |
| O01 长帧与普通事件重建 | 保留观察，未关闭 | T15–T16 |
| I01 watcher / 全量测试 | watcher 通过，Desktop 全量有其他失败 | E02，不能只用 watcher 判全量通过 |
| 稳定最终版本 | 上轮源码被其他进程持续修改 | E04 |

## 轨迹功能与修复

| 编号 | 操作、状态与预期结果 | 计划方法 / 核心证据 | 结果 |
| --- | --- | --- | --- |
| T01 | 进入轨迹 / 返回对话，草稿完整保留；轨迹无 Composer 或多余底部留白 | Electron UI；前后截图与草稿值 | 通过；真实 Electron 草稿往返保留，轨迹 Composer 不可见；TR-REAL、ENG-IPC |
| T02 | 七类记录、轮次、请求圆点、审批拒绝 / 错误状态正确 | errors / complete fixture；类型覆盖表 | 通过；七类记录/圆点/拒绝/错误逐类检查；TR-FIX |
| T03 | 详情页签、来源、JSON 展开、工具参数 / 结果 / Schema、系统差异、父子及助手工具关联跳转正确 | UI；逐类记录与关联 recordId | 通过；各类页签、JSON展开、系统diff、父子/助手关联 recordId 对上；TR-FIX、TR-SUP |
| T04 | 搜索 / 清空、轮次 / 调用收起展开、时长切换正确；无命中状态清晰 | fixture UI；筛选前后与复原 | 通过；28→0→28 行，轮次/调用折叠恢复、时长切换；无命中是空表，无额外提示；TR-FIX |
| T05 | 时间轴定位 / 选区 / 清除 / 缩放 / 平移；详情调宽及边界、键盘操作正确 | UI；定位行、选区、尺寸和焦点 | 通过；定位/选区/Esc/缩放/平移，键盘16px、320–720边界、重置440；TR-SUP |
| T06 | 真实流式表格正文及详情预览在同 session / recordId 两时点增长，思考不能代替正文 | 真实 Provider / Electron；时间、长度与同会话截图 / 元数据 | 通过；同session/record正文和预览371→462字（262ms），第二样本154→258；TR-REAL |
| T07 | 此前正文 / 思考均不存在的新词出现后约 3 秒内可搜，清空恢复列表 | 真实 Provider / Electron；基线、query、出现 / 输入 / 命中时间与误差 | 通过；新词基线为空，命中上界610ms / 1623ms，清空恢复；TR-REAL |
| T08 | 输出中点击停止；停止中结束；返回输入框 enabled 且可编辑，已有正文保留 | UI 点击与终止事件；完整时序 | 失败 MN02；停止恢复422ms / 208ms，输入可编辑，已有正文却消失；TR-STOP |
| T09 | 全新进程新会话运行中进入轨迹，已有事件正常显示；旧窗口异常另记 | 真实 Electron；进入 / 首行时间与事件摘要 | 通过当前新进程；运行中已有事件非空。原旧HMR窗口未访问，历史B01仍未关闭；TR-REAL |
| T10 | deepseek-flash 正式选项 UI 中 Thinking OFF / ON 各请求成功，有 header、正文、completed | 真实 Provider；两次独立结果 | 通过；正式UI OFF/ON两次header+正文+completed；TR-STATS |
| T11 | 立即失败后独立原因行无需展开即可见，实际红色，刷新前后一致 | 隔离无效 key；终态、DOM 祖先、computed 颜色和截图 | 失败 MN01；独立原因即时/刷新一致，但computed灰色rgb(114,114,107)；TR-ERR |
| T12 | 已输出正文后失败，终态原因实时显示、不要求刷新；部分正文保留 | 本地兼容 SSE 服务 / Electron；输出 / 失败时序与刷新对比 | 失败 MN02；20chunk后终态原因无需刷新可见，但部分正文消失；同时灰色MN01；TR-ERR |
| T13 | 有序编号、无序圆点、嵌套层次 / 18px 缩进在浅深 / 窄窗保留 | 网络 fixture；OL / UL 样式和截图 | 通过；OL/UL/嵌套样式及18px，浅深×1440/480；TR-FIX |
| T14 | 思考默认展开；折叠 A→B→A 保持，再折叠 B→A 恢复展开；13px / 浅一级颜色 | UI；A/B 完整路线与两主题样式 | 通过已列路线；A/B折叠规则、默认展开、13px/浅色，480复用视觉；TR-FIX |
| T15 | 2000 chunk split p95 < 2ms，chunk 一次，纯 chunk 首帧后不重建定稿层 / 时间轴，逐帧等价 | 既有测试；计数 / 耗时，普通事件重建另报 | 通过；2000chunk split p95 0.368ms，计数/纯chunk无重建/逐帧等价通过；O01另列；ENG-PERF |
| T16 | 短长回放同 DOM、详情增长、离开尾部仍更新；帧 p95 ≤16.8ms，同时报 max / 长帧 | 浏览器采样；节点身份、长度和负载 / 帧分布 | 通过p95门槛；短16.7/长16.8ms，长max100ms与2帧>50ms保留O01；可见行同DOM/离尾详情增长；TR-FRAME |
| T17 | 历史分页、较早事件、preload / IPC revision、切换 / 重载后轨迹完整 | 既有隔离 Electron 验收；逐项结果 | 通过；隔离真实Electron11项，25轮分页/IPC/工具关联/结果/Schema/草稿/重载；ENG-IPC |
| T18 | DSH 参考页已有的工具栏 / 行 / 时间轴 / 类型标签按计划对齐 | 同主题 / viewport；尺寸表与截图，不宣称整页像素一致 | 部分覆盖；当前UI尺寸与DSH源码一致，同主题viewport双页渲染比较未覆盖；TR-SUP |

## 模型设置

| 编号 | 操作、状态与预期结果 | 计划方法 / 核心证据 | 结果 |
| --- | --- | --- | --- |
| M01 | 二级返回箭头在主标题行左端、28px；服务商为主标题，无重复旧标题，副标题 / 状态可读 | Electron；标题层级、尺寸、浅深图 | 通过；真实Electron主标题/副标题/状态及28×28返回，无重复模型标题；MODELS |
| M02 | 从列表进入详情 / 编辑，提示「返回模型」并返回列表；hover / 聚焦可操作 | Electron；路径、提示、焦点 | 通过；列表详情/编辑返回模型，tooltip与focus+Enter；MODELS |
| M03 | 从添加连接进入内置 / Anthropic / 自定义配置，返回添加连接；模型编辑遵循自身层级 | Electron；各路由逐项，不只代表一页 | 通过；9个添加连接路由逐项返回目录，自定义单模型编辑回自身连接；MODELS |
| M04 | 内置 / 自定义卡片状态圆点、文字、分组、模型清单 / 开关正确，区分配置 / 错误状态 | fixture + 隔离设置；状态 / 行为矩阵 | 通过状态投影/开关；available/unavailable/未配置区别，计数4/11→5/11→4/11；异常样例是隔离合法状态，非网络检测；MODELS |
| M05 | 发丝卡片、页头探出 / 对齐、表单 / 页脚在浅深 / 窄窗无明显溢出遮挡 | Electron + 浏览器尺寸矩阵 | 通过；9初始配置路由36个主题尺寸组合72图，页脚可滚达/无横溢出，详情另实测；认证后远端模型选择不在本点；MODELS |

## 会话统计与本轮用量

| 编号 | 操作、状态与预期结果 | 计划方法 / 核心证据 | 结果 |
| --- | --- | --- | --- |
| S01 | 真实完成后模型用时 / TTFT 平均 / TPS 与完整 Journal 相符，读取宿主 timing | Provider / Electron + 脱敏数值；公式及舍入对照 | 通过自然完成口径；Journal独立计算与宿主/UI一致，OFF66TPS/ON875TPS为极短样本；TR-STATS |
| S02 | 重载 / 重开历史仍显示同口径 TTFT / TPS，slim 窗口缺 chunk 不丢数字 | Electron 重载 / 重启；前后投影和 UI | 通过；真实会话刷新/进程重开统计及用量不变，slim长历史另S04；TR-STATS |
| S03 | 多轮 / 多请求 / 重试汇总正确；无首 token / 零解码时间不显示误导速度 | 既有投影 / UI 测试 + 有限真实样本 | 失败 MN03；正常多请求/空首token/零decode通过，失败重试模型用时7s仅算4s；ENG-STATS |
| S04 | 长窗口受限仍统计完整 Journal，旧版本 checkpoint 可重建 | 既有测试 / 隔离长历史；总量 / 窗口对照 | 通过分层验证；真实Electron25轮仅窗口20轮且0chunk，timing仍全25轮，刷新一致；旧checkpoint拒绝/重建及缓存版本另工程验证；TR-LONG、ENG-STATS |
| S05 | 首 token 后 chunk 不逐条修改 sessionStats；结算 / 新请求更新正常，openSteps 不泄漏到 view | 既有测试 + revision；统计与消息更新区分 | 通过宿主验证；首token后2000chunk的sessionStats更新0次，结算正常，view无openSteps；ENG-STATS |
| U01 | 尾栏操作 → 用量胶囊 → 时间；最新常显，旧轮 hover 显示 | turn-deliverables + Electron；hover / 顺序 | 通过；操作→用量→时间，最新常显，旧轮hover/键盘显现；MODELS |
| U02 | 弹窗含真实 provider / model、缓存命中、输入 / 缓存读写 / 输出 / 推理与末行花费 | fixture + Electron；字段对账、关闭 / 焦点返回 | 通过；三轮明细+真实provider/model，含推理/花费；Esc焦点回触发器；MODELS |
| U03 | 已知费用、预估灰标、全部未知 / 部分未知正确；未知请求不按零展示完整总价 | 数据测试 + 明确 fixture；计价状态矩阵 | 通过分层矩阵；真实预估/fixture预估、全未知、provider-reported非预估、混合部分未知均正确；后两项为网络fixture；MODELS |
| U04 | 480px 边界与 479px 图标态正确，弹窗明细不丢，两主题可读 | 1440 / 480 / 479 UI；边界截图 | 通过；浅深1440/480/479，480有文字/479为28px图标、明细保持；MODELS |
| U05 | 成功请求、失败重试各计一次，无 usage 不记；模型名取计价信息，真实 / 历史合计正确 | client / shared 测试 + Electron；请求 / 轮对账 | 通过组合证据；真实6310tok及历史对账、assistant/step重复usage只计1；失败重试/无usage由client等测试覆盖；TR-USAGE、ENG |

## 轮尾改动与交付卡

| 编号 | 操作、状态与预期结果 | 计划方法 / 核心证据 | 结果 |
| --- | --- | --- | --- |
| D01 | 单 / 多文件改动、折叠、增删行数、新建又删除不计；第三轮 +1/-1 正确 | fixture UI + 数据测试；逐轮文件 / 计数 | 通过；三轮2/6/1文件及+1/-1、展开；新建后删除在原fixture及数据测试均过滤；MODELS、ENG |
| D02 | hover diff 延迟 / 尺寸 / 高度、移开关闭正确，窄窗可用 | UI；时序 / 矩形 / 截图 | 通过；300ms无/600ms有，宽=卡-48，120行长diff高420且内部滚动0→500，移出关闭/480可用；MODELS |
| D03 | 第 N 轮 Review 内容匹配，对比 / 单栏 / 换行 / 文件切换 / 全文正常 | UI；三轮导航与范围 | 通过；三轮Review范围、单栏/对比/换行/文件切换/全文；MODELS |
| D04 | 真实 Agent present 临时工作区 1–4 文件，名称 / 描述 / 图标 / 预览正确 | Provider / Electron；工具事件、文件存在 / 预览 | 通过代表性真实样本；Agent成功present 2/4文件，txt/csv/md/json预览，1/3未逐个请求；MODELS |
| D05 | 本地默认打开、关联应用菜单 / 图标名称、Finder 定位正确，首次查询不阻塞交互 | Electron + 系统应用，仅临时文件；缺 Word / Excel 单列未覆盖 | 部分覆盖；菜单13项图标名称/默认标记及“已请求”反馈通过，系统最终打开/Finder选中和首次延迟未覆盖；原生工具认证受限；MODELS |
| D06 | 隐藏本轮代码改动即时及重启后生效，交付 / 图片不受影响 | 隔离设置 / Electron 重启；UI / 存储对照 | 通过；真实Electron设置即时/reload/重开changes0且交付2/4保持；网络fixture图片1/交付6在开关前后保持，关闭后图片仍可预览；MODELS |

远端 Host 的预览 / 下载为独立依赖项：有已授权真实测试 Host 才执行；本机 mock 不支持的 API 不记产品 Bug，也不能写远端已通过。

## 侧栏与默认工作区

侧栏用 SB 编号，避免与历史 Bug B01–B04 混淆。

| 编号 | 操作、状态与预期结果 | 计划方法 / 核心证据 | 结果 |
| --- | --- | --- | --- |
| SB01 | 标题搜索图标展开，查询 / 清空 / Esc 正常，无旧搜索行 | sidebar fixture + Electron；搜索 / 键盘状态 | 通过搜索/清空/Esc关闭；无旧搜索行；Esc焦点恢复单独失败V02/MN04；SIDE |
| SB02 | 分区点文字折叠、hover 箭头，重载保持；特殊分区分别记录 | UI + 持久化；多个分区 | 通过；置顶/工作区/单工作区文字折叠、hover及重载保持；Space演示可折叠但重载恢复展开，非本轮持久化范围；SIDE |
| SB03 | 默认每组 5 条，展开 / 加载更多 / 收起正确；远端分页另标范围 | fixture UI + 测试；数量与分页状态 | 通过本地范围；默认5条及运行中例外、展开/收起；实际远端分页未覆盖，独立依赖；SIDE |
| SB04 | 工作区 / 单列表 / 时间视图及各日期分组正确，需要处理置顶 | fixture + 真实状态 + 测试；日期基线 | 通过；工作区/单列表/时间路线，今天/昨天/周/月/跨年样例及真实需要处理置顶；SIDE |
| SB05 | 审批 / 失败 / 跑完未看可区分；A 后台完成出现未读，打开清除；中文时间 / hover 尾部正常 | Electron + 状态样例；A/B 切换 | 通过代表状态；真实后台完成→未读→打开清除，审批fixture及真实失败红标区分；中文时间/hover代表行，不声称每种异常逐个操作；SIDE |
| SB06 | 会话 / 工作区拖拽插入线和顺序正确，最近更新下拖切手动并提示，重启保持 | Electron；拖前 / 后 / 重启次序 | 通过；真实Electron会话/工作区拖拽2px插入线、切手动提示、重启顺序；主动切回最近会重置顺序，另记；SIDE |
| SB07 | 归档过滤三态正确，取消归档回正常列表，重启状态正确 | 隔离 UI；归档 / 过滤 / 恢复 | 通过；归档三态、重启保持及取消归档回正常列表；SIDE |
| SB08 | 恢复默认只改视图选项，不改会话内容 / 归档 / 置顶 | UI + 存储对照；业务状态保持 | 通过；恢复默认前后业务元数据相同（置顶/归档保持）；补验两条非空正文Journal UTF8字节/正文完全保持；SIDE、SIDE-SUP |
| W01 | 正式首次空 registry 建普通 Documents 默认项；已有工作区不补建，区分开发 fallback | 隔离 Electron / 服务测试；目录 / registry / 环境 | 通过隔离主进程分支；Documents真实路径先隔离，空registry建普通默认项，已有项不补；不是打包版首装；SIDE |
| W02 | 移除最后工作区回新建页，不自动建空会话；重启不重建隐藏默认项 | Electron；会话数 / registry / 重开 | 通过；移除最后项回新建页/0会话，重启不重建隐藏默认项；SIDE |
| W03 | 无工作区禁发并提示选择；选择有效项恢复，不静默回退 | no-workspace + Electron；提示 / disabled / 恢复 | 通过；无工作区禁发/提示，实际选择注册有效项后恢复；目录选择返回值仅限隔离路径，未静默回退；SIDE |
| W04 | 旧 Downloads 默认项迁移；孤立旧会话隐藏但原数据不删除 | 升级数据副本 + 服务测试；迁移 / 原记录对照 | 通过；旧Downloads默认项迁移，合法无cwd旧Journal仍可IPC读取/字节不变但侧栏隐藏；SIDE |
| W05 | 移除项不被会话分组加回；目录加载不无关阻塞；移除当前项切换合理 | UI + 状态测试；重载 / 加载期 / 切换 | 通过；移除当前项切D/重载不加回；Host目录IPC异步延迟15秒，pending期间切会话/开菜单280ms响应；SIDE、SIDE-SUP |

## 相邻链路与共同门禁

| 编号 | 操作、状态与预期结果 | 计划方法 / 核心证据 | 结果 |
| --- | --- | --- | --- |
| H01 | 内置 Harness 历史升级 / 连续升级恢复正常，未变化不无故新建版本 | 隔离升级样例 + 恢复测试；版本 / 恢复结果，首启不能替代升级 | 通过隔离历史样例；正式main连续恢复revision1→2→3，未变化重开仍3；旧hostContractDigest合法校验，不冒充旧发布二进制；SIDE、ENG |
| H02 | 升级后新请求完成、停止不遗留队列、present 链路可用 | Electron / Provider；复用 T08 / D04 | 通过；升级后真实完成、停止aborted、后续请求暂停队列经继续发送后write/present完成；精确A会话Journal，非原结果末尾B摘要；SIDE |
| V01 | 浅深 × 1440 / 480，必要 479 边界；文字 / 图标 / 浮层可读、无非预期溢出 | 各组复用主题尺寸路线；关键 / 异常图 | 通过已列代表路线；模型36组合、侧栏浅深1440/480/479无横溢出，轮尾边界/轨迹关键样式；不声称每组件全状态矩阵；MODELS、SIDE、TR-FIX |
| V02 | 按钮 / 菜单 / 弹窗键盘操作、Esc、焦点回归、disabled 明确 | 实际 UI 操作，不只截图 | 失败 MN04；搜索Esc焦点落BODY；返回/用量/视图菜单Esc与焦点路线通过，见分组边界；SIDE-FOCUS |
| E01 | 当前依赖 / renderer / main 构建与 Desktop 类型检查 | 命令、版本、时间、退出码、日志 | 通过；统一构建 3 项 + Desktop typecheck exit 0 |
| E02 | Desktop 全量含 watcher / 旧失败项，以及 client / projection / shared / present 测试 | 既有测试；全量与定向复核分开 | 通过；Desktop 1917 通过 / 7 跳过；相关包与 Harness 恢复通过，见工程记录 |
| E03 | token / theme / bridge / IPC / 构建图 / docs / diff 检查 | 仓库命令；各退出码和输出 | 通过；token/theme/bridge/IPC/build-graph/docs/diff 均 exit 0；收尾重跑 docs/diff |
| E04 | 构建 / 最终源码一致，无验收引入产品修改，临时凭据 / 自建进程清理 | 基线 / 最终指纹、Git 状态、清理清单 | 通过；HEAD/4129个跟踪文件指纹复核，产品源码/测试/配置未变；自建实例/凭据/原始Journal清理，只留验收文档与脱敏证据；FINAL |

## 操作分组与覆盖关系

1. **P0 构建与隔离**：批准后冻结版本，构建依赖 → renderer → Electron，确认 preload / IPC，建立独立数据目录。
2. **P1 fixture / 设置**：轨迹 errors / complete / streaming-long；各模型二级页；turn-deliverables 的用量 / 改动 / 交付；sidebar 的搜索 / 视图 / 排序 / 归档。主要交互后复用主题 / 尺寸路线。
3. **P2 真实路线**：Thinking OFF / ON 完成及统计；长输出增长 / 搜索 / 停止；立即 / 中途失败；真实 present；侧栏未读 / 持久化；工作区首次 / 迁移 / 移除重开；Harness 升级。
4. **P3 工程与汇总**：全量及相关测试、独立性能采样、指纹 / 清理；逐验收点归档，不用操作组代替覆盖范围。

具体条件、公式、命令、分工和阻断规则以 [执行计划](../../exec-plans/completed/20261015-main-frontend-acceptance.md) 为准。

## 结果记录原则

每点补齐结论（通过 / 失败 / 未覆盖）、实际版本与环境、方法、步骤、预期 / 实际、证据路径、关联 Bug。组合项部分通过需列子项，不能整体标通过。

Bug 记录包含编号、影响点、优先级、前端 / 后端 / 环境 / 未定位、复现、预期 / 实际、影响、核实原因 / 线索、证据与复验条件。只记录，修复由用户另行安排。

最终汇总：53通过、5失败、2部分覆盖。失败对应T08/T11/T12/S03/V02，部分覆盖对应T18/D05；4个确认Bug及O01观察分别记录。界面、工程与外部依赖分开判定，本范围不声称整体通过。

## 当前准备记录

用户要求先出计划之前，已记录 main 指纹并启动依赖 / renderer / Electron 构建，三项均成功结束，见 `tmp/codex-acceptance/20261015-main/build-results.json`。上述为规划时准备记录；2026-10-16用户批准后，三组完成隔离界面验收与补验，最终源码与构建基线一致。

准备结果不自动代表功能通过；以上逐项结果均注明实际证据及限制，无法执行的子项保留部分覆盖。

## 工程验证（当前版本）

- 依赖 / renderer / Electron 构建 3 项成功；批准时源码指纹保持一致。Desktop typecheck exit 0。
- Desktop：235 文件通过、2 文件跳过；1917 测试通过、7 跳过。包含 watcher、旧 preload/IPC/tooltip 失败项，当前整次全量无失败。跳过项另有显式性能 5 项、editor-poc 1 项及 SSH 1 项；性能已单独运行通过，远端 SSH 不在本机证据范围。
- client 26、session-projection 15、shared 166、filesystem-read 8、harness-control 28、harness-hmr 5、projection-cache 2、runtime session-projection 15、进程 Harness 恢复 1，均通过。
- `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:ipc-channels`、`check:desktop-build-graph`、`check:current-docs`、`git diff --check` 均退出 0。
- 性能：2000 chunk 增量路径 p95 **0.368ms**（阈值 <2ms），5 项通过；普通事件定稿层重建 p50 12.908ms / p95 **22.543ms**，保留 O01，不由流式通过关闭。
- 真实 Electron：复用现有脚本、只调整隔离目录与证据清理，11 项通过：真实 Journal、preload、IPC revision、历史分页、UI 较早历史、助手工具跳转、结果、Schema、通知、草稿往返、重载。数据目录已删除，保留脱敏截图。
- 独立宿主探针：多请求统计、首 token 后 2000 chunk 零统计更新、无首 token / 零解码、3600 事件完整 replay / checkpoint 对账通过；失败重试模型用时失败，见 MN03。

证据根（本地，不随仓库分发）：`tmp/codex-acceptance/20261015-main/engineering/`。批量命令及时间/退出码见 `results.json`；追加检查见各独立 `.log`、`stats-probe.json`。界面证据另按验收点列出，不由工程通过推断界面通过。

## 已确认问题

完整背景、复现与建议见 [Bug 记录](bugs.md)。当前 MN01 失败行灰色、MN02 停止/失败后部分正文丢失、MN03 失败重试模型用时漏计、MN04 搜索 Esc 后焦点丢失；另保留 O01 性能观察。未进行任何修复。

## 实际方法与证据索引

下表路径均相对 `tmp/codex-acceptance/20261015-main/`，为本地证据、不随仓库分发。各运行唯一目录；失败的工具尝试也保留，但不作为通过证据。报告内数值与复现步骤是可交接主体，不要求接收者持有临时截图才能理解结论。

| 索引 | 方法、入口和证据 |
| --- | --- |
| TR-REAL | Playwright 真实 Electron + DeepSeek：`trajectory-stats/real-33rk83/`、`real-JkX5OT/`；正文/预览独立两时点 JSON，新词基线/出现/输入/命中/清空，停止/草稿路线 |
| TR-STOP | `trajectory-stats/real-JkX5OT/stop-final-body.json`、`stopped-editable.png`、`growth-first.json` / `growth-later.json`；aborted 终态及实际编辑，正文保留失败 |
| TR-STATS | `trajectory-stats/real-X5gBTb/results.json`、`independent-accounting.json`、stats true/reloaded/reopened；真实 OFF/ON 完成与统计独立对账 |
| TR-USAGE | `trajectory-stats/real-qhDkjb/results.json`，真实弹窗6,310tok=6,176输入+128缓存+6输出，$0.001861预估；client/shared既有重试/唯一计数测试另 ENG |
| TR-ERR | 真实 DeepSeek 人工无效key：`trajectory-stats/invalid-4ICly2/`；本地可控兼容SSE（非真实提供方故障）：`trajectory-stats/real-azhrr6/`，失败前/即时/刷新图及终态 JSON |
| TR-FIX | Playwright 浏览器 errors / complete fixture：`trajectory-stats/fixture-zt2nAH/`，七类详情、搜索折叠、列表/思考主题尺寸；正文列表为明确网络fixture，无 DOM 注入 |
| TR-SUP | `trajectory-stats/supplement-Oq1D0p/`、`supplement-rD7D1q/`：系统diff/关联/请求审批、JSON展开、时间轴与320/720边界；当前尺寸与 DSH 本地 CSS 源码对照 |
| TR-FRAME | 独立浏览器 quiet-window：`trajectory-stats/frames-DMhymv/`，短198/长680帧 raw、可见行91样本分析、离尾详情增长。虚拟化移除离屏行不误记重新挂载 |
| TR-LONG | 真实 Electron + 确定时间 Journal（非25次Provider）：`trajectory-stats/long-stats-LfCFcY/summary.json`、`long-stats.png`；全25轮timing=75000/50000/25/25000/250，UI75秒/2秒/10TPS |
| ENG-IPC | `engineering/verify-electron.log`、`electron-trajectory.png`；复用仓库正式脚本，副本仅调整隔离目录/权限/证据清理 |
| ENG-PERF | `engineering/trajectory-perf.log` 5项；全量内 `trajectory-live.test.ts` 8项、`trajectory-streaming.test.tsx` 4项证明增量/等价/节点行为 |
| ENG-STATS | `engineering/stats-probe.json`、根下 `probe-stats.mjs`：正常多请求/2000chunk增量/零解码/3600事件replay与checkpoint，含明确失败重试样例；cache与Runtime slim的正式测试另日志 |
| ENG | `engineering/results.json` 16条命令开始/结束/退出码，及 cache、runtime projection、perf、Electron追加日志；全量结果与定向证据分开 |
| MODELS | `models-delivery/1792080553897/results.json`、`report.md`、`real-present-sanitized.json`、主题尺寸/preview/Review截图；补测证据独立文件 |
| SIDE | `sidebar-workspace/run-001/`：mock/electron/migration、upgrade-final、upgrade-journals-sanitized与拖拽插入线、业务状态对照；完整逐点见分组详情 |
| SIDE-SUP | `sidebar-workspace/run-001/supplement.md`、`supplement-results.json`；合法非空正文Journal重置视图前后保持，Host目录真实IPC在独立进程仅加15秒异步延迟，pending期间导航/菜单实际响应 |
| FINAL | `final-fingerprint.json`、`engineering/final-docs.log`、`engineering/final-diff.log`；4129跟踪文件对照、允许文档变更、私有文件名扫描和自有端口清理 |
| SIDE-FOCUS | `sidebar-workspace/run-001/focus-visual-results.json`、`search-esc-focus.png`；浏览器fixture实际焦点与只读源码对照 |

## 历史与外部覆盖边界

- B01 原旧开发/HMR窗口没有访问或重建。当前新进程路线通过，不足以关闭旧窗口根因；需要原窗口/原HMR条件才可专项复验。
- B02 停止中残留在当前真实点击路线未复现，状态恢复已通过；本轮新发现的是停止后正文丢失 MN02，两者分开。
- B03 Thinking OFF 请求失败在当前正式UI样本通过；B03-R1灰色错误仍失败。
- 旧“中途失败需刷新”在本地SSE合法失败终态已即时显示，刷新一致；部分正文丢失另 MN02。
- DSH 参考的数值/样式源码对照与本机当前UI测量有证据；没有同主题/viewport下启动两页比较，不声称像素或双页视觉全部通过。
- 原生 Computer Use 因认证方式被工具拒绝，本轮全部自动界面证据明确为 Playwright；系统应用最终打开、Finder最终选中无法由UI“已请求”证明。
- 真实远端Host、Word/Excel、跨平台打包及旧发布版二进制升级不是本机mock可替代的门禁；按本计划的外部依赖保留，未安装软件或接触用户私有数据。

## 模型与轮尾的实际覆盖

- 模型路线逐项进入 Moonshot、Anthropic、自定义、OpenAI、MiniMax、OpenRouter、Z.AI、Xiaomi、火山方舟 Coding Plan，返回均按添加入口。配置初始页浅/深×1440/480共36组合，保存首屏与滚动页脚72张本地图；DeepSeek已配置详情另做浅深/窄窗。空字段下保存/测试/继续 disabled。Anthropic和自定义需要真实认证后的后续模型目录，不由初始表单验证声称认证可用。
- 异常状态用合法隔离 settings 的 lastConnection unavailable 与人工无效验收 key，不发网络，证明红色「连接异常」投影；正常绿色与模型启停已真实操作。未配置内置服务只出现在添加目录，不误判其缺少卡片。
- 费用补验通过明确网络fixture构造 provider-reported（$0.0102且无预估）及已知+未知混合（162,940tok，显示部分未知），不是伪造真实Provider价格。原始fixture已覆盖预估/全未知。重试消耗与无usage唯一计数由相关包正式测试支持。
- 改动fixture每轮2/6/1文件，第三轮+1/-1；第二轮原本含创建后删除的临时脚本，最终不显示。长diff120行达到420px上限，内部区域356/2694px，实际wheel滚动0→500。
- 真实Provider两次present共验证2与4文件布局，含文本、CSV、Markdown、JSON；各文件存在、名称/描述/图标和预览有证据。代表性样本不会写成每个1/2/3/4数量均已单独执行。
- 关联菜单13项应用有图标/本地化名称；点击默认打开和Finder显示位置获得请求反馈。AppleScript只读系统状态等待系统授权已取消，原生CUA认证不可用，因此系统最终打开/选中仍未覆盖，不以反馈关闭该门禁。
- 隐藏改动与图片组合已实际补验：明确网络fixture走 generate_image 正式投影、返回本地1×1 PNG artifact，开→关 changes3→0，图片1/交付6均不变；关后仍可打开预览。图片是验收fixture，不是真实模型生成；设置重启持久化另由真实Electron验证。

本组主要证据 `models-delivery/1792080553897/`，补验 `supplement-1792081511822/` 与 `image-supplement-1792082019526/`，说明见 `supplement.md` / `image-supplement.md`；真实文件/工具终态脱敏摘要 `real-present-sanitized.json`。隔离原始Journal、设置与凭据已清理。

## 侧栏、工作区与升级的实际覆盖

- 搜索、折叠、归档、三种视图及拖拽在浏览器fixture和隔离Electron分别取证；默认五条之外，活动/运行中会话允许例外。实际远端分页未接入，不能写成已经操作远端加载更多。Space演示的折叠重载不保持单独记载，Space本身不在本计划范围。
- 后台A完成时B仍打开，A出现未读及需要处理分组，打开A后恢复idle；审批使用明确fixture，失败标记复用真实401失败截图与Journal，失败标记未单独采DOM state，不写成全状态矩阵。
- 恢复默认前后四条业务元数据完全一致，包含置顶与归档；补验两条合法非空正文会话，恢复默认前后原Journal UTF8字符串1629/1633字符完全相同，正文可见、置顶A/归档B保持。拖拽会自动切手动并提示；重开保持最终手动顺序，主动改回最近排序不声称仍保持原手动顺序。
- 首次默认工作区验证隔离 Electron documents 路径，在导入main前设置，开发fallback显式等于该隔离Documents/default，验证的是正式registry分支；没有触碰用户Documents，也没有使用打包首装二进制。无工作区选择器只对隔离路径提供返回值，后续注册/禁发恢复走实际产品UI。
- 迁移样例包含合法 SessionStore 写入的无cwd旧会话，IPC仍能读到、原Journal字节保持、侧栏隐藏；旧Downloads默认项退出，已有普通项目不被新增Documents项替代。
- Host目录加载补验只在自有进程包装真实 `host-connections:list` handler加15秒异步等待，pending started1/finished0期间切到B正文并打开视图菜单共280ms；没有改实现文件，不声称远端导航可在自身目录未知前完成。
- Harness连续升级使用合法历史hostContractDigest与重算校验和，正式main读取历史并生成revision1→2→3，不变重开仍3；保留当前模板artifact字节，不冒充旧发布版二进制迁移。升级后新请求、停止与继续发送、真实write/present链路通过。
- H02准确证据是 `upgrade-journals-sanitized.json` 的A会话 `0df1e08e-5283-48a6-a9cd-cbf77a707ef5`：completed seq557、aborted seq704、completed seq2978，present call/result seq1358/1360。旧 `upgrade-final-results.json` 末尾 journal 摘录误取只有三条种子事件的B，不作为H02证据；其宽泛字符串计数不作为工具调用次数。

本组逐点报告为 `sidebar-workspace/run-001/ui-summary.md`，源数据包括 `mock-results.json`、`electron-results.json`、`migration-results.json`、`upgrade-final-results.json`、`upgrade-journals-sanitized.json`、`approval-results.json`、`focus-visual-results.json`。原生CUA认证受限，以上实际UI均为Playwright方法。

## 最终版本与清理

最终核对HEAD仍为 `00e5a159d2bc45fe6f6a7ec4d4da7a5162a9f745`。4129个执行起始跟踪文件逐个SHA256对照，仅计划索引Markdown有变化，产品源码/正式测试/配置无变化。本轮新增归档计划及4份验收Markdown，未提交。

三组自有Electron/Chrome、受控SSE及自有Vite5187/5191均关闭；补验独立进程也已退出。私有数据目录、凭据、完整原始Journal删除，证据根按文件名复核未遗留settings.json/.env/credentials.json、jsonl/pem/key及private目录；仅保留脱敏结果/截图/验收脚本。系统应用可能仍显示本次临时文件，不关闭用户应用窗口。清理声明及最终核对见FINAL，不将文件名扫描当作对全机的秘密审计。
