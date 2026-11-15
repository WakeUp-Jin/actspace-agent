# 什么会让代码留在生产包：静态 import、顶层调用、引入即注册

合并自三篇：让只在开发时用的代码真正离开生产包、常量守卫之外顶层调用也会把模块留在包里、库的入口选择决定 bundle 体积 tree-shaking 救不了你。

来源：[Desktop 前端重构 10 冗余清理 T11](../../histories/2026-10/20261006-0005-desktop-fe-10-redundancy-cleanup.md)、[多智能体协作前端演示 T11](../../histories/2026-10/20261007-1423-multi-agent-collab-frontend-demo.md)、`docs/histories/2026-07/20260730-1200-right-panel-file-view-optimization.md`

打包器先按 `import` 建模块图，再做死代码删除。一个模块要离开生产包，需同时满足：**没人引用它的导出，且它的顶层代码没有（被认为有）副作用**。下面三层分别对应三种“删不掉”的原因。

## 1. 静态 import 一定在图里，守卫只决定运行不运行

`TrajectoryView.tsx` 顶部静态导入 fixture 模块，fixture 又静态导入 70KB 的 JSON；`useEffect` 里 `if (!import.meta.env.DEV ...) return` 生产永远走不到，JSON 仍进了主 chunk（grep 产物能搜到 fixture 的 session id）。做法：把 import 移进守卫，改动态 `import('../trajectory/fixtures')`；生产构建时 `import.meta.env.DEV` 被替换成 `false`，守卫变成 `if (true) return;`，`import()` 一起消失，连懒加载 chunk 都不生成（主 chunk 少约 42KB）。

- 生产路径上不能有任何静态 import，含经 `index.ts` 的 `export *` 间接引入（本次还要删掉 `trajectory/index.ts` 对 fixtures 的再导出）。
- 守卫必须是编译期常量；换成运行时变量（读 URL 参数）动态 import 仍会生成一个 chunk，只是不进主包。
- 改成异步的连带问题：卸载竞态（用 `cancelled` 标志挡住之后的 `setState`/DOM 修改）；清理函数归属（还原主题的函数存到外层变量由 cleanup 调用）；多余状态更新（原来同步 `setFixture(null)` 无害，异步后在测试结束后触发会报 `not wrapped in act(...)`，初始值本就是 null，只在真加载到 fixture 时才更新）。

## 2. 常量守卫之外：顶层调用默认被当成有副作用

Space 演示所有入口都包在 `SPACE_DEMO_ENABLED`（= `import.meta.env.DEV`）后面，生产包里仍有 fixture 文字（`grep -l "支付链路提速" dist/assets/*.js` 命中主 chunk）。分三层清掉：

1. **hook 不能藏在守卫后面**：hook 每次渲染都要调用，不能 `if (DEV) useX()`。在模块层面二选一：`export const useSpacePanelBinding = SPACE_DEMO_ENABLED ? useLiveSpacePanelBinding : useDisabledSpacePanelBinding;`，生产构建变成 `false ? A : B`，压缩器只留 B，A 导入的 store 才有机会被删。
2. **顶层调用**：store 文件末尾 `export const spaceDemoStore = createSpaceDemoStore();` 即使没人用，打包器也不敢删（不知道会不会改全局变量、注册监听、发请求），闭包里的 fixtures 跟着留下。加 `/* @__PURE__ */`，Rollup/esbuild/terser 都认。
3. **`memo()`、`forwardRef()` 也是顶层调用**：`ActorRow = memo(...)` 留下，渲染的 `ActorAvatar` 和头像模块里 `import ball from "./ball.png"` 生成的图片 URL 也留下，改成 `/* @__PURE__ */ memo(...)`。常见的还有 `createStore()`、`createContext()`、`styled.div\`\``。

三层改完主包 1913KB → 1833KB。从残留往回追：在产物里找到残留字符串，读周围压缩后的代码，找出引用它的函数，一层层追到根上的顶层调用。静态资源可能不跟着走：JS 已无引用，Vite 仍可能把被 import 过的图片输出到 `dist/assets/`（不加载但占包），真想不输出就让这些 import 只出现在动态 import 的模块里。给真有副作用的调用（如往 `window` 注册监听）误加 `@__PURE__` 会让生产环境丢行为。

## 3. “引入即注册”对 tree-shaking 免疫：选 core 入口

很多库有两种入口：默认入口（内部 import 全部子模块并注册到单例）和 core 入口（只有引擎，语法/插件/locale 自己注册）：

```ts
import hljs from "highlight.js";                         // 一行能用，192 种语法全进包
import hljs from "highlight.js/lib/core";                // 多写 40 行，只有注册的进包
hljs.registerLanguage("typescript", typescript);
```

同样的调用代码，差别在本项目是 874 kB（renderer chunk 1,991 → 1,117 kB，gzip -44%）。原因：默认入口里每个 import 都被 `registerLanguage(...)` 这个副作用调用真实使用了一次，打包器不知道运行时永远不会高亮 `brainfuck`。判断规则：模块价值通过“被 import 后执行注册”体现，就摇不掉（`moment` locale、`date-fns` 旧入口、图标库 barrel、`monaco` 语言贡献点、`prismjs` components 同构）；看到“引入即注册”就去找 core 入口。

- **验证**：别只看总体积，在产物里搜一个确定用不到的名字，`rg -c 'brainfuck|vhdl|erlang' apps/desktop/dist/assets/*.js` 期望 0，并写进执行计划的验证方式。
- **换入口不等于依赖不再被打进来**：给 `rehype-highlight` 传同一份语言表，体积没变——它内部无条件静态 import 了 `lowlight/common`，传的 `languages` 只是替换注册进实例的那份，产物里仍能搜到 `objectivec`/`vbnet`。配置项影响运行时行为不影响打包图，想减体积只能改 import；“传了就完全接管默认值”（`plugins`/`transformers`/`presets`）文档不明说时读实现。
- 想取“自己那份 + common”并集需直接 `import { common } from "lowlight"`，而它只是 `rehype-highlight` 的传递依赖，没写进 `package.json` 就用是 phantom dependency，上游换实现构建会无预兆断掉，得不偿失。

## 自检

1. 守卫写在被调用函数内部、import 写在文件顶部，模块会进生产包吗（会）？守卫换成运行时变量会怎样？
2. `export const store = createStore();` 没人用，为什么它依赖的 fixtures 还会进包？组件里 `if (!DEV) return null;` 之后再调 hook 有什么问题？
3. 给 `rehype-highlight` 传 `languages` 后，产物里为什么还能搜到 objectivec？只看总 kB 会漏判哪种情况？
