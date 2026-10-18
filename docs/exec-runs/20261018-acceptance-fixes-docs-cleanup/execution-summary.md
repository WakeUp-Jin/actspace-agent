# 验收缺陷修复与文档迁出摘要

状态：实现、DOCS 迁出和定向复验完成；工程检查通过，按用户授权一次提交并创建 PR。

## 修复范围

| 编号 | 修复 | 验证依据 |
| --- | --- | --- |
| WA01 | Web 显示队列暂停并提供继续发送；普通发送不解除暂停；版本冲突按真实 Host 回包只重试一次 | Web 控制器/组件回归，真实 Host 的停止/失败/刷新恢复、撤回、断连/维护禁用均通过（可控 Provider）；见 [Web复验](web-retest.md) |
| WA02 | Web 审批与队列恢复按钮的触控尺寸至少 44px，审批按钮可换行 | 构建、主题/token 检查及 Web 390px 浅深两按钮几何复验；三按钮组件高44px，实际Host三按钮/换行仍未覆盖 |
| DA01 | Composer 状态行可收缩，统计胶囊可换行，避免聚焦后横滚及 Context 左侧裁切 | 原缺陷的真实统计会话与窗口尺寸复验，见 [Desktop复验](desktop-retest.md) |
| DA02 | 文件工具在同一真实路径坐标下计算工作区相对路径 | 新建/修改/删除及工作区外授权目标回归；真实模型新一轮显示2份文件改动卡，刷新后保留；历史已有错误 metadata 不回写 |
| DA03 | 历史窗口在移除定稿 chunk 前保留观测到的首 token 时间 | 不修改 Journal；无观测时间仍显示未知；Runtime 回归通过；原生重启/刷新后的 Thinking 历史显示 TTFT 527ms、生成465ms、245.2tok/s，与原始对账一致 |
| ENG01 | Runtime 测试跟随已实现的内置 Harness 自动升级合同，且保证释放租约 | 原15秒限制内通过，Runtime全量57项通过 |

## DOCS

- 31 个 HTML Demo（原件共1,342,261字节）已备份后从当前文件树移除，桌面备份44文件、8,357,579字节，逐文件SHA-256一致；共享样式和图片未删除。
- 用户取消备份页面打开检查。缺失的12张既有Web截图在manifest中登记，旧Logo仅在备份侧从Git历史恢复；没有伪造资源。
- 2个待实现/验收依赖Demo、7个学习HTML和Session Viewer保留。
- 10个实现完成计划归档并更新入口；Context/SQLite、Web工程边界、队列恢复语义、官网文档和验证指南漂移已校准。
- 历史未覆盖项不自动转为通过，Site阶段B、Web iPhone/Tailscale以及DSH/原生性能观察仍保留。
- 原路径、哈希和Git恢复版本见[迁出清单](../../design-docs/retired-html-demos.md)。

## 工程验证

- Web：101 tests passed；类型检查及生产构建通过。
- Runtime：57 tests passed；类型检查通过。
- filesystem-write：5 tests passed；类型检查通过。
- Desktop：类型检查、依赖构建、renderer/electron构建通过。前两次全量在并发执行时分别出现1项IPC性能用例/清理hook超时；独立复验5项通过，最终单 worker 全量 1928 项通过、7 项跳过（238 个测试文件通过、2 个跳过）。未修改超时或跳过配置。
- Agent Service：33 tests passed；Client：26 tests passed。
- 仓库基础 CI（`./scripts/ci.sh`）及秘密信息扫描通过。
- Site：check无错误/警告，23 tests passed，46页构建通过；发布记录更新后重新验证。
- 文档链接、当前事实、前端token、主题、renderer bridge检查通过。
- 深度只读审查已修复1项真实协议冲突问题，剩余产品发现0项。

## 定向覆盖

Web 12点中8通过、0失败、4未覆盖（含部分验证）。真实Host与受控Provider的关键队列/审批路线通过；真实浏览器冲突、原生Web Computer Use、真实Web Provider和实际Host三按钮/换行证据未完整覆盖，详见[Web复验](web-retest.md)。

Desktop 核心修复均有原生复验：实际482px窗口的Context/统计行完整；真实模型新一轮的2文件改动卡刷新后保留；旧Thinking轮次的首token/生成时间与吞吐量在重启和刷新后恢复。代表性证据不等于全部尺寸、主题和历史类型组合通过，完整逐项边界见[Desktop复验](desktop-retest.md)。

## 交付边界

本轮修复对应已确认缺陷，不宣称初轮所有未覆盖项已验收。真实Key由应用既有配置使用，不复制到文档或命令；真实Provider、可控Provider与mock证据各自标明。创建PR后等待仓库检查和审阅，不自动合并，也不发布安装包。
