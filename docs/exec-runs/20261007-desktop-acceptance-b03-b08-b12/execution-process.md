# B03 / B08 / B12 — 执行过程

- 关联计划：[修复计划](../../exec-plans/completed/20261007-desktop-acceptance-b03-b08-b12.md)
- 执行模式：交互；用户已批准三项方案。
- 初始基线：main d7eb0431；已有未提交内容均为上一阶段验收产物，保留。

## 2026-10-07：实施准备

- B03：renderer订阅`reviewChanged`，主进程转发coordinator通知，但当前生产入口没有文件监听调用`scheduleInvalidation`。
- B08：Desktop搜索端口创建时读取一次`searchCredentials`；后续搜索闭包复用该对象，与同会话断开后仍有provider的实测相符。将以实际fetch请求回归确认。
- B12：`runLocation`仅进入Composer展示；`ensureSession`、`createSessionForInput`和main建会话请求未传递工作树意图。既有`prepareExecutionContext`已提供真实Git创建与回滚能力，优先复用。
- 尚未改产品代码，接下来先建立失败回归。

## 实施与首轮回归

- B03/B08先运行失败回归：外部写文件后没有watch通知；同端口断开智谱后fetch仍调用两个provider。接入Review根目录/Git元数据监听、按调用读取最新搜索凭据后通过。
- B12 renderer失败回归确认建会话时遗漏runLocation/branch；接入既有Git准备/回滚服务，Session header新增可选worktree事实，经Runtime快照、全局列表和client投影回UI。旧journal无该字段仍兼容，fork保留绑定。
- B12额外检查发现无远端Host时新建按钮提前创建本机会话；统一延迟至首次发送，防止最终选择被提前绑定覆盖。首次发送只对已有同一会话执行setWorkspace，新建工作树返回目录不会被旧闭包写回。
- 首轮定向Desktop 19/19、Runtime投影与冷重开19/19通过；依赖、Electron、renderer构建通过。Desktop全量首轮1673通过/2失败/2跳过，两处为新增guard覆盖表及createSession参数断言，已更新并继续回归。
- 工作期间检测到外部提交fdce701a收录此前已写变更；本智能体未执行git提交/暂存/推送，继续保留其上后续修复与验证记录。

## 补充边界与最终工程检查

- 新增App“本机新建按钮→工作树选择→首发”回归，明确首发前不调用create、首发携带选择、返回worktree后不调用旧目录setWorkspace。相关旧测试调整为延迟创建语义。
- 补测linked-worktree独立index、共同refs、lock过滤、异步安装期间dispose；Journal旧header、绑定cwd校验和fork继承通过。
- 工作树目录不写长期registry；启动恢复保留worktree元数据，按sourceWorkspaceRoot恢复原工作区；Review复用session-root授权，在无registry记录时也可读取并监听工作树。专项admission/Review回归通过。
- 完整Desktop第二轮1677通过/2跳过；补充上述用例后再跑最终全量。shared163、client23、journal12、agent-service32通过；新增journal header1通过；Runtime19通过。
- 最终Desktop typecheck通过；build:deps:dev、build:electron、build:renderer通过。renderer沿用现有CSS highlight解析和较大chunk警告，无构建错误。
- IPC channel、renderer bridge、package boundaries、check:docs、diff whitespace通过。
- 真实Electron由同工作区pnpm dev:log启动，子智能体校正主进程身份后执行；浏览器mock测试仅作为自动回归，不替代Computer Use证据。

## 真实桌面复验与补充检查

- 最终全量Desktop：1680通过、2跳过。收尾补齐兼容sessions.list的worktree字段，以及侧栏翻页游标按来源工作区分组；定向5项与Desktop typecheck通过。
- B03：原生Review打开不操作时，外部追加唯一marker后sample.txt从+1自动变+2，准确展示marker；恢复字节数85。恢复时面板已切走，返回后显示+1，仅自动出现的正向过程有连续证据。
- B08：同一真实会话3618e60e-f8b0-4435-a3b5-c6ffa7409b1e，断开前工具结果seq74为tavily,zhipu；设置断开后、不重启，seq381实际web_search完成且Providers只有tavily。凭据仅检查字段是否存在，不输出值。
- 工作期间外部提交9bf30f06再次收录代码/文档并调整截图忽略；未撤销这些外部改动，也未自行执行提交。

- B08恢复：正常Quit后仅合并本轮私密备份中的zhipu加密条目，断言其它条目未变；重启主进程62138，真实设置再次显示智谱/Tavily 2/4。
- B12首发：UI明确fixture/codex/acceptance-alt/新建工作树，Session56149031-44dd-4907-b1fe-90e65e08af6d创建成功。真实bash结果seq89的pwd为ActSpace/worktrees/41969623/git-workspace，分支actspace/41969623；header持久化相同cwd、来源、baseBranch与baseCommit。原fixture仍main；generated worktree没有进入长期workspace registry。冷重启绑定仍待随后复验。

- B03补齐连续回退：同Review面板无操作，UTC15:20:28追加B03-ROUNDTRIP-20261007后+1→+2；UTC15:23:49仅移除后+2→+1，旧文本和图片保留，85→108→85字节。先前未连续观察的子项经独立第二轮完成，不追认旧截图。
- B12切换另一会话再返回，仍显示actspace/41969623·工作树；进入最后正常退出/冷恢复验证。

- B12正常Quit后以同dev:log冷启动main69765，同Session真实bash seq681（UTC15:31:37.831）再次pwd/branch，仍worktrees/41969623/git-workspace与actspace/41969623，exit0。冷恢复核心门禁通过。

- 最终收尾：原生菜单精准归档56149031、3618、33f64三个验收对象；保留新建fixture工作树，不删除既有资源。真实UI确认Light、默认DeepSeek、搜索智谱/Tavily2/4、原连接名称，主进程69765留在可用空新建页。
