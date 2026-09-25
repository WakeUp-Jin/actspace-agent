# 执行摘要

状态：2026-09-26 续修完成。审批恢复、纯文本 fork 已通过上一轮实机验证；本轮带附件 fork、重载后预览、再次 fork 首次发送通过。以下保留 9 月 25 日失败记录，最新结果见末节。

验收范围：审批重载后的卡片、停止与收尾；Chat fork 的首次发送及单 writer 生命周期。其他权限/Chat 未验项目继续以原批次验收摘要为准。

## 本轮 Computer Use 结果

复用用户已启动的 Electron，在同一窗口连续操作，没有为各检查点反复启动应用。本轮未修改产品代码。

| 场景 | 结果 | 实机证据 |
| --- | --- | --- |
| 待审批时重载，再拒绝 | 通过 | 审批卡、目标路径、停止按钮均恢复；拒绝后卡片消失，任务回到空闲，输入框可用 |
| 待审批时重载，再停止 | 通过 | 重载后可点击停止 Agent；卡片消失，任务与输入框恢复空闲 |
| 纯文本 Chat fork 首次发送 | 通过 | 子会话回复 `PARENT_OK_17` 和 `CHILD_OK_42`，未出现 `SESSION_WRITER_LOCKED` |
| 子会话重载与父子隔离 | 通过 | 重载后保留 Chat 身份及子会话消息；切回父会话只有原始对话 |
| 带附件历史的 Chat fork 首次发送 | 失败 | 首条消息进入运行后以 `Artifact does not belong to this Session.` 失败 |

## Journal 证据

- 审批场景会话：`5162a604-18f0-47b2-908a-de0f937336a2`；合成请求标记 `QA-VERIFY-0925-RELOAD-1`、`QA-VERIFY-0925-STOP-2`。
- 纯文本父会话：`9857e603-4bee-4275-af8c-2c39b2abc611`；子会话：`ccf30002-bf45-49f6-9b41-6a1e819e5f84`。子会话 Journal 第 98 行、seq 96 为成功 assistant/message，文本包含两个验收标记。
- 带附件历史的子会话：`b8797a4f-7419-4994-8d8a-e102216d5551`。Journal 第 907 行、seq 905 的 turn/end 记录上述归属错误，时间 `2026-09-25T15:44:22.561Z`。
- Journal 位于本机应用数据目录；本记录仅摘录合成测试标记与失败原因，不复制完整历史。

## 自动化证据与边界

前一修复轮留下的 `/tmp/actspace-recovery-regressions.log` 已核对：4 个测试文件、46 项测试通过（22:16 开始的运行）。这是此前定向回归结果，本轮没有重新运行整个测试套件。

剩余缺陷是带附件/制品历史的 fork 在继续对话时发生归属错误；需要继续定位 fork 历史引用与子会话制品读取的关系，不能据此直接移除 Session 所有权校验。本轮未实施该新增修复，也未复验完整权限矩阵、真实长上下文压缩或应用进程重启。

收尾：应用处于纯文本 fork 子会话，任务空闲，没有本轮遗留的挂起审批；本轮没有新增路径授权。


## 2026-09-26 附件独立副本修复与复验

用户确认采用复制方案：仅复制分叉前缀引用的制品，生成子会话独立 ID 和 owner，同步替换结构化历史引用。父会话文件与历史不变，读取仍执行原来的归属和完整性校验。

实现范围为 Session persistence 的 fork 协调和 DesktopArtifactStore。新目录独占创建，重复引用只复制一次；文件复制或 Journal 写入报错时清理本次副本与目录。普通文本中的 ID 不替换，不自动迁移旧版失败子会话。CLI 未提供复制端口时，带制品 fork 明确拒绝；纯文本行为不变。

### 工程验证

- 新增回归先在原实现上观察到不复制、失败未清理的红测，再实现并转绿。
- `pnpm --filter @actspace/session-persistence test`：7 个文件、45 项通过。
- `pnpm --filter @actspace/session-persistence build`：通过。
- `pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-artifact-store.test.ts`：3 项通过。
- `pnpm --filter @actspace/runtime exec vitest run src/test/desktop-fork.test.ts`：1 项通过，既有 writer 生命周期未回归。
- Desktop typecheck、build:electron：通过。`pnpm dev:log` 依赖构建和 Electron main/preload watch 编译通过。未重复跑全仓测试、打包或 renderer production build。

### Computer Use 连续批次

加载新后端需退出并启动一次 Electron，随后在同一应用连续操作：

| 操作 | 结果 |
| --- | --- |
| 从原始带 PNG、五种文本附件和生成图片的 Chat 新建 fork | 通过，新子会话建立 |
| 首次发送，要求回复 TXT_CODE、CSV_CODE | 通过，返回 QA-TXT-17、QA-CSV-81 和 FORK_COPY_OK |
| 点击继承的生成图片 | 通过，右侧实际显示白底蓝圆 |
| Cmd+R 后重新打开图片 | 通过，消息与图片仍可用 |
| 从子会话再次 fork 并首次发送 | 通过，返回 GRANDCHILD_COPY_OK 和 QA-TXT-17 |

两次初始点击被其他工作文件引发的 Vite reload 打断；已核对日志并复用同一个已创建子会话，没有重复创建第一代 fork。截图已在本轮对话中显示，未保存为仓库文件。

- 第一代子会话 `ab6d2e9a-1f21-4fc0-bc2b-e50799a68664`：Journal 第 964 行 / seq 962 成功回复，第 966 行 / seq 964 为 completed。
- 第二代子会话 `50d663d9-4176-4153-b13f-ca421fb53032`：第 990 行 / seq 988 成功回复，第 992 行 / seq 990 为 completed。
- 原父会话和两代子会话各 7 个唯一制品；三组 ID 两两不重叠，owner 全部属于对应会话，字节大小和 SHA-256 完整性全部通过，三组内容摘要一致。
- 旧失败子会话保留为历史证据。测试结束时新子会话空闲，无挂起审批。

本次关闭的是审批恢复与 fork 缺陷，不表示完整权限矩阵、真实长上下文压缩、所有 Provider 或发布打包验收完成。进程强制崩溃期间的磁盘事务恢复没有新增保证；本轮清理覆盖可捕获的复制和写入错误。
