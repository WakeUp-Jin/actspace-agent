# 让只在开发时用的代码真正离开生产包

一段代码只在 `import.meta.env.DEV` 下执行，不代表它不会被打进生产包。打包器先按 `import` 语句建出模块图，再做死代码删除：**静态 import 的模块一定在图里**，守卫只决定它运行不运行，不决定它在不在包里。

ActSpace 的轨迹视图就是这样。`TrajectoryView.tsx` 顶部静态导入了 fixture 模块，fixture 模块又静态导入了一个 70KB 的 JSON：

```ts
import { loadTrajectoryFixtureFromUrl } from '../trajectory/fixtures';

useEffect(() => {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
  const loaded = loadTrajectoryFixtureFromUrl(); // 生产环境永远走不到这里
  ...
}, []);
```

生产环境确实走不到这行，可 JSON 仍然进了主 chunk。构建产物里能 grep 到 fixture 的 session id，这就是证据。

## 正确的做法

把 import 移进守卫，改成动态 import：

```ts
useEffect(() => {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
  let cancelled = false;
  void import('../trajectory/fixtures').then(({ loadTrajectoryFixtureFromUrl }) => { ... });
  return () => { cancelled = true; };
}, []);
```

生产构建时，Vite 把 `import.meta.env.DEV` 替换成常量 `false`，守卫变成 `if (true) return;`，后面的代码在编译期就不可达。Rollup 删掉这段代码时，`import()` 也一起消失，所以连单独的懒加载 chunk 都不会生成。这次主 chunk 少了约 42KB，产物里再也搜不到 fixture。

要点：

1. **模块图看 import，不看运行时条件。** 想让模块离开生产包，它在生产路径上就不能有任何静态 import，包括经过 `index.ts` 的 `export *` 间接引入。这次除了组件本身，还要删掉 `trajectory/index.ts` 对 fixtures 的再导出。
2. **守卫必须是编译期常量。** `import.meta.env.DEV`、`MODE` 会被替换成字面量，打包器能据此删除分支。换成运行时变量（例如读 URL 参数），动态 import 仍会生成一个 chunk，只是不进主包。
3. **用构建产物验证，不要只看源码。** `grep -l "<只在 fixture 里出现的字符串>" dist/assets/*.js`，再加上改动前后的 chunk 大小，才能证明真的移出去了。

## 改成异步后的连带问题

同步代码改成动态 import，effect 就变成了异步。这会带来三个容易漏掉的问题：

- **卸载竞态**：import 返回前组件可能已经卸载，所以要用 `cancelled` 标志挡住之后的 `setState` 和 DOM 修改。
- **清理函数的归属**：原来 effect 直接 `return` 还原主题的函数，现在副作用发生在 promise 里，所以要把还原函数存到外层变量，由 effect 的 cleanup 调用。
- **多余的状态更新**：没有 fixture 时，原代码会同步 `setFixture(null)`，这次调用无害。改成异步后，它会在测试结束后才触发，React 报 `not wrapped in act(...)`。初始值本来就是 null，所以只在真的加载到 fixture 时才更新状态。

## 自检

1. 守卫写在被调用的函数内部，而 import 写在文件顶部，模块会进生产包吗？
2. 如果守卫换成 `if (new URLSearchParams(location.search).has('fixture'))`，产物会有什么不同？
3. 改成动态 import 后，测试中原本同步出现的内容会怎样？应该怎么等待？

来源：[Desktop 前端重构 10 冗余清理 T11](../../exec-runs/20261005-desktop-fe-10-redundancy-cleanup/execution-process.md)。
