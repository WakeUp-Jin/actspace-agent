# `overflow: auto` 会吃掉子代 `position: absolute`——而且与你想的不是同一种"吃"

> 关联 history：[`docs/histories/2026-05/20260528-2053-usage-heatmap-tooltip-overflow-fix.md`](../../histories/2026-05/20260528-2053-usage-heatmap-tooltip-overflow-fix.md)

## 是什么

写一个热力图的悬浮 tooltip，cell 是 `position: relative`，tooltip 是 `position: absolute` + `bottom: calc(100% + 10px)`。看上去很标准。但一旦 cell 的父容器声明了 `overflow-x: auto`（哪怕只有 x 一轴），tooltip 越过容器边界的部分就会被**直接 clip**，无论 z-index 设多高。

直觉容易把它误判成"层级问题"——其实层级正确，是被父容器**裁切**掉的，根本没机会画出来。

## 反直觉的两个点

### 1. CSS 的 "implicit auto" 规则

CSS Overflow 规范有这么一条（[CSS Overflow Module Level 3 §3](https://drafts.csswg.org/css-overflow/#overflow-properties)）：

> If one of `overflow-x` or `overflow-y` is `visible` and the other is not, then the value of `visible` is changed to `auto`.

人话：**你写 `overflow-x: auto; overflow-y: visible`，浏览器实际算成 `overflow-x: auto; overflow-y: auto`**。两个方向都会裁。

后果：以为只是横向滚动（实际场景：列数多时让用户左右拖），但纵向上"想越界画出去的 absolute 子元素"也被裁掉了。

### 2. `position: absolute` 不能逃出 overflow 容器

`absolute` 子元素的 containing block 是**最近的 positioned 祖先**，但它的**绘制范围**还是被 overflow 父容器约束的——只要这个父容器在它的祖先链上有 `overflow != visible`，越界部分就会被 clip。

只有以下两种情况能逃：

- 把元素改成 `position: fixed`，containing block 变成 viewport（前提：祖先链上没有 `transform`/`filter`/`perspective`/`will-change: transform` 等会建立新 containing block 的属性）。
- 把元素 Portal 到 `document.body` 等没有 overflow 限制的节点。

## 怎么改

我们之前的版本：

```tsx
<div className="overflow-x-auto">           // ← 父容器，裁切元凶
  <div className="relative">                // ← cell
    <div className="absolute bottom-full"> // ← tooltip 越界被吃
      ...
    </div>
  </div>
</div>
```

修复后：

```tsx
function Cell() {
  const [hover, setHover] = useState(null);
  return (
    <>
      <div
        onMouseEnter={(e) => setHover(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setHover(null)}
      />
      {hover && <Tooltip anchorRect={hover} />}
    </>
  );
}

function Tooltip({ anchorRect }) {
  const style = {
    position: "fixed",                                       // 锚到 viewport
    left: anchorRect.left + anchorRect.width / 2,
    top: anchorRect.top - 10,
    transform: "translate(-50%, -100%)",
    zIndex: 50,
  };
  return <div style={style}>...</div>;
}
```

关键点：

- Tooltip 用 `position: fixed`，containing block 是 viewport，**不**继承 overflow 父级的 clip 范围。
- 锚点用 `getBoundingClientRect()` 拍快照——也是 viewport 坐标系，直接对齐。
- 渲染拓扑上把 tooltip 从 cell `<div>` 内挪到 grid 容器层（甚至更外层都行），让节点彻底跨过 overflow 容器边界。

## 核心要点

1. **`overflow-x: auto` ≠ 只裁 x**：CSS 隐式把另一轴也升级为 auto，是 spec 行为不是 bug。
2. **裁切先于层级生效**：被裁的内容根本没机会进入合成阶段，z-index 怎么调都没用。
3. **fixed 逃 clip 有前提**：父链不能有 `transform` / `filter` / `perspective` / `will-change: transform` 等"建立 containing block"的属性——任意一个出现，fixed 就会退化成相对那个祖先定位，重新被 overflow 限制。Tailwind 的 `transform`、`backdrop-blur`、`opacity` 都是常见坑。
4. **替代方案是 Portal**：当祖先链有 transform 之类必须保留的属性时，老老实实 Portal 到 `document.body`，最稳。

## 常见陷阱

- **以为问题是 z-index**：症状像被遮挡（半个 tooltip 可见、半个不见），自然先想 z-index。但你会发现把 z-index 调到 9999 也没用——这时该警觉是不是 clip。
- **以为 `overflow-y: visible` 就保住了 y 轴**：见上面 implicit auto。
- **想"那就把 overflow 提到更外层吧"**：可能引发新的横向溢出（panel 撑破）。更稳的是把弹层节点逃出去，而不是改父容器属性。
- **Tailwind 给整个卡片加 `backdrop-blur`/`transform`，然后用 fixed**：fixed 失效，回到 overflow 控制下。这种情况记得选 Portal。

## 自检

- 给你一个 `overflow-y: hidden; overflow-x: visible` 的容器，里面有 `position: absolute` 的悬浮气泡——横向越界会被裁吗？（答：会，implicit auto。）
- 父链上某个 ancestor 写了 `transform: translateZ(0)`（常用来 promote layer），里面的 `position: fixed` 弹层会按 viewport 定位吗？（答：不会，会以那个 ancestor 为 containing block，且依然受 overflow 限制。）
- 一个长 dropdown 在 `overflow-auto` 的表格行里被裁，你有几种解？（答：① fixed + 坐标快照 ② Portal ③ 把表格行的 overflow 上移到外层。前两种通用，第三种要看具体 DOM。）
