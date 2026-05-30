# 成本/单位类指标的展示要忠于事实，不跟随 UI 偏好

关联 history：`docs/histories/2026-05/20260528-1702-kairos-usage-badge.md`、`docs/histories/2026-05/20260530-2358-deepseek-pricing-cny.md`

> **后续更新（2026-05-30）**：本文预测的「改事实」动作真的发生了——产品确认 DeepSeek 为国产模型、按人民币计价，于是把 `model-config.ts` 里 DeepSeek pricing 的 `currency` 切到 `CNY`，**并把单价从 USD 数额按 ≈7.2 一次性换算成 CNY 单价**（不是只翻 `currency` 标签，否则就是本文第 35–37 行警告的「7 倍欺骗」）。因为当初坚持「UI 跟随 `cost.currency` 而非硬编码 ¥」，这次切换**零 UI 改动**即生效（胶囊、tooltip、Kairos 额度全自动从 `$` 切到 `¥`）——反向验证了本文结论。已写盘的旧 `llm_usage` 事件 cost 字段仍是 USD，按事件内 `currency` 字段照常显示，无需迁移（见「常见陷阱 · 历史数据迁移」）。

## 是什么

当 UI 需要展示一个**带"单位/币种"属性**的数据时（成本、长度、温度、汇率、token 计价等），UI 的展示符号必须**跟随数据本身携带的单位字段**，不能跟随"用户偏好"或"产品当前定位"硬切。

例如本次的 `LlmUsageCost`：

```ts
type LlmUsageCost = {
  total: number;
  currency: "USD" | "CNY";   // ← 事实
  // ...
};
```

selector 输出胶囊文案时，符号必须按 `cost.currency` 选：

```ts
// ✅ 忠于事实
const symbol = currency === "CNY" ? "¥" : "$";

// ❌ 跟随 UI 偏好硬切
const symbol = "¥"; // 因为"产品是面向中国用户的，所以全用 ¥"
```

## 为什么需要

直觉错位是这样发生的：

1. 用户/PM 反馈"这里成本应该显示成人民币"。
2. Agent 听话地在 selector 里把符号硬改成 `¥`。
3. 数据源（model-config.ts）里 DeepSeek pricing 单价依然是 USD 单位（`outputPerMillion: 0.28` 是 USD/百万 token）。
4. UI 显示 `¥0.06`，但实际数额是 $0.06 的 USD。
5. 用户基于这个数据估算月预算 = 数额 × 月调用量 × 7（汇率），实际付出 7 倍预算。

这是**用 UI 表达谎称事实**——比"没显示成本"还糟糕。

正确做法是把"我想看 RMB"翻译成两个独立动作：

- **改事实**：把 model-config 里 DeepSeek pricing 切到 CNY 单价；
- **UI 自动跟随**：selector 按 `cost.currency` 选符号，无需改 UI 代码。

这两件事职责分离：事实是事实，展示是展示。

## 怎么用

### 1. 在 schema 里强制带单位字段

```ts
type LlmUsageCost = { total: number; currency: "USD" | "CNY" };
type Distance     = { value: number; unit: "m" | "km" | "mi" };
type Temperature  = { value: number; unit: "C" | "F" | "K" };
```

不要写 `cost: number` 然后让"调用方根据上下文自己想单位"——单位是数据的一部分，不是约定。

### 2. selector / formatter 必须按单位字段分支

```ts
function formatCost(c: LlmUsageCost): string {
  const sym = c.currency === "CNY" ? "¥" : "$";
  return `${sym}${c.total.toFixed(c.total < 0.01 ? 4 : 2)}`;
}
```

### 3. 聚合多条数据时，对单位做一致性校验

多个 LLM call 可能来自不同 provider，单位可能混合：

```ts
function aggregate(events: SessionEvent[]) {
  let seen: Currency | null = null;
  let mixed = false;
  // ...
  if (seen === null) seen = cost.currency;
  else if (seen !== cost.currency) mixed = true;

  return { cost: total, currency: mixed ? "MIXED" : seen };
}
```

UI 看到 `currency === "MIXED"` 时显式标记（如 `≈ $0.02`、tooltip 提示"混合币种估算"），而不是硬挑一个币种偷偷加总。**承认无法精确就比"假装精确"好**。

### 4. 用户说"想换单位"时，先问"是想改事实还是改偏好"

```
用户："这里给我用 ¥ 显示"

Agent 反问（或直接判断）：
- 数据源是 USD pricing → 这不是"改 UI 偏好"问题，而是"产品要换计价货币"
  → 改 model-config 单价 + currency 字段 → UI 自动跟随
- 数据源已经是 CNY，但 UI 偷懒写成 $ → 这才是"改 UI 偏好"问题
  → selector 修一下符号逻辑
```

不区分这两种情况就盲目改 UI = 数据撒谎。

## 核心要点

1. **单位是数据的一部分，不是约定**。schema 里就要带 `currency` / `unit` 字段。
2. **UI 永远按字段选符号**，不要硬编码"我们默认用 ¥"。
3. **聚合时做一致性校验**，混合单位用 `MIXED` 标记，UI 不偷偷换算。
4. **用户的"换单位"诉求 ≠ UI 改字符**。先问"事实变了还是只是表达变了"。
5. **诚实地说"我不知道"比假装精确好**——`≈ $0.02` 加 tooltip 比 `¥0.02` 更值得用户信任。

## 常见陷阱

- **硬汇率换算**：selector 里写 `cost * 7.2` 把 USD 转 CNY 显示。汇率会变、模型会迁移到 CNY 原生计价，写死的 7.2 会过期成 6.8 / 8.0。如果非要换算，必须显式提示"按 X.X 汇率估算"，且这个汇率应该是注入的，不是 hardcoded。
- **多 provider 混算**：DeepSeek 是 USD、Kimi 也是 USD → 看起来安全；某天加个国内 provider 改 CNY → 全站统计悄无声息加总成"$10.50 = ¥10.50"。一致性校验必须在 selector 层就建立。
- **历史数据迁移**：把 model-config 从 USD 切到 CNY 时，过去已经写盘的 `llm_usage` 事件 cost 字段是 USD。重新计算会被双重换算；正确做法是**新事件用新单价，旧事件按事件内 currency 字段照常显示**——这正是 `llm_usage.payload.cost` 存完整 `LlmUsageCost`（含 currency）的意义所在，不只是为了好看。

## 自检问题

1. 如果未来仓库里同时跑着 USD 计价的 DeepSeek 和 CNY 计价的某国内 provider，header 用量胶囊会怎么显示？是否会偷偷加总？
2. 如果我在 selector 里写 `cost * 7.2` 把 USD 转成"近似 RMB"显示，未来 3 年后这个汇率过期会有什么后果？
3. 如果用户说"这里给我显示 token 用'K'而不是'千'"，这是事实问题还是表达问题？应该改哪一层？
