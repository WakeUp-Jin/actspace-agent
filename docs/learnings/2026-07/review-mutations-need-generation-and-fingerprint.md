# Review 写操作需要 generation 与 patch fingerprint 双重绑定

关联变更：`docs/histories/2026-07/20260730-1832-review-workbench.md`

## 问题

代码审阅界面展示的是某一时刻的 diff，但文件可能同时被编辑器、Agent、Git action 或文件监听事件改变。如果用户稍后点击“Stage hunk”或“Revert”，仅凭 path 和行号执行，动作可能落到已经变化的内容上。

## 两层校验

`generation` 绑定整个 workspace Review 状态。任何文件写入、Git mutation、branch/commit/push、主动刷新或 watcher invalidation 都递增 generation。请求携带旧 generation 时，在进入 provider 前就拒绝。

`patchFingerprint` 绑定具体 hunk 内容。即使调用仍处于同一 snapshot，hunk action 也必须携带加载时的 fingerprint；执行前重新找到 hunk 并比较，避免相同 path、相同行号但正文已经变化的情况。

```txt
Review snapshot generation
        |
        +-- file identity / fingerprint
                 |
                 +-- hunk id / patch fingerprint
```

## 为什么不能只选一个

- 只有 generation：可以阻止大多数跨快照操作，但无法证明客户端提交的 hunk 正是当前加载过的那一段。
- 只有 patch fingerprint：无法快速让整个缓存树失效，也无法统一表达 branch、commit、watcher 等非单文件变化。
- 两者组合：generation 负责粗粒度一致性和缓存失效，fingerprint 负责细粒度内容身份。

## 操作规则

1. Renderer 不自动重试 destructive mutation。
2. Main 先校验 registered workspace 和 generation，再解析 snapshot/file/hunk。
3. Hunk mutation 再校验 patch fingerprint。
4. stale 返回当前 generation，UI 刷新并要求用户重新确认。
5. partial success 必须列出已完成与失败步骤，不能折叠成通用失败。

## 可迁移场景

这个模式不只适用于 Git Review，也适合表格批量编辑、可视化 patch、审批流、远端配置变更和任何“用户基于旧预览执行写操作”的系统。核心原则是：预览不是事实本身，写操作必须证明它仍然针对同一个版本和同一段内容。

## 常见陷阱

- mutation 成功后只刷新 UI，不让 main generation 失效，旧缓存仍可能被其他入口复用。
- stale 后自动重试 revert，用户实际确认的内容已经改变。
- 用 path 作为唯一 identity，rename 或 delete/add 会错误继承 viewed、comment 或 action 状态。
- 测试只断言返回字符串，没有检查真实 Git index 与 working tree。
