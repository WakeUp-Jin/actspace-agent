# Review CPU 优化实施结果

2026-10-08。方案见 [optimization-proposal.md](optimization-proposal.md)。本文只记录组件层对照和自动化验证；真实 Electron 复测尚未进行。

## 改动

- `apps/desktop/src/renderer/components/review/use-review-summary.ts`（新）：摘要 hook，App 中原有的摘要状态、请求序号和两个 effect 移入此处。
- `apps/desktop/src/main/review-ignore-filter.ts`（新）：`git check-ignore -z --stdin` 批量核对，任何异常按「有变化」处理。
- `apps/desktop/src/main/review-workspace-watcher.ts`：工作区文件回调带相对路径；Git 元数据和 `.gitignore` 不带路径（强制刷新）。
- `apps/desktop/src/main/review-coordinator.ts`：窗口内累积路径，结束时过滤；默认窗口 500ms；dispose 后不再通知。
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`：注入过滤器，复用 Review worker 的 `runGit`。

## 组件对照

夹具与资源测试相同：10,001 个已跟踪文件、20,000 个 ignored 依赖文件，一个已跟踪差异。每组在新 Node 进程里加载**本次源码的编译产物**（独立 outDir，不动 dev 应用的 `dist-electron`），用 `/usr/bin/time -l` 统计进程及已等待子进程（含 Git）的 user+sys CPU 秒。每条通知都执行一次真实快照查询，模拟 Review 打开时的负载。

「改前」用改后的代码模拟旧语义：150ms 窗口、不传路径、不过滤。负载 20 秒，进程总时长约 22.6 秒（含 1 秒启动和 1.5 秒收尾）。CPU 包含写入脚本自身。

| 负载（20 秒） | 改前 CPU 秒（3 轮中位数） | 改后 | 降幅 | 通知数 改前→改后 | 快照 Git 命令 改前→改后 | `check-ignore` 次数 |
|---|---:|---:|---:|---|---|---:|
| ignored `dist` 写入，约 375 次/秒 | 20.18 | 3.68 | 82% | 124 → 0 | 620 → 0 | 40 |
| 已跟踪文件写入，约 375 次/秒 | 19.89 | 9.98 | 50% | 约 125 → 40 | 约 620 → 200 | 40 |
| 每秒保存一个已跟踪文件 | 3.79 | 3.83 | 持平 | 20 → 20 | 100 → 100 | 20 |

参照：资源测试里「不监听」的同等写入负载在 34 秒进程内消耗 2.43 CPU 秒，所以改后 ignored 写入的 3.68 秒中，大部分是写入脚本本身。

普通保存的代价是延迟。从保存到新快照完成：改前中位数约 240ms，改后约 590ms，9 个样本里最慢一次 967ms，仍在 1 秒目标内。这是 500ms 固定窗口的直接结果。

三轮全部 0 次查询失败；结束后夹具只剩原有的一个差异文件。

原始数据和脚本在 [optimization-benchmark/](optimization-benchmark/)：`summary.json` 是汇总，`<before|after>-<负载>-<轮次>.json` 是单次结果。`bench.cjs` 写死了临时编译目录 `/tmp/review-opt-bench/dist/main`，复用前要先把 main 编译到那里，并把 `node_modules` 软链过去。

## 测试中发现的问题

第一次对照时「改后」组的过滤器一次都没有调用：dev 模式的 `tsc -b` 只重新编译了部分文件，`dist-electron` 里的 watcher 仍是旧版本，不传路径。那一轮实际上只测到了 500ms 窗口的效果（ignored 写入从 20 CPU 秒降到约 10 秒），数据未采用。改为独立 outDir 编译后重测。

## 自动化验证

- 新增：`use-review-summary.test.tsx` 6 项、`review-ignore-filter.test.ts` 5 项（真实 Git 仓库）、`review-coordinator.test.ts` 新增 3 项、`review-workspace-watcher.test.ts` 新增 1 项（真实文件监听）。
- 完整 Desktop vitest：1694 通过、2 跳过。`session-ipc-budget` 的「2000 events」用例在全量并行时超时 1 次，单独运行通过（改后 9.4–17.6 秒，改前 12.5 秒），判断为负载导致的不稳定，与本次改动无关。
- Desktop typecheck（renderer + electron）、`check:ipc-channels`、`check:renderer-bridge`、`check:frontend-tokens`、`check:frontend-theme`、`check:desktop-build-graph`、`git diff --check` 通过。

## 未完成

- 真实 Electron 复测：当前 dev 应用的 main 进程启动于 2026-10-07，仍运行旧代码，没有重启。需重启后按资源测试的同一方法复测后台切走场景（目标：相对 idle 增加不超过 3 个百分点）和前台 ignored 写入，并复验 B03 外部改文件自动刷新。
- 组件对照不含 renderer。摘要 hook 对后台 CPU 的效果只有单测证据，没有实测数字。
