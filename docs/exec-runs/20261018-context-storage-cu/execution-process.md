# 联合验收过程

2026-10-18；只验收和报告，不修复业务代码。验收范围与分组见 [acceptance.md](acceptance.md)。

- 核对两个 completed 计划、执行摘要、前端交接与当前 dirty 分支。保留已有修改；用 `pnpm dev:log` 完成依赖/主进程构建屏障，启动隔离 Electron。
- 原生界面由 gpt-6.1-sol Computer Use 操作。回环 HTTP Provider、独立配置/Session/附件目录，不复制真实用户设置或凭据；不是浏览器 mock。
- UI 首轮执行 `FIXTURE_LONG`，Journal 确认 6 Step、5 次 read_file。重复读取被文件未变机制缩短；Context 完成态显示最近请求第1轮步6、约13.9K估算和20K受控报告用量。
- 首轮无摘要请求。UI `/compact` 返回 `模型当前不可用：provider_disconnected`。核对隔离 settings 发现既有 seed 脚本调用旧 `settings.update({taskModels})`，任务模型绑定没有写入；主模型靠 Composer 选择执行。这是测试种子问题，不能据此认定产品压缩不可用。待正常退出后通过正确 `updateV2` 修正隔离配置，再重新验收。
- 通过生产 JSONL/SessionStore 接口生成独立长历史种子：180轮、1441事件，近期缓存512条/194281字节，显式回读成功取回首条 `CU-HISTORY-000 FIRST-FACT-RECOVERABLE`。此项是运行时证据，后续必须另验界面分页。
- 原生 AX 观察每次约60秒，按已确认路线合并操作；关键中间态使用受控 Provider 等待，不以静态源码代替真实界面覆盖。
- UI 完成 620 chunk 长回复及 Todo 写入后，真实会话达到729事件。随后原生文件选择器成功选中 valid.png，Composer 显示已附加，但此次发送记录 original.attachments=[]、Provider hasImage=false、artifacts-v2 无文件；保留现场，待重启后定向复现，不提前归因存储层。
- 恢复分组合并为一次正常退出：保留 JSONL/附件，备份并移走隔离 SQLite，同时修正隔离任务模型绑定，再启动验证历史恢复与索引重建。只操作 /tmp 隔离目录。
- 11:11 UTC 正常退出完成。仅隔离 settings 通过 updateV2 绑定 fixture-main；生产 ArtifactStore/SessionStore 向长历史种子追加一张图片（非 UI 上传证据）。备份移走 usage-read-model.sqlite 与 owner 文件，4份 Session/附件事实文件 SHA-256 保持一致。
- 第二次 pnpm dev:log 构建屏障通过，Electron PID54990。重建 SQLite session_catalog=2；尚未打开 Context 查询时 context_request=0，不视为缺失，因为索引按需追赶。重启后、继续执行前再次校验4份事实哈希不变。
- 11:11:47 UTC 检测到其他开发者对 ContextPaths.tsx 的 HMR 更新。后半程运行的是包含这部分变更的现场版本，C5 改为检查可见路径卡片；不能将本轮初始“路径 UI 尚未实施”的交付边界当成当前界面事实。
- 重启后的原生界面已显示生产接口图片并可打开预览；这是 S3 读取子项。长历史实际分页至第120轮，尚未跨越约116轮的近期正文界限，S1 界面部分覆盖，不据此宣布512条淘汰后UI回读通过。
- 切回真实UI会话后，标题、Todo、4轮10步恢复可见；首次上传消息无附件。进行第二次定向复现，区分先输入文字再附加与先附加再输入两种顺序。
- 第二次原生选择图片后直接发送图片-only成功：seq743 task.original.attachments=1，seq746 user/message 含正式artifact引用，Provider请求12 hasImage=true，正式附件文件落盘。首次附加后输入的异常保留为待复现，不判定产品Bug。
- 受控第二轮 FIXTURE_LONG：请求13先保持；面板显示第6轮步1、约15.8K/48%、路径周期0活跃1睡眠0。释放工具1后，seq769 tool/result → seq770 Context state → seq771 step/end → Provider请求14摘要；未先发下一步请求。
- 真实压缩等待态：面板变为23.9K/73%，会话内容25项，增加2项/约8.1K；停止按钮AX明确disabled，文案“正在压缩上下文，压缩完成后可继续”，Escape无取消效果。确认为前端取消入口缺口，证据 c2-compaction-hold.png 与AX。
- 主机释放摘要后：seq774 compaction/start → 775summary → 776surface/replaced → 777end → 782下一请求。Provider请求15 hasSummary=true。fixture摘要未保留FIXTURE_LONG触发词，故第2步直接结束；不是产品执行异常。
- 自动失败场景运行6步，6次摘要HTTP400；主运行正常completed。真实界面终态第7轮19步、Context约23K/70%，无持续失败/重试提示。记录CU-02，不声称亲眼观察了失败提示消失的过程。完成后恢复fixture summary-ok。
- C4完成真实切换：长历史无当前Context，切回真实会话后关闭/重开面板，恢复约23K/70%、7轮19步及路径3/0；未见串会话。搜索仅打开输入，查询未执行；浅色多状态有证据，深色未覆盖。停止扩展并整理报告，正常退出隔离应用。
- 最终Computer Use报告已落盘。隔离Electron正常退出（dev:electron:run code 0），其watcher随开发编排终止；本轮Provider停止，测试端口无监听。保留隔离事实、SQLite备份和本地证据用于复现。业务代码未修复、未提交/推送。
