# UI 展开状态不是后台请求计划

来源：Review Workbench 大 Diff 性能纠偏，`docs/histories/2026-07/20260730-1832-review-workbench.md`。原 HTML，已转 md。

列表、树、Diff 页面很大时，用户看到什么、数据加载什么、DOM 挂载什么，是三个不同问题。把它们绑在一个 `expandedIds` 上，会把一次普通点击放大成不可控的 I/O 与渲染风暴。

## 失败模式

“Expand all”看似只是展示动作。旧实现把每个展开 ID 直接变成一次请求：N 个文件被标记展开 → N 次 IPC、N 个 Git child、N 份 patch、N 组 DOM。即使画面只显示当前文件，只要 store 仍保留全部 expanded ID，就是“视觉 capped、后台 uncapped”——很难从截图判断，必须看 producer 到 consumer 的完整调用链。

## 三个集合分开

| 集合 | 回答 | 由谁决定 |
|---|---|---|
| `displayedIds` | 当前界面有哪些 section | load policy + selection + filter |
| `requestedIds` | 后台现在允许读哪些数据 | snapshot load policy |
| `mountedRows` | 此刻 DOM 中保留哪些行 | virtualizer visible range |

```ts
// 错：交互状态隐式决定 I/O
useEffect(() => { expandedIds.forEach(loadFileDiff) }, [expandedIds])
// 对：策略显式决定唯一请求集合
const requestedIds = loadPolicy.mode === "single-file" ? [selectedFileId] : snapshot.textFileIds
loadFileDiffs(requestedIds)
```

## 只加并发限制不够

Semaphore 把 100 并发压成 8，但消除不了 100 次重复的 repository 解析、Git 启动、patch 组装；它降低峰值，保留总工作量与长尾。更有效的顺序：先缩小请求集合 → 把同基线同参数的 tracked files 合成批量命令 → 最后才对无法批处理的 untracked/file reads 用有界并发。

## Generation 是取消边界

scope、workspace、whitespace 语义或 Git 状态变化后，旧请求即使成功也不再属于当前界面。每个 generation 有自己的 `AbortController`、pending cache、prepared context：

```ts
invalidate(workspaceId) {
  state.abortController.abort(); state.abortController = new AbortController()
  state.generation += 1; state.pending.clear(); state.prepared.clear()
}
```

取消 child process 解决资源浪费；generation guard 解决迟到结果污染，缺一不可（同 [request id guard](../2026-06/request-id-guard-for-ui-refresh.md)）。

## 虚拟化解决 DOM，不解决数据

虚拟列表只限制挂载行；后台仍加载全部完整文件，内存与 Git I/O 依然爆。反过来只做 capped 数据加载却把 9,000 行一次挂进 DOM，滚动与 React commit 照样卡。数据策略：Standard 批量 patch、capped 当前文件、full content 仅可见附近；渲染策略：扁平稳定 row key、可变高度测量、有限 overscan。

## 陷阱

- 失败的 Promise 留在 cache，Retry 永远拿到同一个失败结果。
- 只取消网络/child，不做 generation guard，迟到结果覆盖新 selection。
- full-file 开关复用 patch 请求，关掉显示选项时重新执行全部 Git。
- 虚拟列表用 DOM ID 跳转，目标行未挂载时定位失效，应使用 virtual index。
- jsdom 没有真实布局，尺寸观察得到 0；测试保底视口必须在真实尺寸出现后让位。

## 自检

1. 一次 Expand all 最终产生几次 IPC、几条 Git 命令、多少 live DOM row？
2. 切换 scope 后旧 child 被取消了吗？旧结果还能写进新 state 吗？
3. 关闭 full content 时 patch 无需重取且仍可阅读吗？
