# 常量守卫之外：顶层调用也会把模块留在包里

[让只在开发时用的代码真正离开生产包](20261006-dev-only-code-out-of-bundle.md) 讲的是：守卫要写成编译期常量，打包器才能删掉对应的分支。这次做 Space 演示时发现，光有常量守卫还不够。所有入口都包在 `SPACE_DEMO_ENABLED`（等于 `import.meta.env.DEV`）后面了，演示代码却还是留在了生产包里，前后分三层才清干净。

## 现象

生产构建后，演示用的 fixture 文字仍然出现在主 chunk 里：

```sh
grep -l "支付链路提速" dist/assets/*.js   # 命中 index-*.js
```

## 第一层：hook 不能藏在守卫后面

`WorkbenchLayout` 无条件调用了 Space store 的 hook：

```ts
const spacePanelOpen = useSpaceDemoSelector((s) => s.panelOpen);
```

hook 必须每次渲染都调用，没法写成 `if (DEV) useX()`。解决办法是在模块层面二选一，选出两套实现中的一套：

```ts
export const useSpacePanelBinding = SPACE_DEMO_ENABLED ? useLiveSpacePanelBinding : useDisabledSpacePanelBinding;
```

生产构建时这一行变成 `false ? A : B`，压缩器只保留 `B`。`A` 没有引用了，它导入的 store 就有机会被删掉。

## 第二层：顶层调用默认被当成有副作用

做完第一层，主包小了约 60KB，但 fixtures 还在，因为 store 文件末尾有一行：

```ts
export const spaceDemoStore = createSpaceDemoStore();
```

即使没人用 `spaceDemoStore`，打包器也不敢删这行。它不知道 `createSpaceDemoStore()` 会不会改全局变量、注册监听或者发请求，删掉可能改变程序行为，所以只能保守地保留。这一行留下了，它闭包里用到的 fixtures 也跟着留下。

解决办法是明确告诉打包器「这次调用没有副作用」：

```ts
export const spaceDemoStore = /* @__PURE__ */ createSpaceDemoStore();
```

Rollup、esbuild、terser 都认这个注释：结果没人用，这次调用就可以整行删掉。

## 第三层：`memo()`、`forwardRef()` 也是顶层调用

fixtures 清掉以后，包里还剩头像组件和 5 张图片。往回追，是一个列表行组件：

```ts
const ActorRow = memo(function ActorRow(props) { ... });
```

`memo(...)` 同样是顶层函数调用，打包器同样不知道它有没有副作用。`ActorRow` 留下了，它渲染的 `ActorAvatar` 留下了，头像模块里 `import ball from "./ball.png"` 生成的图片 URL 也留下了。改法一样：

```ts
const ActorRow = /* @__PURE__ */ memo(function ActorRow(props) { ... });
```

三层改完，主包从 1913KB 降到 1833KB，产物里再也搜不到演示相关的字符串。

## 要点

1. **删掉一个模块，要满足两个条件**：没人引用它的导出，它的顶层代码也没有（被认为有）副作用。常量守卫只解决了第一个条件。
2. **顶层的函数调用默认按有副作用处理**，常见的有 `createStore()`、`memo()`、`forwardRef()`、`createContext()`、`styled.div\`\``。确定它们没有副作用，就加 `/* @__PURE__ */`。
3. **hook 不能条件调用**，所以要在模块层面用常量二选一，挑一个 hook 实现，不要在组件里写分支。
4. **从残留往回追。** 在产物里找到残留的字符串，读它周围压缩后的代码，找出是哪个函数引用了它，一层层追到根上的那个顶层调用。
5. **静态资源可能不跟着走。** JS 里已经没有引用了，Vite 仍可能把被 import 过的图片输出到 `dist/assets/`。这些文件不会被加载，但占包体积。真想不输出，就要让这些图片的 import 只出现在动态 import 的模块里。

## 自检

1. `export const store = createStore();` 这个导出没人用，为什么它依赖的 fixtures 还会进包？
2. 如果给一个真的有副作用的调用（比如往 `window` 上注册监听）加了 `/* @__PURE__ */`，生产环境会出什么问题？
3. 组件里写 `if (!DEV) return null;` 之后再调用 hook，有什么问题？应该怎样改？

来源：[多智能体协作前端演示 T11](../../exec-runs/20261007-multi-agent-collab-frontend-demo/execution-process.md)。
