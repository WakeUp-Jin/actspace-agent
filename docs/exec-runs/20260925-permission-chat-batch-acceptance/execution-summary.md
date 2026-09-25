# 权限与 Chat 分组验收 — 执行摘要

## 执行状态

- 日期：2026-09-25；模式：交互式 Computer Use，配合只读 Journal / artifact 核验和定向测试。
- 结果：**部分完成，不能签署两模块全量通过**。用户要求低成本分组验收；本轮集中覆盖权限复用/隔离和 Chat 附件链路，复用已有证据，不重复生成付费图片或构造超长上下文。
- 起始 HEAD：`9bebd124950f3f139d7e120c8d2c0bb5991a813b`；收尾 HEAD：`0d4bca17bd7eebacf33b5b1a311131ffe67a0ad4`。工作区始终有其他任务的未提交变更，结果不能归属一个干净提交。
- 19:13 起其他任务持续修改审批组件并触发 HMR / 页面重载；剩余审批与生命周期验收需在稳定快照上继续。
- 本轮未改产品代码、未提交或推送；只新增验收记录，使用临时合成文件与测试会话。
- 过程：[execution-process.md](execution-process.md)。范围来自用户在会话中批准的分组验收，不另设代码实施计划。

## 分组结果

| 分组 | 本轮实际完成 | 结论与边界 |
| --- | --- | --- |
| 权限主链路 | 现有只读授权不允许写；写入选择“本会话”后，同文件 edit 无须重复审批；受保护合成 `.ssh` 文件拒绝；新会话读取同文件重新请求审批 | 上述路径通过。新会话请求随后超时拒绝，未读取文件；不能替代用户主动拒绝和取消验收 |
| Chat 附件及能力边界 | 真 PNG 识图；TXT / MD / MARKDOWN / JSON / CSV 五件一次发送；非法 UTF-8、NUL、超 1 MiB 拒绝；失败后移除附件可继续对话；PDF 在选择器被过滤 | 上述路径通过。五份文本持久化及下一轮重放一致；六份原始制品校验一致；真实 JPG / WEBP / GIF、DOC/DOCX/目录、总文本限制的桌面交互未全覆盖 |
| Chat 展示与恢复 | 深色、浅色、系统主题宽窗口观察；失败附件草稿保留；清理失败附件后恢复对话 | 局部通过。窄窗口、完整键盘路径、重启后附件重放、fork 子会话发送未在本轮复验 |
| 审批生命周期与交叉核验 | 新会话授权隔离；等待审批跨页面重载的观察；超时保护；52 项定向测试 | 后端超时拒绝通过；观察到重载期间审批卡和停止按钮消失，需要稳定版本复现。授权撤销/降级和新版各审批卡尚未闭环 |

## 可追溯证据

本节只保留合成验收标记和事件序号，不复制原始日志。Journal 位于 `<userData>/sessions-v2/<sessionId>/journal.jsonl`。

### 权限

- 会话 `77e9e08a-5e47-4f81-8779-e5a652237329`，标记 `QA-0925-A`：3439 `permission/asked`；3440 session 决策；3441 添加精确文件 `file.write` grant；3443 write 完成；3549 edit 完成，期间无第二次审批；3592 scope-denied / 3593 result 为 `CREDENTIAL_FILE_DENIED`、不可重试；3765 turn 完成。
- 会话 `5162a604-18f0-47b2-908a-de0f937336a2`，标记 `QA-0925-ISOLATION`：76 重新请求同一合成文件的读取审批，证明原会话 grant 未泄漏。
- 该请求北京时间 19:20:18 发出、19:30:18 超时：78 `permission/decided` 为 deny / timeout；79 result 为 denied / `APPROVAL_STALE` / retryable=false；291 turn 完成。未产生文件读取成功结果，也未重试。

### Chat

- 会话 `0171e3f2-d91e-43c6-80f6-fff8f5f4080f`。
- `QA-0925-B`：真实 64×64 蓝色 PNG 被正确描述，turn 139 完成。
- `QA-0925-C`：五份文本一次发送，五个合成 code 均正确，turn 258 完成。
- `QA-0925-E`：移除负向附件后继续对话成功，turn 273 完成。
- `QA-0925-NUL`：独立验证 NUL 拒绝；第一次混合负向测试受残留 invalid.txt 遮挡，不将它计作 NUL 的独立证据。
- 三次 request/context（5 / 145 / 264）工具集合严格为 `web`、`generate_image`；modelFacts 无 workspaceRoot；system prompt 一致。
- 五份文本在 `agent/inbox/spliced` 入队内容中与样本一致，后续上下文重放一致。失败附件未入队。
- `<userData>/artifacts-v2` 中该会话恰有六份制品；原始字节与六个正向样本一致，size / SHA-256 均与 metadata 一致，归属该 Chat 会话。未发现失败上传留下额外制品。
- 当前请求声明 contextWindow=1,000,000。本轮不为测试自动压缩而消耗约 500K token；真实阈值触发仍未验收。

## 观察到的问题

1. **审批恢复待复现**：另一任务触发重载期间，新会话显示等待审批，但正文只有 Worked，审批卡和停止按钮不可见。展开 Worked 未恢复。最终由 10 分钟超时拒绝收束。根因尚未确认，不能断言由某一个具体修改引起，也不能以超时保护通过替代交互恢复通过。
2. **Chat 界面仍有 Agent 控件残留**：空状态工作目录/分支/运行位置控件、顶部工作目录、Review changed files 和底部 main / 本机仍可见；固定 Chat 标签、无权限切换、附件菜单仅“图片与文件”符合预期。
3. **附件报错暴露内部 IPC 信息**：UTF-8 / NUL / 大小校验可拦截，但用户看到包含 `runtime-v2:fixed-renderer:run-agent` 的英文技术错误，需改善错误呈现。
4. **当前 UI 未提供授权管理/撤销与目录范围选择**：后端仍给 exact / subtree 建议，UI 仅提供精确文件会话授权。此前目录授权证据不能证明当前入口可用；按产品目标确认是否属于有意删减后再判缺陷。

## 本轮定向测试

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @actspace/tools-runtime test` | 25 通过 |
| `pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-chat-attachments.test.ts src/main/test/composer-attachment-service.test.ts src/renderer/test/permission-mode-control.test.tsx` | 10 通过 |
| `pnpm --filter @actspace/compaction test` | 6 通过 |
| `pnpm --filter @actspace/session-projection test` | 11 通过 |

合计 52 项。前面三组在审批 UI 后续改动前执行；不代表后续改动回归通过。本轮未运行全量构建、typecheck 或完整测试集。确定性测试与真实 Electron / Provider 验收分开计数。

## 复用的历史证据与剩余两组续验

历史依据：[session-scope-grants](../session-scope-grants/execution-summary.md)、[main-chat-form](../20260924-main-chat-form/execution-summary.md)。历史已通过搜索、公开网页打开、部分重启恢复；历史图片生成记录为失败，不能算通过。2026-09-25 晚间续验的单图成功证据见下节。历史 fork 子会话发送存在 writer lease 冲突，不能标为通过。

待并行 UI 修改停止后，固定一个源码/运行版本，按以下两组继续，避免重跑附件正向与图片生成：

1. **审批连续路径**：合成文件一次授权→再次请求并主动拒绝→会话授权复用→新会话隔离→等待期间切换会话/重载→卡片恢复并取消；顺路检查新版 Read / Write / Edit / Bash / Delete 卡及浅深主题、键盘焦点。需要目录范围/撤销入口的用例按产品决策补入口或明确移出范围。完全权限扩大访问的操作应在实际操作前按要求确认，不能仅为清理 grant 而绕道切换。
2. **Chat 生命周期和布局**：复用现有六附件会话，重启后检查重放→fork→子会话发送一条短消息→窄窗口/键盘/主题检查；集中覆盖未验的图片格式与附件边界。自动压缩优先设计可控阈值集成测试，真实大上下文触发单独决定预算，不伪装为已验。

## 收尾状态

- 主题已恢复浅色；压缩阈值未改，保持 80。
- 原 Agent 保持 default 权限模式，有两个仅针对合成 beta.txt 的精确 read / write grant；由于 UI 无撤销入口，本轮未删除授权。
- 合成 beta.txt 最终内容为 `Synthetic QA beta: EDIT-25`，用于验证授权写入/编辑；未触及真实凭证。
- 新隔离会话已自动超时拒绝并正常结束，无遗留待审批任务。
- 测试会话、合成文件与 artifacts 保留用于续验。截图证据在 Computer Use 对话输出中，本轮未将截图另存为仓库文件。


## 2026-09-25 晚间两批续验（20:21–21:42）

### 结论

**续验已执行，整体仍未通过；不要把本节理解为完整矩阵已覆盖。** 本轮未修改产品或测试代码、未提交或推送。HEAD 保持 `0d4bca17bd7eebacf33b5b1a311131ffe67a0ad4`，包含前轮 Chat 修复及其他未提交修改。收尾 diff 显示其他任务继续改动 SettingsPrimitives、主题样式等；这不是冻结的干净快照，视觉结论仅针对实际观察时刻。复用同一 Electron，最后正常退出并通过 `pnpm dev:log` 重启一次；依赖构建与 main/shared watch 均报告 0 errors。

| 场景 | 本轮结果 | 证据与边界 |
| --- | --- | --- |
| 审批切换会话恢复 | 通过 | read 审批等待时切换 Chat 再返回，卡片和拒绝/本会话/允许仍可用 |
| 主动拒绝 | 通过 | 隔离会话 seq 359 deny/user-denied，360 tool/result denied，不重试 |
| 待审批页面重载 | **失败，稳定复现** | 请求 seq 574 pending 后按 Cmd+R；侧栏仍等待审批，正文仅 Worked/Thinking，审批卡与停止按钮消失。无需并行 HMR 即可复现；seq 575 timeout、576 denied/APPROVAL_STALE，688 turn/end completed，未读取文件 |
| 停止审批 | 安全取消通过；展示需跟进 | seq 731 asked；点击停止，732 deny/aborted、733 denied、735 turn/end aborted；侧栏当时显示失败，重启后为空闲 |
| Chat 控件隔离 | 通过已观察路径 | 顶栏、Composer 无工作区/分支/本机/Review；右栏菜单只有可视化与上下文；Context 工具严格为 web、generate_image |
| 附件错误与草稿 | 通过 UTF-8 用例 | 实际选择 invalid.txt，显示中文纠正指引，无 IPC 名称；正文与附件保留；Shift+Tab 聚焦移除按钮、Space 移除后提示消失；Enter 重发成功。原生 AX 点击移除按钮未成功，键盘路径有效；不据此认定鼠标路径已通过 |
| 附件入队与重放 | 通过 | invalid.txt 未见 agent/inbox/spliced；Chat seq 289 完成恢复发送；重启后 seq 694 context 包含历史测试值，742 turn/end，UI 正确回答 QA-TXT-17 / QA-CSV-81 |
| Chat fork | **失败，复现** | 会话菜单可创建子 Journal；子 preset=actspace.chat，parentBoundarySeq=289，origin=fork；首次发送报 SESSION_WRITER_LOCKED，UI 保留草稿；消息级分叉入口仍禁用 |
| 本地/私网 URL | 拒绝通过；错误分类待改 | localhost、127.0.0.1、192.168.1.1 各一次；557–559 tool/call，563–565 WEB_FETCH_FAILED，无内容返回，687 completed。安全拒绝仍标 retryable=true |
| 单张真实图片 | **本轮通过** | 836 generate_image(n=1,size=1024x1024)，838 completed，895 completed；打开右栏可见白底蓝圆图；制品大小与 SHA-256 同 metadata 一致 |
| 压缩设置 | 持久化通过，热触发未验 | 80→50 保存，离开/返回确认 50；恢复 80；settings.json 比例 0.8。没有构造约 500K token 历史，不声称真实压缩或热生效通过 |
| 主题/窄窗口/键盘 | 局部通过 | 深色 Chat/失败提示、浅色 Chat；系统 Window→左侧缩窄后侧栏折叠、Context 抽屉和 Composer 可操作；键盘移除、Enter 发送、消息菜单有效。不是全主题全组件矩阵 |

### 新证据定位

- Agent 隔离会话：`5162a604-18f0-47b2-908a-de0f937336a2`。
- Chat：`0171e3f2-d91e-43c6-80f6-fff8f5f4080f`。
- 失败 fork：`a7d719fd-f5ab-49dc-ab22-36825959a7b8`。父会话 Journal 与子会话复制的边界均为 289，首次子发送未入队；重启后侧栏“无法读取会话”从 19 增至 20，关联原因未定位，不能直接断言是此 fork。
- 生图制品：`4dbf914e-3818-4681-acfb-c72ad7e8cfb4`，image/jpeg，48,136 bytes；SHA-256 `1eae39783807eceb6bffcf35fad38a89d0060db742deee83eac097fe8d11b851`。归属正确 Chat/call。真实右栏已目视检查。
- 截图在本轮 Computer Use 输出中：重载缺失审批、中文附件错误、深色 Chat 失败提示、半屏 Context/Composer、真实生成图片预览。没有另存仓库截图。

### 本轮自动化

- Desktop 六个定向文件共 **17 项通过**：chat-app-rejection、chat-presentation-recovery、runtime-v2-chat-admission-ipc、runtime-v2-chat-attachments、approval-parts、permission-mode-control。
- `pnpm --filter @actspace/tools-runtime test`：25 通过。
- `pnpm --filter @actspace/compaction test`：6 通过。
- 合计 **48 项**；`git diff --check` 通过。不是完整仓库测试，也不是干净提交的发布验收。

### 未覆盖与后续门禁

1. **优先修复**：pending approval 重载恢复；fork writer lease。批准修复方案后再改代码，复验只重复受影响路径。
2. **UI 阻塞**：Grant 管理/撤销与目录树范围选择无入口；无法通过产品 UI 完成撤销和 pending revoke 场景。
3. **仍未验**：full-access 下 Bash/delete 与权限降级；新版 Write/Edit/Bash/Delete 卡全交互；同前缀与敏感文件当前卡复验；JPEG/WEBP/GIF 输入、DOC/DOCX/目录/总文本超限及本次修复后的 NUL/大小桌面复验；完整三态主题与审批窄窗口；重定向/大页面；真实压缩与运行时热阈值判断。历史后端/桌面证据只能按原范围复用。
4. 搜索与公开网页读取复用早前已通过记录，本轮未重跑。图片生成早前失败；仅本轮上述新证据允许标为单张产图通过。
5. full-access 是扩大访问范围，本轮未切换；没有借助内部 API 撤销/清理授权或绕过 UI。

### 最终状态

- Electron 保持运行；原 Chat 可继续对话；无 pending approval/运行任务。
- 浅色、宽窗口、左侧栏恢复；右面板关闭；压缩阈值 80%。权限模式未变，原两条合成文件 read/write grant 仍保留。
- 测试会话、失败 fork、合成文件和制品保留；未清理用户数据、未修改模型或凭据。
