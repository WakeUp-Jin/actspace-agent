# Context Step 与 Session 存储联合 Computer Use 验收

状态：2026-10-18 本轮验收完成，发现2项问题，部分范围未覆盖。只验收与记录，业务修复另行安排；不提交/推送。

基线：`e3468f2b280c1b2ea8604a72eb7ca3b47ec73a6e` + 两计划当前未提交工作树。实现依据为 completed/20261018-context-step-update.md 与 completed/20261018-session-storage-refactor.md。验收由 gpt-6.1-sol 执行原生 Electron CUA，主智能体准备隔离环境、核对日志和汇总。不是浏览器 mock，也不代表真实外部 Provider 验证。

隔离目录 `/tmp/actspace-context-storage-cu-20261018`；仅 synthetic credential、回环 HTTP Provider，不读取用户设置。应用使用 ACTSPACE_DATA_DIR / ACTSPACE_WORKSPACE_ROOT 隔离，Vite 5178。Provider 基于仓库既有 fixture 的本轮副本，增加长工具输出、受控使用量、620 流式 chunks 和 Todo 触发；不修改产品代码。任何种子与运行时证据均单独标识。

## 验收点

| 编号 | 预期 | 状态 |
| --- | --- | --- |
| C1 | 多 Step 工具完成后 Context 刷新 | 通过：受控Step完成刷新；未覆盖并行多工具 |
| C2 | 工具批次后自动压缩，下一请求使用新内容 | 通过：真实界面与Journal/Provider顺序对应 |
| C3 | 压缩取消/失败正确收尾 | 失败：CU-01停止入口被禁用；CU-02自动失败终态无持续提示 |
| C4 | 切会话、重开面板不串会话/旧版本 | 通过：切到长历史再切回、关闭重开面板；未覆盖高频竞态压力 |
| C5 | 路径后端能力与当前 UI 交付边界明确 | 部分覆盖：现场新增路径UI可见活跃列表与睡眠空态；非空睡眠/大量分页未覆盖 |
| S1 | 超过512事件后早期内容、工具结果和分页可读 | 部分覆盖：界面加载至120轮，未越过约116轮缓存界限；文件回读有独立运行时证据 |
| S2 | 退出重启后会话、标题、模式、Todo、Context恢复 | 部分覆盖：标题/Todo/轮步恢复；特殊模式切换恢复未覆盖 |
| S3 | 附件重启可读，分叉后可访问 | 部分覆盖：存储种子图片重启显示/预览通过，UI直接上传提交通过；该UI图片再次重启与fork未覆盖 |
| S4 | 移除隔离 SQLite 后恢复/执行正常、查询可重建 | 部分覆盖：目录/会话恢复、继续执行、Context索引追赶通过；片段搜索未覆盖 |
| V1 | 相关浅深主题显示和交互无明显回归 | 部分覆盖：浅色多状态可见，无明显布局回归；深色未覆盖 |

## 操作分组

1. 新会话与多步执行：UI 发 FIXTURE_LONG，观察 Step、工具、Context、压缩；通过 summary-hold / summary-error 控制服务端延迟/失败，UI 取消。覆盖 C1–C3，记录关键中间状态与 Journal/Provider顺序。
2. 长历史与恢复：UI 发 FIXTURE_STORAGE，增加 Todo/附件并形成可持久化会话，检查历史；正常退出后保留数据重启，将测试 SQLite 保留备份后移走，合并重启并继续。覆盖 S1–S4，记录持久文件数量、水位、附件身份、恢复截图。
3. 竞争与布局：切会话、开关面板，浅深主题，必要错误态与路径 UI 边界。覆盖 C4/C5/V1。

## 证据规则

CUA 界面、文件/日志运行时证据、源码推断分别列出。无法实测项标未覆盖，Bug 阻断仅影响对应项，其余继续。截图存 evidence/（本地截图，不随仓库分发）。内存预算、来源缓存和背压不凭界面截图认定通过。外部真实 Provider、断电、全进程内存上限不在本轮可证明范围。

## 本轮结果

问题与复现见 [issues.md](issues.md)，主要结论见 [execution-summary.md](execution-summary.md)，原生操作细节见 [computer-use-report.md](computer-use-report.md)，文件/日志证据见 [runtime-verification.md](runtime-verification.md)。两项问题均未修复；全部未覆盖项保留，不以源码或运行时证据替代界面通过。
