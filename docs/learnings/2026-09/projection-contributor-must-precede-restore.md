# Projection Contributor 要先于恢复注册

这次把 Todo 从 Core Journal 移到独立插件时，关键并不只是搬走 reducer，而是确定 **领域投影何时进入同一个 Session registry**。

一个 Session 的 checkpoint 会保存每个 projection key 的状态和版本。恢复时 registry 根据当前已注册的 definition 逐项核对 checkpoint。如果 `todos` 在恢复后才注册，checkpoint 无法判断它该从哪个版本恢复；即使临时从当前 Journal 重放，也会让同一 Session 的其它投影处于不同时间点。

正确顺序是：插件启动时注册 Contributor；Runtime 为 Session 创建 registry；安装通用 facts；按确定顺序应用所有 Contributor；然后才读取 checkpoint 或重放 Journal。Contributor 只提交纯 `init/apply/view` definition，不自己订阅事件或保存第二份快照。这样 checkpoint 失效时，同一个 registry 可以从 Journal 重建全部投影。

```text
Behavior 启动 → registerContributor(todo)
Session 读取 → createRegistry → registerSessionFacts → applyContributors
             → restore(checkpoint) 或 replay(Journal)
```

这里的 `registerContributor` 是启动期操作。生产采用 restart-only，所以首次应用后拒绝新增 Contributor，避免运行中的 Session 有两套 projection schema。禁用 Todo 时，启动组合同时跳过 Todo Behavior 与 Codec；旧的 required `todo/write` 没有新 Codec，会明确进入 browse-only，而不会被空 Todo 投影伪装成已恢复。

自检时看两条证据：有 `todos` 行的 checkpoint 可以冷读；删除 checkpoint 后由同一 Journal 重建的 `todos` 完全相同。这比只测试单个 reducer 更能证明时序契约。

来源：2026-09-28 Tool 插件边界拆分与 Todo 领域迁移；设计入口见 `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`。
