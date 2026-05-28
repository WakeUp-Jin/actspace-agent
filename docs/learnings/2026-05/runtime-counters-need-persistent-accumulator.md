# 运行时累计指标：ring buffer 不是账本，需要独立的持久化累加器

> 关联 history：[`20260528-1735-kairos-usage-accumulator-persistent.md`](../../histories/2026-05/20260528-1735-kairos-usage-accumulator-persistent.md)

## 是什么

把"自启动以来的累计指标"（token 消耗、调用次数、累积成本、累积耗时……）正确暴露给 UI，**不能**复用监控用的 ring buffer / 内存缓存 / 最近 N 条事件。应当抽出一个独立的"运行时累加器"组件：

- **in-memory 累加** + **debounce atomic write** 落到一个独立的小 JSON 文件；
- 进程启动时优先读这个文件；缺失/损坏时回退到"扫描最近一段事件流"重建作为冗余；
- 通过状态 IPC 推给 UI，UI 永远直接展示这份"账本"，不在前端做实时聚合。

## 为什么需要

第一版 Kairos 用量胶囊用了"renderer 端对 ring buffer 调 `aggregateKairosUsage(events)` 实时算"。表面上简单：

- 只加聚合函数，不改状态；
- `重置今日` 时 ring buffer 一清空胶囊自动归零，看起来语义自洽。

实际跑起来露馅了：

- ring buffer 默认 200 条，正常工作几小时后老的 `llm_usage` 会被滚出去，胶囊数字**越跑越小**——用户看到这个就会丢失"我现在已经花了多少"的判断能力。
- 进程重启，buffer 直接清零，但 jsonl 里事件还在，胶囊却归零。"我刚才花的钱呢？"

这两个症状的本质是：**ring buffer 是为"最近事件浏览"设计的，它的丢弃策略和累计指标的留存策略根本不重合**。当你把它当数据源用来计算"全期账本"，就是把两个不同寿命的对象绑死。

## 核心要点

### 1. 区分两种数据需要

| 数据类型 | 寿命 | 失效条件 | 适合的存储 |
|---|---|---|---|
| **样本流** | 短期 | 容量上限滚动 | ring buffer / 缓存 / 最近 N 条 |
| **累计指标** | 长期 | 显式 `reset` 或时间窗切换 | 独立 accumulator + 持久化 |

两者**不要共享同一个数据源**。即使它们都来自同一个事件流，也应该让累加器**派生地、单调地**消费事件，而不是用样本流当真相。

### 2. 累加器的最小骨架（伪代码）

```ts
class RuntimeAccumulator<TPayload, TSummary> {
  private summary: TSummary;
  private dirty = false;
  private writeTimer: Timer | null = null;
  private pendingWrite: Promise<void> | null = null;

  async load(rebuildFromBackup: () => Promise<TPayload[]>): Promise<void> {
    const persisted = await readSnapshotFile();
    if (persisted) { this.summary = persisted; return; }
    // 兜底：从底层事件流重建，处理崩溃中段。
    this.summary = aggregate(await rebuildFromBackup());
  }

  accumulate(payload: TPayload) {
    applyDelta(this.summary, payload);
    this.dirty = true;
    this.scheduleWrite();   // debounce ~300ms
  }

  async reset() {
    this.summary = empty();
    if (this.pendingWrite) await this.pendingWrite;  // 不和 in-flight write 撞车
    await unlink(this.file).catch(ignoreENOENT);
  }
}
```

要点：

- **写盘走 atomic rename**（`writeFile .tmp` + `rename`），避免崩溃截断让重建路径失去信任。
- **`load()` 不落盘**：重建是只读引导，避免冗余 IO，也避免"我用兜底源猜的"立刻被写成"磁盘事实"。
- **`reset()` 等 pendingWrite**：避免一个迟到的写覆盖刚刚 unlink 的结果。

### 3. 把账本塞进运行时状态机

不要让 UI 主动调 `getUsage()` 这种 RPC——它会变成"开页才有数据" + "高频轮询"。改为：

- 状态机维护 `state.usageToday`（或 `usageSinceReset` / `usageLifetime`，按你想要的窗口命名）；
- 累加完毕后**同步** emit 一次 state（不要单独推 `usage` 事件，因为 UI 拿到 state 后整体重算逻辑更简单）；
- UI 端组件直接展示，不需要自己跑 aggregate。

### 4. 命名要让 reset 边界一目了然

`todayTickCount` / `usageToday` / `totalSleepSecondsToday` 这类 `*Today` 字段表达的就是"自上次 reset_today 起的累计"。如果以后要加"全生命周期"维度，新加一个字段（`usageLifetime`）和独立按钮，**不要**改 today 的语义——按钮的产品预期一旦定下来，重新解释代价远高于多加一个字段。

### 5. 何时引入 lifetime 维度

只在用户明确表达"我想看跨 reset 的总数"时引入。`重置今日` 按钮的产品语义是"今天重新开始"，跟它对齐的所有 today\* 都应该清零——这是用户预期。如果你既要 reset 又要保留 lifetime，加新维度，不要拆 today 的语义。

## 常见陷阱

1. **把"最近事件"当"全部事件"**：尤其是有 ring buffer 的系统里，前端 hooks 会把"我能拿到的事件"误认成"所有事件"。每次写 `aggregate(events)` 之前先问：events 是采样还是全集？
2. **直接覆盖写 + 信任磁盘**：用 `writeFile` 直接覆盖累加器文件，遇上断电/崩溃可能写一半。**atomic rename** 是廉价保险。
3. **`load()` 失败就 silent 起 0**：如果完全静默回 0，用户的"我刚才花的钱呢"就成了哲学问题。哪怕只能近似重建（扫今日 jsonl），也比 0 更接近事实。
4. **reset 后 in-flight write 写回**：reset 完磁盘文件应该不存在；如果有 pending 写没等就 unlink，写完了反而又出现一个"上次的快照"。
5. **币种/单位等 metadata 的状态机外置**：单条 payload 自带 currency，但"我已经见过 USD 还是 CNY 还是混合"是跨调用的状态，不能塞进单条累加函数。把它做成 callback / observer 外推，让累加函数本身保持无副作用。
6. **persistent file 的 schemaVersion**：第一版就给 `schemaVersion: 1`。一旦没写，未来加字段你要么写"猜 schema"的代码，要么直接破坏旧用户。
7. **本地时区 vs UTC 错配**：底层事件按 UTC 存盘是常见做法，但运行时状态机里很多 today\* 是按本地时间显示给用户的。扫盘兜底要用 UTC 键，对用户展示用本地时间，**两条线分别明示**。

## 自检问题

1. 你的 UI 数字会不会因为 ring buffer / 缓存 / 最近 N 条这类"采样集"被滚动而**变小**？如果会，你大概率需要这个 pattern。
2. 进程崩溃重启 5 秒后，UI 的累计数字与崩溃前差距是 0、近似、还是从 0 重数？如果是"从 0 重数"，需要 accumulator。
3. `重置今日` / `清零 / reset` 按钮按下后，**所有**带 today\* 命名的状态都被清空了吗？还是某一个字段悄悄继续累加？
4. 你的累加器在反复 reset → 写 → reset → 写之间，最后磁盘文件状态是确定的吗（要么不存在、要么是最新的完整 JSON）？没有"半个文件"或"上轮残留"？
