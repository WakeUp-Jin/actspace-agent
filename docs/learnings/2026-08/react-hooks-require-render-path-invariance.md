# React Hooks 要求所有渲染路径保持同一调用序列

## 问题本质

“不要在条件语句里调用 Hook”只是表面规则。React 真正依赖的是：同一个组件的每次渲染，都以相同顺序调用相同数量的 Hooks。

因此，下面这种代码即使 Hook 本身没有写进 `if`，仍然违反规则：

```tsx
function Workbench({ page }: { page: string }) {
  useEffect(() => loadShell(), []);

  if (page === "settings") {
    return <Settings />;
  }

  const files = useMemo(() => collectFiles(), []);
  const [revision, setRevision] = useState(0);
  return <Editor files={files} revision={revision} />;
}
```

首次渲染 Editor 时 React 记录了三个 Hooks。切到 Settings 后只执行第一个 Hook，React 就会报 `Rendered fewer hooks than expected`，页面可能直接落入错误边界或显示空白。

## 两种可靠修法

### 1. 所有 Hooks 之后再分支返回

适用于两个页面仍共享同一组件状态和生命周期：

```tsx
function Workbench({ page }: { page: string }) {
  useEffect(() => loadShell(), []);
  const files = useMemo(() => collectFiles(), []);
  const [revision, setRevision] = useState(0);

  if (page === "settings") {
    return <Settings />;
  }

  return <Editor files={files} revision={revision} />;
}
```

### 2. 把分支拆成子组件

当某些 Hooks 只属于 Editor 时，让父组件只做路由，Hooks 留在各自子组件：

```tsx
function Workbench({ page }: { page: string }) {
  return page === "settings" ? <Settings /> : <EditorWorkbench />;
}
```

这种方式通常更清晰，但会改变子组件卸载和状态保留语义，需要确认产品行为。

## 测试要点

静态渲染单个页面无法发现这个问题。回归测试必须在同一个 mounted component 上覆盖状态切换：

1. 渲染默认页面。
2. 交互切入条件分支页面。
3. 确认页面内容可见且没有 Hook 错误。
4. 再切回默认页面，确认原界面仍可用。

关键不是“Settings 能渲染”，而是“同一个组件实例能在两个分支之间往返”。

## 自检

- 组件中是否存在位于最后一个 Hook 之前的 `return`、`throw` 或条件短路？
- 页面切换测试是否复用了同一个组件实例，而不是分别 render 两个页面？
- 拆分子组件后，状态重置和副作用清理是否符合预期？

关联变更：`docs/histories/2026-07/20260731-2310-host-neutral-runtime-and-cli.md`
