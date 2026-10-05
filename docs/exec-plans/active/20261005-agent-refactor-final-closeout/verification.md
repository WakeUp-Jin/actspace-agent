# 验证顺序、目标证据与逐项验收

本页是[主计划](README.md) T4–T6 的执行契约。现有测试路径表示可以复用的依据，不表示本轮已通过；不能以历史测试数量代替新结果。

## G：执行前固定的目标证据

| ID | 原始要求与必须证明的结果 | 复用证据入口；本轮签收方式 |
| --- | --- | --- |
| G1 | Harness/Loop 可替换；同 Session 旧 Run 固定原组合，后续 Run 选新组合 | `packages/agent-service/src/test/harness-run.test.ts`、`packages/runtime/src/harness/managed-runs.test.ts`；运行后记录不同组合身份与结果，结构化非文本结果不依赖默认 Loop |
| G2 | 启用独立授权；候选失败保留原组合；成功启用不被旧实例清理错误逆转；租约释放后回收 | `packages/harness-control/src/test/activation.test.ts`；保留失败/竞争/授权过期/持久失败/释放测试，不能删为“旧架构测试” |
| G3 | 恢复不兼容阻断执行而保留维护；重启不重演未知副作用 | activation/selection-store 测试、`scripts/test/harness-recovery-process.test.mjs`、host-blocked/host-receipt 进程测试；区分客户端重连和 Host 崩溃 |
| G4 | Host 与客户端生命周期分离；断开仍执行；队列/回执不重复接纳；维护拒绝新任务 | `scripts/test/host-process.test.mjs`、host-lifecycle/host-receipt/host-subagent-drain；CU7.4–7.9 补界面侧。退出本地内嵌 Desktop 不要求后台续跑 |
| G5 | 队列存内容，交付读取当前配置；审批暂停预算、截止时间和取消仍有效；子 Run 独立选择且继承约束 | `packages/agent-service/src/test/run-manager.test.ts`、task-ledger/session-commands，`packages/subagent/src/test/provider.test.ts`、Runtime subagent-session，Host/approval 测试；每项映射具体用例，缺断言则补，不把目录整体 PASS 当证明 |
| G6 | Session 业务不依赖 JSONL 文件布局，读写/列表/fork/恢复/释放经同一 port | `packages/runtime/src/session/storage-neutral.test.ts`、session/storage Memory、jsonl storage、persistence provider-seam/recovery-fork/fork-artifacts；检查依赖方向和两实现同契约，Memory 不证明磁盘耐久性 |
| G7 | Cordis 是统一服务/事件/生命周期基底，通知失败不能替代关键 await，也不宣称回滚外部副作用 | cordis-adapter 与 core/agent-loop package tests、`pnpm check:harness-events`、`pnpm test:harness-events`、Runtime lifecycle；核对事件模式、observer 异常隔离、关闭顺序 |
| G8 | 目录易理解、冗余结算、文档同步、设置/凭据/连接保留 | cleanup-ledger 每输入有结论、目标目录对照、已知旧 API 守卫、保护区哈希/入链增量、CU1 设置/重开。配置仅用 synthetic secret 验证，不读取真实凭据内容 |

每个 G 的结果必须附最终源码快照标识、测试名或 CU 子项、日志/证据路径。无覆盖的具体断言先补验证，不反向删掉目标。不是每个 G 都要求额外创建一套测试。

## V-CLEAN：从最终源码建立可复现环境

1. 实施前记录 HEAD、完整 status（含未跟踪项）、tracked/untracked 文件内容哈希和受保护文件哈希。备份只覆盖将修改的源文件，存 `tmp/refactor-final-closeout/baseline/`；不移动原文件，不备份真实 `.env`/凭据到可提交目录。
2. T1–T3 完成后停止本轮 watch/build，生成允许复制的源码列表：当前存在的 `git ls-files` 加 `git ls-files --others --exclude-standard`，扣除已经批准退役/取消跟踪的项。包含新 Session storage 包与全部本轮未跟踪源码；不得只基于旧 HEAD。
3. 清单显式排除真实环境配置、依赖、dist/dist-electron、artifacts、.astro、coverage、日志、tmp/.tmp/.agent-tmp/target、嵌套 .git 和已确认的编译旁产物；`.env.example`、手写 JS、正式静态资产必须保留。检查每个符号链接：只接受目标仍在快照内的项目链接，不跟随链接复制仓库外数据。
4. 在系统临时目录创建独立本地 clone（`--no-hardlinks --no-checkout`，来源为当前仓库），按上述文件清单复制**当前内容**，不存在于最终清单的旧文件不恢复。只在该隔离副本更新索引以供 git-aware 检查使用；不修改主工作树索引、不 commit/push。记录快照文件哈希清单，复制前后不一致则重做。
5. 确认快照内无旧 dist/artifacts/node_modules，运行主计划 T4 命令。使用仓库固定 pnpm、Node 满足 CLI engines、Go 使用 go.mod 工具链要求；先验证本机 ssh/sshd、Electron 和系统编译能力。依赖安装允许取包，但不需要任何线上模型账户或 API Key。
6. 打包先执行 `pnpm package:agent-cli`，记录新 tar 的哈希、大小和构建日志，再执行 `pnpm test:agent-cli:package`，不能接受旧主工作树 tar。生成脚本会清理其输出，必须仅在隔离快照路径中执行。
7. 若修复产品源码，重新更新对应快照内容和哈希；最后完整执行 `pnpm test`。若打包过程随后重建了 dist，产物 smoke 使用重建后 tar；不得将重建过程与进程测试并行。最终源文件未变、生成树无已删除旧输出才可签收。

该过程证明“最终工作树源码可独立重建”，不证明 HEAD 已包含变更，也不证明既有 WIP 可以拆成独立提交。真正提交由用户另行授权。

## V-GUARDS：检查器、CI 和迁移验证

- CI 对照：主计划包含 frozen install、base CI、site check/test/build、matrix check、typecheck、Browser TS/JS/Go、workspace test/build；记录各步通过、失败或环境阻塞。Markdown lint 复用 `.markdownlint.json` 与 CI 固定 action 所用工具规则；本机缺工具时在隔离工具目录取得该 action 对应版本，不修改项目依赖或把缺工具写成通过。全仓历史失败和本轮新增失败分开报告。
- 矩阵：隔离快照 artifacts 不存在时先执行 `pnpm run gen:contract-matrix --check`，应通过；独立 fixture 改声明但不改 Markdown，应失败；普通生成产生 JSON 与 Markdown，二次生成字节相同。JSON 不存在是允许状态，Markdown 不存在不是。
- package cutover：`.astro` 的旧词不误报，生产 `.ts/.mjs` 的旧 Runtime 引用必须让 strict 失败；测试覆盖真实字符串及既有路径匹配，不能全局豁免包含旧词的目录。
- 移动脚本：三个 diagnostics 的 help/无网络输入路径成功；cache analyzer 使用本地 synthetic JSON。Terminal spike 的 run/prepare/package 三入口同步根路径并在 macOS 隔离环境 smoke，packaged native smoke 不等于签名/公证验收。若保留脚本却无法运行，记阻塞，不能以语法检查替代。
- 文档：执行 check:docs/current-docs；对清理目标从所有 docs、根说明、apps/site 扫描 Markdown/HTML/文本路径入链，并检查锚点。保护区只读比较断链新增集合为零；原有断链不通过重写历史解决。
- 跟踪/产物：`git ls-files artifacts` 为空；用 `git check-ignore --no-index` 确认 artifacts 路径忽略；root output/target 消失；构建后再次核对无 src 下新生成文件。取消跟踪只限定明确 artifacts 路径，不广泛 stage 其他变更。

## V-CLI：完整承接旧 P05 欠账

新建 `scripts/test/fixtures/agent-provider.mjs`，共享给 CLI 进程回归和 CU。只监听回环动态端口，以控制文件报告端口；固定回复、请求计数、持有/释放响应、一次 429/503 后成功、持续错误、终止错误都由显式 scenario 控制。fixture 的配置文件和日志仅存隔离目录，不输出 Authorization。

| 子项 | 驱动和断言 |
| --- | --- |
| CLI1 | 可重试错误一次→成功；观察至少两次 HTTP 请求，Task 接纳一次、用户消息一次、最终结果一次，不能把正常 retry HTTP 次数误判重复提交 |
| CLI2 | 超出预算/终止错误；按现有 CLI 契约断言确定非零退出码、failed 状态、错误原因和失败结果一次；不以“任意非零”掩盖崩溃 |
| CLI3 | 成功和错误均分别验证 `--json` 单对象、`--jsonl` 每非空行合法事件/结果；解析失败立即失败，不过滤坏行；诊断只进 stderr 且不包含 synthetic credential |
| CLI4 | `--persist` 后读 Journal/Task settlement；新进程 resume 后保留同 Session 和既有结果，新消息只执行一次，旧失败或完成任务不自动重跑 |
| CLI5 | 重试等待期间 SIGINT；130 退出、aborted 持久终态、无新增模型请求；已存在双 SIGINT 场景继续保留 |
| CLI6 | 成功、最终失败、取消三条路径都能再次取得 Session writer，子进程退出、连接关闭；先按 fixture 请求标识检查正确路径确实跑过，再断言资源释放 |

新测试接入已有 CLI process 命令；retry/error 对应生产 LLM/协议路径，不能通过替换整个 Run mock 达成。新增 fixture 是测试支持，不增加产品参数或运行服务。

## V-FIXTURE：可重建的 Computer Use 环境

实施时创建 `scripts/acceptance/agent-refactor/fixture.mjs` 和相邻 README，复用上述 Provider fixture。现有 `/tmp/actspace-storage-cleanup-cu/{provider,proxy}.mjs` 仅作为行为参考，先剔除硬编码路径，不复制其 settings/secrets/证书/请求日志；新环境不依赖这些临时文件存在。

- `node scripts/acceptance/agent-refactor/fixture.mjs start --root <隔离绝对路径>`：创建 synthetic settings/credential、两种测试模型、单个带唯一标记的测试 Skill、有效小 PNG 和超出当前限制的 PNG；生成本轮自签证书，启动本机 Host、WSS proxy、Provider，端口由系统分配。输出 env/ports/PID 清单及 Desktop 启动命令，不自动操作真实窗口。
- `fixture.mjs control --root <路径> --action <动作>`：动作固定为 hold/release、summary-error/summary-ok、title-hold/title-release、offline/online、upload-error/upload-ok。控制只作用于本轮 PID/端口；正常协议请求与控制入口分离。
- `fixture.mjs stop --root <路径>`：只关闭本轮记录的进程并等待退出；保留脱敏证据。重复 stop 安全，不能按进程名称杀掉其他 Electron/Host。
- Desktop 用 `ACTSPACE_DATA_DIR` 与 `NODE_EXTRA_CA_CERTS` 指向隔离根，在明确的 workspace 中执行 `pnpm dev:log`。启动后从日志取得真实 appId/PID，UI 确认任务工作区为临时 workspace，防默认 Downloads 归一化破坏隔离。
- 启动 smoke 检查模型列表、Host ready、WSS 配对和控制路由；title hold 必须先看到对应请求标识再释放，不能用固定 sleep 假造竞争。Provider 日志记录 model/配置/Skill 标记/请求 ID，仅作 UI 操作辅助证据。
- SSH 路线复用 `apps/desktop/src/main/test/remote-host-ssh.test.ts` 的隔离 sshd 方法：fixture 在自身根目录生成 host/device key、authorized_keys、ssh_config 和 known_hosts，仅监听回环动态端口，不修改用户 `~/.ssh` 或系统 sshd。启动 smoke 先验证隧道，再将配置路径供 UI 使用；系统 sshd 不可用时明确阻塞 CU7.9，不悄悄改验 WSS。

这些入口在实施阶段编写；此页固定接口、状态和结果，不要求用户先准备新的账户。UI 无法到达的畸形 ID/路径越界输入由自动化覆盖，不列作无法完成的 CU 点击任务。

## CU：逐子项签收

每行独立记录状态和证据。同一次操作/截图允许支撑多行，但不能以场景总 PASS 代替子项。开始前 Sol 先读 AGENTS、FRONTEND_VERIFICATION、本页和 fixture README。

| 子项 | 操作或触发 | 预期/证据 |
| --- | --- | --- |
| CU1.1 | 规范命令启动隔离 Desktop | appId、workspace 正确，首屏无构建错误 |
| CU1.2 | 设置中选模型/修改无敏感测试项、保存 Host 连接，Cmd+Q 后重开 | 设置/连接保持，synthetic credential 仍可用但 UI 不泄漏，原 Session 可续聊 |
| CU2.1 | 新 Session 发送 hold 流式任务再 release | 接纳/首段/终态和发送按钮正确，请求与消息唯一 |
| CU2.2 | running 时点击停止 | Task 取消、UI 回空闲，后续请求不继续 |
| CU2.3 | 同 Session idle Plan→Agent 分别发送；running 查看模式入口 | 下一 Run 消费新模式；running 不允许改变本 Run 模式 |
| CU2.4 | 队列等待时切换模型，再消费 | 实际交付读取所选模型，旧请求不重启 |
| CU2.5 | 选择 fixture 模型支持的推理档位并发送 | Provider request 使用该配置，不能只验证按钮文字 |
| CU3.1 | 原生选择有效 PNG | 附件预览、移除、重新添加正常 |
| CU3.2 | 带正文/PNG 发送 | 消息和模型图片输入正确，草稿按成功语义清空 |
| CU3.3 | 原生选择超出应用当前大小限制的 PNG | 明确拒绝，原正文/已有效附件仍保留 |
| CU3.4 | 回复批注加正文，在上传失败或离线拒绝场景提交 | 不丢批注与正文，恢复后只提交一次；畸形批注 ID 另走 API 自动化，不伪造 UI |
| CU3.5 | UI 选择测试 Skill 后发送 | 模型请求/工具读取实际使用唯一 Skill 标记，取消选择后的新请求不误用 |
| CU4.1 | hold 时连续入队两条并调整顺序 | release 后按 UI 顺序各消费一次 |
| CU4.2 | 队列内容插入当前 Run，再撤回指定 | 同一 Task 身份，下一步消费或回队列，无第二队列复制 |
| CU4.3 | 队列编辑回填 Composer、修改再发送 | 正文/附件/批注保留，原条目按既有编辑语义撤回，不重复执行 |
| CU4.4 | 删除 pending 条目 | 从队列消失且不进入模型 |
| CU4.5 | 停止活动任务，观察暂停，再手动继续 | pending 不自动消费，继续后唯一消费 |
| CU4.6 | running+pending 时 Reload | 活动状态和队列恢复，无重复提交 |
| CU5.1 | 短历史 `/compact` | skipped 提示，不当作普通用户文本发送 |
| CU5.2 | 足够历史 compact，hold→release | 进度、发送限制、完成块正确 |
| CU5.3 | summary-error 后切 summary-ok，点击重试 | 错误可见，直接恢复压缩，不要求另点继续 |
| CU5.4 | busy 时排 compact→取消→重新排队→release | 原操作不执行，新操作最终执行，队列未永久暂停 |
| CU6.1 | title-hold，UI 手动改名后 title-release | 自动标题晚到不覆盖手动标题 |
| CU6.2 | 流式过程中 Reload 再终态 | 用户消息、轮次导航和回复各唯一；用请求计数辅助核验 |
| CU7.1 | WSS 配对、新建远端 Session | 归属与路径明确，本地/远端列表统一展示 |
| CU7.2 | 远端任务触发审批，批准后完成 | 审批中间状态与结果正确 |
| CU7.3 | 新任务待审批时取消 | 请求失效，无已拒绝操作执行 |
| CU7.4 | 远端 hold 任务期间关闭 Desktop，重开并 release | Host 仍拥有任务，重连显示既有运行，不重新提交 |
| CU7.5 | 远端离线时编辑草稿并查看发送/停止/审批 | 草稿可编辑，操作禁用；离线草稿不自动发送 |
| CU7.6 | 恢复连接并一次发送草稿 | 历史/状态恢复，唯一接纳与回复 |
| CU7.7 | 远端附件上传注入失败，再恢复重试 | 全部附件成功前不接纳 Task，正文/附件保留，无重复任务 |
| CU7.8 | 远端完成文件结果，预览并主动保存 | 认证访问正确，未主动保存时不覆盖本机文件 |
| CU7.9 | SSH 配置入口建立本机 fixture 连接、关闭连接 | 连接成功；关闭隧道不停止 Host；未知/变化指纹由真实 sshd 自动化补负例 |
| CU8.1 | 浅色重走 Composer/队列/审批/设置代表状态 | 布局、按钮/禁用、焦点和浮层正确 |
| CU8.2 | 深色复用相同状态 | 无颜色/可读性/浮层回归；注明代表位置，不宣称逐页遍历 |

操作分组：本地启动/设置/输入覆盖 CU1–CU3；繁忙队列/压缩/Reload/标题覆盖 CU4–CU6；远端连接/任务/附件/退出重连覆盖 CU7；在已建立状态切主题覆盖 CU8。每组保留关键中间状态和终态，不盲目连续操作。

自动化补足 UI 不可达的非法附件路径/畸形批注 ID、Host revision 冲突、多设备审批 first-valid-wins、取消审批、审批预算与截止时间、未知 SSH 指纹；结果明确标为自动化，不冒充 CU。上述目标已有用例可复用，发现缺失补断言。

## 最终判定

目标内用例未覆盖、旧 tar 被误测、无法重建 fixture、清单未结算、保护区新增断链、失败被 skip 掩盖，均不得宣布完成。环境阻塞记录在本计划，继续完成独立工作，不通过另立下一轮清理计划转移。真实线上 Provider、云部署和发行签名不在本目标，不把本机 fixture 结果扩写为它们通过。
