# 数据可靠性与凭据边界补测

主仓库 HEAD 00d6b763 加当前未提交实现；测试只操作独立生成的数据与副本。原始证据位于 tmp/codex-acceptance/20261021-actspace-full-acceptance/，不随仓库分发。

## Journal 副本故障

实际运行当前 JSONL adapter/codec，来源为本轮生成的100轮/1000工具关联完整 Journal，共2901条事件；不使用用户历史，不等同 UI 或迁移验收。

| 场景 | 结果 | 事实与边界 |
| --- | --- | --- |
| 完整副本 | 通过 | read-write，2901条事件，无 torn tail |
| 末尾追加不完整 JSON | 通过 | 识别 corrupt/tornTail，仍保留2901条完整事件；显式调用现有修复入口后 read-write，无事件丢失 |
| 修复前取证 | 通过 | recovery 中保存损坏原字节，与修前散列逐字节一致 |
| 中间行非法 JSON | 通过（保护行为） | 标为corrupt，仅暴露1450条前缀；torn-tail修复入口拒绝该场景，损坏原文件散列不变，没有擅自截去后半段 |
| 原始夹具保护 | 通过 | 来源 SHA-256 95e89101befeeec2af0d653ab1ff2504a41acfe41f6d9bf8ff5e1c743d717f26，运行前后相同 |

证据：journal-faults-20261022.mjs、journal-faults-20261022.log、journal-faults-20261022/results.json。附件恢复、用户旧版迁移、UI降级文案仍未由本脚本验证，P2-R01保持部分未覆盖。

## 凭据错误回显

两次独立真实 CLI/Runtime + 回环 HTTP400，随机无害测试凭据被 Provider 故意回显。2/2 出现在 stdout、stderr、Journal、result、trace；记录 [BUG-008](bugs/BUG-008.md) 和[建议方案](fix-plans/BUG-008.md)，P2-R02记失败。没有使用或打印真实 Key，不将 CLI 证据外推 Desktop 已复现。

## 设置迁移与幂等

直接执行当前构建的SettingsStore及真实文件写入；v1/v2/v3/v4均使用仓库测试fixture副本，不用用户原文件或真实秘密。四例均升级layersVersion=2，lastLoadError为空，第二次load的revision与settings.json字节不变；v1/v2/v3备份与迁移前原字节一致，v4生成pre-model-layers备份。另从隔离settings副本构造layersVersion=1的禁用自定义模型，真实load后installed/definition/override移除、utility用途跟随null、pre-model-list备份与旧文件完全一致，第二次load不再变化。

证据settings-migration-20261022.cjs/.log及settings-migration-20261022/results.json。SecretCrypto是测试端口，这不验证macOS safeStorage迁移，也不代签真实Electron配置界面、用途路由或所有旧附加Key退役分支。F1-01仍有这些明确缺口。

## 工作区外文件边界（真实 CLI/Runtime）

仅在本次tmp创建workspace和同级outside目录，内容为无害公开canary；受控HTTP Provider请求当前真实工具，共两种模式各5工具/6次请求。

- default：工作区内读取成功；绝对路径外读、symlink指向外部读取、外部新建、外部编辑四项均返回broker-unavailable，最终approval_required/exit4；外部文件保持原字节，新文件不存在。没有交互审批器，不以错误码冒称用户实际拒绝。
- full-access：同样非敏感路径的绝对读取、symlink force读取、新建、编辑成功，最终completed/exit0，磁盘与工具结果一致。该模式按当前设计扩大非敏感文件范围，不将允许外读错误报告为越界Bug；不外推敏感路径、Grant或TOCTOU防护。
- 初轮验收断言误期待工具正文含APPROVAL_REQUIRED（实际正文为broker-unavailable，run状态为approval_required），且symlink普通读命中canonical路径缓存。保留初轮失败脚本/日志；第二轮新独立目录核对实际协议并force读取，5项检查均通过。未修改产品或降低权限条件。

原始证据：file-boundaries-20261022-r2.mjs/.log及同名目录results.json；初轮file-boundaries-20261022仍保留。P2-D08/P2-R02新增文件边界子证据，不代签Desktop授权复用/撤销和用户操作。

## 凭据文件权限元数据

只读stat本次证据目录6份secrets.json（不读取内容），全部0600；证据secret-copy-modes-20261022.json。仅证明当前这些副本权限，不代签所有原子替换/失败保护分支，也不消除BUG-008上游回显泄露。

## 历史统计旧派生库恢复（10:07）

从正在隔离验收的linked profile只读复制各Journal至独立目录，按已完成换行截取固定快照；真实长历史含合成100轮与后续真实Provider任务。当前built JsonlQueryReader和UsageReadModelService首次构建得到1132条活动（117请求/1015工具）、212918Token、100条未知费用、已知$0.05375822399999999，与同份Journal的独立projectSessionUsageActivities投影行数一致。

关闭服务后只改该验收副本的派生库：删除usage_activity、user_version降至9，保留已有游标；设置旧global-usage-reset.json为当前时间，模拟过去历史被过滤的状态。当前服务真实重启查询后91批重读，恢复全部1132条及相同的计数/Token汇总，schema=10；日/周/全部切换不再重读。再次关闭/重启后0批重读，行数和汇总保持。重复运行发现费用浮点累加顺序产生约2e-17美元末位差异，金额核对容差1e-12，其余字段精确相等；原严格断言日志保留，不报告为可见计费Bug。各Journal副本哈希前后相同。未改用户数据、产品代码或当前UI profile。

同一固定副本另构造version1、revision已最新但rows为空的global-usage-index及旧reset文件；当前built UsageSourceCache读取7个Journal，升级version2并补回1132行。新实例从持久缓存读取相同JSON记录，不再次读Journal。JSON会省略undefined属性，核对采用持久化JSON语义；保留初轮严格对象断言日志，不把缺失undefined键当数据丢失。

证据：usage-upgrade-copy-20261022.mjs/.log与同名目录results.json、before-upgrade.sqlite。该方法证明真实文件/服务/SQLite及缓存恢复与幂等；旧状态是受控构造，不冒充用户遗留库原件，完整应用装配及构建期UI反馈仍未覆盖。

Host上传ENOSPC专项已在独立16MiB HFS+映像补跑1/1通过，测试后卸载；方法及证据见[Host报告](host-20261022.md)。Docker daemon当前不可连接，未启动Docker或在正常磁盘填满文件；不把HFS+结果表述为Linux tmpfs通过。

## Explore 子请求用量归集补核

取独立模型设置补验的两个实际父/子 Journal，复制到新目录，用当前已构建 `UsageReadModelService` 在独立派生状态查询 `getActivity(range=total)`，再按 requestId 逐行与 Journal 对账。7个请求均各有一条统计记录，input=700/output=140/total=840，费用合计$0.0007886；两个工具活动使总活动数为9。Explore 子请求 `a8b726be…` 独立计入100 input+20 output、$0.0001146，父轮的240 Token无需强行包含子轮。7/7请求Token及cost在1e-12容差内一致，复制前后原Journal SHA256不变。

方法是当前统计服务+真实Journal副本，不是原profile UI全局统计签收。原profile现有SQLite usage_activity为0行，尚未用统计查询构建；不能据此直接报用量丢失。副本服务查询后可正确重建并归集子请求。证据 `tmp/codex-acceptance/20261021-actspace-full-acceptance/explore-usage-copy-20261022/results.json` 及同名 `.mjs` 脚本（本地过程产物）。

## Context 大数据服务边界

直接运行当前固定构建的 `ContextPanelService`，读端口返回独立合成的12000条明细、12000条路径及1380000字节中文/emoji原文。明细48页、12000唯一ID齐全，最大页128005字节；11900条sleeping路径119页、每页≤100、无丢重。长原文22页、每页≤64KiB且UTF-8边界有效，逐页拼回与原文精确相等；只读明细/路径时没有调用原文读端口。

非法游标、负limit、UTF-8字节中间offset、过期明细/路径版本五类均拒绝；更新后describe提供新revision。该检查为当前服务+合成读端口的压力/边界证据，不是实际Runtime生成12000条的证据，不代签界面加载、压缩、重试或性能SLA。运行约286ms仅说明本次本机服务采样。证据 `tmp/codex-acceptance/20261021-actspace-full-acceptance/context-large-service-20261022/results.json`。


## P2-R01 异常配置真实启动链有限补验（2026-10-22 14:04–14:06）

先列验收点：当前 SettingsStore 明确拒绝的异常输入；真实应用启动的 load error/降级；源文件字节保护；正常退出清理。路线为只读确认契约→全新可丢弃无凭据 profile 写入非法 JSON→固定 dist 真实 Electron/CDP 启动并观察→正常退出→逐 PID/源哈希核对。非 native AX，没有商业模型、Provider、PTY 或用户 profile。

选定异常是 settings.json 的15字节 { invalid-json\n（精确原文与SHA在input-proof.json，不以转义展示作字节依据）。apps/desktop/src/main/settings/store.ts:183–186/99–100、defaults.ts:143–151 明确 blockingError；runtime-v2-settings-migration.test.ts:91–100 已定义不得替换源文件。index.ts:288–296 捕获 bootRuntime 错误并继续创建窗口，故本次预期是阻止 Runtime 装配并保留源事实，不是“默认设置的Runtime成功启动”。

真实结果：06:04:11.930Z主日志 v2 boot failed，error=Settings file contains invalid JSON.；自身前一条dataRoot记录精确指向 final-three/invalid-settings/profile。窗口真实显示“会话列表加载失败，请稍后重试。 重试”，仍有新建/设置外壳，pageerror=0。未在已失败的Runtime上继续点击写设置或发送；没有伪造IPC/恢复。UI没有展示具体JSON错误，本次仅记录事实，不另行编号为Bug。

源文件启动前、窗口出现后及正常退出后均相同15字节，SHA256=4cdedddccf26674e5cc2e66f24cca389d502f3534bbad817284eb98e21f0d4b9；没有备份、没有secrets.json，没有覆盖为默认设置。**通过此单一异常启动的拒绝/原文件保护/可见降级子点**；不代签真正迁移写入失败、其它异常、真实旧版历史兼容或OS加密凭据迁移。旧历史仍缺对应来源版本的冻结样本与期望映射，不能用本次新空数据替代。

证据目录 tmp/codex-acceptance/20261021-actspace-full-acceptance/host-git-followup-20261022/final-three/invalid-settings/：input-proof.json、boot-proof.json、boot-degraded.png、startup-log-own-lines.jsonl、after-quit-proof.json、cleanup.json。源码默认把app日志附加到repo/logs/desktop-v2.log，此次仅抽取自身dataRoot/错误两行，未修改或截断共享日志，也未将相邻其它实例runtime ready误归本实例。

清理：正常app.quit并等close，main16830/GPU16858/Utility16859/renderer16871逐PID ps均exit1且空输出；无新监听端口、Provider或PTY需停。产品/dist/coverage/主摘要未改，无商业请求、提交、推送。保留可丢弃profile作为证据。


## P2-R01 迁移原子写失败与恢复定向补验（2026-10-22，终态）

验收点：v2无凭据副本写tmp失败时原文/备份、Runtime阻断/可见状态；移除冲突后迁移成功及二次幂等。先失败启动，后修复仅fixture障碍正常启动两次。源码settings/store.ts:124–139对v2失败throw；atomic-io.ts写settings.json.tmp后rename。自有desktop-models-settings-20261022/migration-write-failure内仅创建空settings.json.tmp目录，不改产品/权限/磁盘容量。

实际完整Electron main48563启动，Runtime IPC bootstrap/get-settings/list等未注册，窗口可见“会话列表加载失败，请稍后重试。重试”；这是通用加载失败文案，不是明确迁移错误提示。正常app.close。原settings逐字节未变，v2备份精确且digest有效；证据desktop-models-settings-20261022/evidence/migration-write-failure-original.json、migration-write-failure-ui-observation.json（失败界面取真实body，未留截图，未声称有迁移专用弹窗）。

删除仅自有空tmp目录，同副本完整Electron main49311正常迁移，模型设置页可读；正常退出后main49501二次启动，settings hash完全相同，备份仍精确。migration-write-recovery.json及migration-write-recovery-v2-0/1.png。源repo v2 fixture只读未变，无Key/模型请求。写失败保护/恢复/幂等子点通过；失败可见性只签通用列表失败，迁移专用说明未覆盖/不符合明确错误提示预期由主审判断，不强报根因Bug。全部main正常关闭，无Provider，last-worktree-cleanup.json ps为空。


### 2026-10-22 打包启动直接原因补证

同一未签名制品仅再直启一次，使用新的自有data/workspace。PID84746自行退出-9，stdout/stderr均0字节，未创建profile，非harness终止。内核AMFI同PID明确记录“Attempt to execute completely unsigned code (must be at least ad-hoc signed)”，并伴随同路径系统策略拒绝；这补足先前只凭spctl无法确定的启动原因。没有签名、移除属性、安装或修改制品。P2-R03仍未覆盖：启动后的资源、正常关闭及升级恢复尚无证据，不能用资源清单代签。证据`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-package-startup-diagnostic-20261022/`含结果与仅本PID系统日志。进程已退出，无残留监听。建议先提供满足系统执行要求的验收制品，再走原范围；仅记录，不讨论或实施。


## 2026-10-24 原范围闭环校正

本页保留10/22各阶段实际方法/未覆盖快照；P2-R01当前已由[完整原范围复核](reliability-closure-20261024.md)签收。旧版历史的指定发布来源是后加解释，原P2-R01要求历史恢复而未指定旧发布版；已有跨运行/构建历史与新会话恢复证据。未知发布版安装升级仍归P2-R03，构建期间提示/最终F9归F6，14-A3本机unknown回执亦独立，均未由本项代签。迁移失败专属文案未证、通用可见降级已证，保护原事实/备份/恢复证据保留。
