# Review CPU 优化方案（修订版，2026-10-08 用户批准并实施）

本文件替换了未提交的初版方案。与用户讨论后做了三处修订：把「按 Git 语义过滤 ignored 变化」纳入本轮，摘要逻辑从 `App.tsx` 拆成 hook，第二步明确只是调整窗口常量。实施结果见 [optimization-results.md](optimization-results.md)。

## 判断

资源测试（[execution-summary.md](execution-summary.md)）确认：没有大量持续内存增长，但有两类可复现的 CPU 开销。

- 前台：ignored 构建目录高频写入，每 150ms 一次完整 Git 快照查询（约 5 条 Git 命令），真实桌面平均 43.82% 单核。根因是被 Git 忽略的文件变化也让 Review 失效。
- 后台：切走后旧工作区仍在写入，App 的摘要订阅不看 `workspaceId`，每条通知都重查当前摘要并两次 setState，真实桌面平均 31.46% 单核，主要在 renderer。

## 实施步骤（三步可独立回退）

1. **摘要只响应自己的工作区**（renderer）：新建 `components/review/use-review-summary.ts`，App 只调用它。记录当前快照返回的 `workspaceId` 精确匹配通知；首个快照返回前只为在途请求记一次补查；同一目标最多一个请求在途，期间通知合并成一次补查；同目标刷新保留已有摘要，内容不变时保留原引用；切目标丢弃旧响应。
2. **按 Git 语义过滤 ignored 变化**（main）：watcher 把工作区相对路径交给 coordinator；窗口结束时用一次 `git check-ignore -z --stdin` 核对，全部被忽略就不失效。Git 元数据、`.gitignore`、无文件名、超过 2,000 条路径、`check-ignore` 失败一律刷新（fail-open）。不按目录名硬排除。
3. **固定窗口 150ms → 500ms**：`scheduleInvalidation` 原本就是「首个事件开窗、不顺延」，只改默认值。Refresh、mutation 仍即时。

## 放弃的部分

- **1b：Review 面板复用未变文件的 diff**。文件 `fingerprint` 只由路径、状态和增删行数构成，不含内容；同样 +1/-1 的两次修改 fingerprint 相同，复用会显示旧 diff。第 2 步之后面板收到的通知都对应真实变化，本来就要重拉，收益不足以承担正确性风险。
- 监听生命周期（引用计数、LRU）：监听本体未测出明显内存问题，本轮不改。

## 验收门槛

- 自动回归：无关工作区通知不触发摘要请求；同目标请求有界；首次加载期间的变更不丢；快速切换不串状态；失败可恢复；相同摘要不重复更新。ignored-only 窗口不失效；已跟踪文件（含 ignored 目录内）、未忽略新文件、`.gitignore`、Git 元数据照常失效；固定窗口约 2 次/秒且最后一批必达；dispose 后过滤结果不再通知。
- 组件对照：同一 3 万文件夹具、同一写入速率，改前语义与改后各 3 轮取中位数。ignored 写入时通知应接近 0；已跟踪高频写入 CPU 至少降 50%；普通保存 1 秒内产出新快照。
- 真实 Electron：后台负载相对 idle 增加不超过 3 个百分点、前台 ignored 写入下降至少 50%、B03 外部改文件自动刷新仍成立。需重启 dev 应用后复测。
