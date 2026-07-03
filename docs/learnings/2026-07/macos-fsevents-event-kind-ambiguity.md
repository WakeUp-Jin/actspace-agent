# macOS FSEvents 的事件类型不可信：created/modified/renamed 歧义与校正策略

> 提炼自 fs-watch 文件监听插件的开发（history: `2026-07/20260703-1800-plugins-fs-watch-integration.md`）。适用于任何基于 `notify`（Rust）、`fsevents`、chokidar 等封装 FSEvents 的文件监听程序。

## 是什么

FSEvents 是 macOS 的目录级变更通知机制。它给每条事件的是**累积的标志位集合**，不是单一动作：一个文件"创建后又修改"，后续事件可能同时带着 `ItemCreated | ItemModified` 两个 flag。上层库（如 Rust `notify`）只能按 flag 猜一个 `EventKind`，猜错是常态。

## 三个实际踩到的坑

1. **rename 不保证成对出现**。`mv a.md b.md` 理想情况下给 `Rename(Both)`（旧新路径同一事件），但经常退化成两条独立事件：旧路径一条 `Rename(Any)`、新路径一条 `Rename(Any)`，甚至是 `modified` + `created`。**无法可靠配对**。
2. **modified 可能被报成 created**。文件创建后不久再修改，flag 累积导致第二条事件仍带 `ItemCreated`，按 flag 判断会把"修改"误报为"创建"。
3. **监听启动前就存在的文件**，第一次被修改时也可能报 `created`（flag 是历史累积的）。

## 校正策略（契约先行 + 运行时启发式）

先在**输出契约上留退路**：明确允许 rename 配对失败时降级为 `removed` + `created` 两条事件。消费方语义不受损（旧路径消失、新路径出现），实现方不用做脆弱的跨事件配对。

再用三个廉价信号在事件流出口做 kind 校正：

- **`path.exists()`**：拿到歧义的 `Rename(Any)` 时，路径还存在 → `created`（rename 的目的地），不存在 → `removed`（rename 的来源）。
- **文件 `birthtime` vs 进程启动时间**：报 `created` 但文件出生早于 watcher 启动 → 改判 `modified`。
- **LiveSet（已报告路径集合）**：本进程已经对某路径发过 `created`/`modified`，再收到 `created` → 改判 `modified`；收到 `removed` 则从集合移除。

三个信号都在去抖合并（debounce coalescing）**之后**应用——先合并再校正，避免对中间态做无用判断。

## 核心要点

- FSEvents 的 flag 是**累积语义**，永远不要把单条事件的 kind 当真相；Linux inotify 没有这个问题，跨平台监听工具的坑基本都在 macOS 侧。
- 与其追求完美的事件分类，不如**在契约上定义可接受的降级形态**（renamed → removed+created），把复杂度从实现移到协议。
- `exists()` / `birthtime` / 进程内状态是三个零依赖的裁决信号，组合起来能覆盖绝大多数歧义场景。

## 自检问题

1. 为什么"创建后立刻修改"会让第二条事件仍然带 created flag？（答：FSEvents 按目录聚合并累积 flag，不逐动作派发）
2. rename 降级为 removed+created 后，消费方会丢失什么信息？这个损失为什么可以接受？（答：丢失"两个路径是同一文件"的关联；消费方按路径状态收敛后语义等价）
