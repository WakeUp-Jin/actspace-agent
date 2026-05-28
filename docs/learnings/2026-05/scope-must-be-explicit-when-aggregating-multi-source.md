# 多事实源聚合页：scope 必须是显式契约字段，不能藏在参数里

> 关联 history：[`20260528-2000-usage-page-global-scope.md`](../../histories/2026-05/20260528-2000-usage-page-global-scope.md)

## 是什么

任何"看似汇总全部数据"的页面（usage / billing / activity feed / 全局 dashboard），如果它的数据可能来自**多个事实源**（不同 session、不同 agent、不同租户、不同数据库），那它的取数范围 `scope` 应该是一个**契约里显式存在的字段**，而不是"靠某个参数不传 = 默认取全部"。

具体到本仓库的 Usage 页面，旧实现长这样：

```ts
ipcMain.handle("usage-statistics:get", async (_event, input) => {
  const record = await readSessionRecord(join(sessionRoot, input.sessionId));
  return createUsageStatisticsSnapshot(record, input.range ?? "month");
});
```

前端按下"总计 / total" tab，看到的并不是"全部数据"，而是"当前那一条 session 的所有事件"。问题不在代码——代码很诚实，问题在 **"sessionId 必填 + range='total'"组合的产品语义**：UI 提示"全部"，参数空间里没法描述"跨所有 session"。

## 为什么需要

一个最小反例：

| 用户操作 | UI 显示 |
|---|---|
| 进入 Usage 页面，选了"总计" tab | 看到 12K tokens |
| 在侧栏切换到另一条对话，再回 Usage | 看到 45K tokens（同一个"总计"） |
| 启用 Kairos，监控页头部胶囊涨到 60K | Usage "总计"还是 45K（Kairos 没进账本） |

用户的心智模型一直是"一个账户的总账单"，但实现里这其实是"当前那条 session 的总账单"。每次切对话数字都变，体验上像 bug——但代码层面没人写错。这是**典型的 UI 词汇与实现语义错位**。

## 怎么用

### 反面写法：靠"参数缺省"区分

```ts
// 调用方约定：不传 sessionId = 全部数据
type GetUsageInput = { sessionId?: string; range?: Range };
```

问题：

1. 类型层面看不出来"不传 sessionId"意味着什么；
2. 主进程要靠隐含约定分流，老调用方代码一旦从"必传 sessionId"被人误改成"传 null"，会**沉默地**切换到完全不同的取数路径；
3. 文档不写清"哪个字段缺省时走哪条分支"就完全没人能猜到。

### 正面写法：显式 scope 字段

```ts
type UsageScope = "session" | "global";

type GetUsageInput = {
  scope?: UsageScope;          // 默认按 "global"（无 sessionId）或 "session"（有 sessionId）兼容老调用方
  sessionId?: string;           // 仅 scope==="session" 时必填
  range?: Range;
};

type UsageSnapshot = {
  scope: UsageScope;            // 出参也带回 scope
  sessionId: string | null;     // global 时显式为 null
  title: string;
  sourceCount: number;          // 参与聚合的事实源数量
  // ...
};
```

前端拿到 snapshot 后通过 `snapshot.scope` 决定标题、来源数提示、是否启用"按会话钻取"按钮。后端通过 `input.scope` 走分流逻辑，缺省值的兼容性放在一个地方（handler 入口），不会扩散。

## 核心要点

1. **scope 是一个独立维度**。它和"时间窗 range"是正交的——day/week/month/total 是时间切片，session/global 是来源切片。不要把它压进 sessionId 的存在与否。
2. **入参和出参都要带 scope**。出参带回去的好处是：renderer 可以做"不信任前端缓存"的兜底渲染——拿到 snapshot 就能完整决定页面文案，不用再读自己上一次发送的 input。
3. **事件级合流 > snapshot 级合流**。当一个全局 snapshot 来自 N 个事实源时，正确做法是把 N 个来源的原始事件摊平再算一次派生指标（占比 / 缓存命中率 / 成本舍入），**不要**先算 N 个小 snapshot 再合并。后者会让百分比/命中率重复舍入、合并语义模糊。
4. **不要用增量累加器代替全量重算**。Kairos 在本仓库有一个 `usage-accumulator.json`，它是"自上次 reset_today 起"的运行时累计；用它做 Usage 账本会复刻和 ring buffer 一样的问题（reset 时数字变小，用户失去信任）。事实账永远基于 jsonl 重建。
5. **失败兜底要单点容忍**。global scope 下任何单个事实源（某条 session 文件损坏 / Kairos 目录不存在）读失败都不能炸掉整张账单——`try { ... } catch { return null }`，再 `.filter(Boolean)` 是最简洁的写法。

## 常见陷阱

- **缺省值的方向反了**：如果默认 `scope === "session"` 但 `sessionId === undefined`，主进程拿不到 sessionId 就只能返回 null，前端看到"暂无数据"——一切看上去像没数据，其实是契约 mismatch。**默认值应当指向"信息更全的那一档"**，本案是 global。
- **fixture 没跟上契约升级**：前端 storybook / 单测的 mock snapshot 没补 `scope` / `sourceCount`，类型上还能 cast 过去（如果用了 `as` 强转），运行时就会出现 UI 渲染分支用了 `undefined` 当 `"session"`。修契约的同一个 PR 里必须把 fixture 全部刷一遍。
- **时间窗语义随便选**：`day = "今天 0:00 起"` 还是 `"近 24 小时"`？`week = "近 7 天"` 还是 `"本周一起"`？这次本仓库选了"往回数 N 天"——产品 dashboard 常见心智，与 controller 里 `todayTickCount` 这种"日历今天"刻意分开。在 doc 和测试里把语义写死，否则后人重构会随便改一下断言。

## 自检问题

1. 如果你在一个新页面要展示"全部 X"，先问自己：X 的来源有几个？这几个来源是不是有独立的存储路径？如果是，你的 IPC 入参里有没有一个字段告诉后端"我要的是哪一档"？
2. 当用户从 A 路径进入这个页面、再切换到 B 路径回到这个页面，数字会不会无声地变？如果会，那是不是 scope 漏了一个维度？
3. 你的 snapshot 出参告诉调用方"我聚合了多少来源"了吗？没有 `sourceCount` 之类字段时，前端用什么方式做"数据可信度"提示？
