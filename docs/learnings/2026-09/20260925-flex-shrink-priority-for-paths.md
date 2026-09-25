# 路径截断：flex-shrink 不是优先级

> 来源：`docs/histories/2026-09/20260925-1946-approval-card-redesign.md`（审批条在 480px 窄窗口里，文件名被截成 `beta.t…`）。

## 想要的效果

一行里放 `目录/文件名`，空间不够时先截目录，文件名尽量完整；只有文件名自己都放不下时，才截文件名。

## 直觉写法为什么不行

```html
<span class="flex min-w-0">
  <span class="min-w-0 truncate shrink-[100]">/private/tmp/…/scope/</span>
  <span class="min-w-0 truncate">beta.txt</span>
</span>
```

直觉是“目录的 shrink 是 100，文件名是 1，所以目录先缩”。但 flex 并不是按顺序缩，而是**按比例分摊**：每一项分到的收缩量 ≈ 缺口 × (shrink × 基础宽度) / Σ(shrink × 基础宽度)。文件名哪怕只分到 1%，也会少零点几像素。`text-overflow: ellipsis` 对这点差距毫不宽容：内容 63px、盒子 62.4px，就会出现 `…`。

实测：目录 164px → 102px，文件名 63px → 62.4px，结果是 `beta.t…`。

## 正确写法

让文件名**不参与**收缩，再用 `max-width: 100%` 兜底：

```html
<span class="flex min-w-0">
  <span class="min-w-0 truncate">/private/tmp/…/scope/</span>
  <span class="max-w-full shrink-0 truncate">beta.txt</span>
</span>
```

- 缺口全部由目录承担，目录可以缩到 0。
- 文件名比整个容器还长时，`max-w-full` 把它限制在容器宽度内，`truncate` 再给省略号。

## 核心要点

- `flex-shrink` 是比例权重，不是先后顺序；想要“先缩 A 再缩 B”，就让 B 的 shrink 为 0。
- 省略号在亚像素级的缺口下也会出现，所以“只让它分到一点点”等于“一定会截”。
- `shrink-0` 的项要配一个上限（`max-width`），否则极端内容会撑破容器。
- 这类问题要在真实宽度下测量（`getBoundingClientRect` 对比 `scrollWidth`），光看代码很难看出来。

## 自检问题

1. 三个可收缩项，想按 A → B → C 的顺序依次截断，只用 flex 能做到吗？需要什么额外手段？
2. 为什么 `min-width: 0` 对 flex 项的截断是必需的？
