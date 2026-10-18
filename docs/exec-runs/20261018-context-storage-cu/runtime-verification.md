# 联合验收运行时证据

## 修复后定向验证

- CU-01：真实 UI 在摘要保持期间点击停止后，同一隔离会话 seq868 保存 queue pause、seq869 保存 `turn/end.reason=aborted`、seq870 保存 `run.finish.outcome=cancelled`。本次取消没有提交新的压缩摘要事务。界面关键截图与 CU-02 复验另见 [修复复验](bugfix-computer-use.md)。
- CU-02：请求31为受控摘要失败；继续执行时累计内容达到估算39176、超过32768容量，seq889/890记录主运行失败结束。此后真实界面仍显示压缩失败及重试入口；此次 UI 终态是失败结束，不能声称覆盖正常 completed 终态（后者由前端回归测试覆盖）。
- 自动化：193 项前端测试（输入框、流事件、队列、live store、压缩块）与 8 项后端自动压缩测试通过，Desktop 类型检查通过。新回归在修复前实际出现 4 项预期失败。
- 20:29:40、20:30:13、20:31:11 之后，开发日志记录其他测试文件（`zz-probe-fields.test.ts`、`zz-probe-dump.test.ts`、`trajectory-real-journal.test.ts`）触发 Vite `page reload`。此时自动失败提示所在 localStore 被重建，后续旧 AX 与当前截图不一致，无法将完整按钮重试链或切回后的保留判为通过。不能据此推断“切换会话清理失败状态”；需要无重载环境定向复验。

本页记录本轮实际执行的文件/日志核对，不等同于 Computer Use 通过项。界面结果另见 [验收清单](acceptance.md)。全部数据为隔离 synthetic fixture，根目录 `/tmp/actspace-context-storage-cu-20261018`。

## 已完成

- UI 创建的真实会话 `ea90d32d-2815-4576-bce9-bdd42f30c987` 首轮包含6个Step、5次read_file；请求容量32768，自动压缩阈值16768。Provider用量20000为受控输入，不能当作真实Token计量。
- UI 长回复产生620个流式chunk；早期 `CU-EARLY-000` 正文、后续 Todo `CU-TODO-RECOVERY verify storage` 均在 JSONL。正常退出后共743事件，含 session/end-seed。
- 通过生产 JSONL/SessionStore 接口构造180轮、1441事件长历史种子 `cu-long-history-180`。打开后近期正文保留512事件/194281字节；显式读取范围成功取回首条用户消息。该种子用于分页测试，不是用户真实对话。
- UI 图片发送首次未进入事实，因此另通过生产 ArtifactStore/SessionStore 在长历史种子追加图片读取样本：PNG 123字节，SHA-256 `ea5f5a34687ba55146c8887bbccd043de7e3e10c6a7d8a6cbf802b6f5ff70524`。这是生产存储接口样本，不能用来判定 UI 上传成功。
- 正常退出后，将隔离 usage-read-model.sqlite（1028096字节）与 owner 文件移至 `index-backup/`，不修改 Session/附件。移除前后4份事实文件 SHA-256 一致。应用重启后 SQLite 重新创建，session_catalog=2；继续执行前再次验证全部4份事实哈希一致。
- 第二次启动通过 pnpm dev:log 依赖/主进程构建屏障，编译观察0错误。未重跑此前实施摘要中353项后端测试、3项附件测试或10万事件测试，不能将其计作本轮结果。

## 环境修正与限制

首轮 `/compact` 的 provider_disconnected 来自测试种子使用旧 SettingsService.update，未保存 taskModels。退出后仅修改隔离配置，改用 updateV2 绑定 fixture-main；不是产品压缩缺陷证据。

长历史种子的 request/context 是受限测试形状，不用于判定该种子的现代 Context 快照恢复。当前状态恢复以 UI 真正执行产生的会话为准。

原生 Computer Use 观察约60秒/次。跨调用使用瞬态弹层 AX 元素会失效，改为同次读取与操作；该工具焦点限制不登记为产品Bug。

验收期间其他开发者更新 ContextPaths.tsx 并触发 HMR；后半段路径界面结果仅覆盖现场版本，不代表冻结提交上的完整回归。

## UI 附件提交复验

第二次原生选择图片并直接点击发送后，真实会话 seq743 task.original.attachments=1、seq746 user/message 保存图片 artifact 引用，Provider请求12 hasImage=true，正式附件已落盘。这个结果覆盖 UI 选择→提交→模型收到→事实保存；成功提交的这张图尚未做第二次退出重启。首次先附加再输入的路径未形成附件事实，尚不能稳定复现，不列为已确认产品Bug。

## Step 与自动压缩顺序

UI第二轮请求13受控保持工具响应。释放后 seq769 tool/result、770 Context state、771 step/end，随后Provider请求14摘要。摘要保持时未发送下一步。释放摘要后 seq774 compaction/start、775 summary、776 surface/replaced、777 end、782下一请求；Provider请求15 hasSummary=true。界面单独确认工具完成后的增长、压缩后的下降和第6轮步2。此场景只有单工具批次，未声称覆盖并行多工具全部完成的情形。

SQLite按需查询后 context_request从0追赶到12、context_event=3，证明重建空表会按请求继续追赶，不将启动时0条当成事实缺失。

## 自动失败与结算

请求16–27交替为主请求和摘要请求，共6次摘要；测试服务summary-error使其全部返回HTTP400。JSONL这轮有6个step/end，turn/end与run.finish均completed，没有成功compaction事实。界面终态无持续失败/重试提示，见CU-02。此场景证明未死锁及失败可见性问题，不代表任何真实外部服务的错误兼容性已通过。
