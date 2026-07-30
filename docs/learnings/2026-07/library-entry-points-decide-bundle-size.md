# 库的入口选择决定 bundle 体积，tree-shaking 救不了你

关联 history：`docs/histories/2026-07/20260730-1200-right-panel-file-view-optimization.md`

## 是什么

很多库同时提供两种入口：一个「开箱即用」的默认入口（内部把所有子模块都 import 了一遍，再注册到一个单例上），和一个「自己装」的 core 入口（只有引擎，语法 / 插件 / locale 要自己注册）。

```ts
// 入口 A：一行能用，代价是 192 种语法全进 bundle
import hljs from "highlight.js";

// 入口 B：多写 40 行 import，只有你注册的进 bundle
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
hljs.registerLanguage("typescript", typescript);
```

同一个库、同样的调用代码，这两行的差别在本项目里是 **874 kB**（renderer chunk 1,991 kB → 1,117 kB，gzip -44%）。

## 为什么 tree-shaking 不管用

这类库的默认入口大致长这样：

```js
import hljs from "./core.js";
import brainfuck from "./languages/brainfuck.js";
import vhdl from "./languages/vhdl.js";
// ... 190 行
hljs.registerLanguage("brainfuck", brainfuck);
hljs.registerLanguage("vhdl", vhdl);
export default hljs;
```

`registerLanguage(...)` 是**副作用调用**：它把模块塞进了单例内部的一张表。打包器只能证明「这个 import 的绑定没被引用」时才敢删，而这里每个 import 都被真实调用了一次。从静态分析角度看，删掉 `brainfuck` 就等于改变程序行为 —— 打包器不知道你运行时永远不会 `highlight(code, "brainfuck")`。

**可迁移的判断规则**：如果一个模块的价值是通过「被 import 后执行注册」体现的，那它对 tree-shaking 免疫。同样的结构出现在 `moment` 的 locale、`date-fns` 的旧入口、图标库的 barrel `index.ts`、`monaco` 的语言贡献点、`prismjs` 的 `components`。看到「引入即注册」，就该去找 core 入口。

## 怎么验证真的瘦下来了

不要只看总体积（它会被别的改动掩盖）。**去产物里搜一个你确定用不到的名字**：

```sh
pnpm build
rg -c 'brainfuck|vhdl|erlang' packages/desktop/dist/assets/*.js   # 期望 0
```

这条 grep 比体积数字更能说明问题：它直接回答「那 176 种语法还在不在」。把它写进执行计划的验证方式，下次有人手滑改回默认入口，一眼就能发现。

## 陷阱：换了入口不等于依赖不再被打进来

本轮还给 Markdown 的 `rehype-highlight` 传了同一份语言表，想顺手也瘦一点。结果体积没变 —— `rehype-highlight` 内部**无条件静态 import 了 `lowlight/common`**：

```js
import { common, createLowlight } from "lowlight";
```

你传的 `languages` 只是**替换**它注册进 lowlight 实例的那一份，`common` 那三十几种语法照样在 import 图里。产物里仍然能搜到 `objectivec` / `vbnet` 就是证据。

教训有两条：

1. **配置项影响的是运行时行为，不是打包图。** 只有改 import 才可能影响体积。
2. **传 `languages` 是替换而不是追加。** 这类「传了就完全接管默认值」的语义很常见（`plugins`、`transformers`、`presets` 都爱这么设计），配置文档不明说时要去读实现。本轮因此丢掉了 `common` 独有的 arduino / objectivec / vbnet 等，是明知代价后的取舍，不是意外。

顺带一个依赖边界的小坑：本来想取「自己那份 + common」的并集来兼得两者，但那要求直接 `import { common } from "lowlight"`，而 `lowlight` 只是 `rehype-highlight` 的传递依赖 —— 没写进 `package.json` 就用，属于 **phantom dependency**，哪天上游换实现或提版本，构建会毫无预兆地断。为一点边角覆盖引入这个风险不值。

## 核心要点

- 默认入口的便利是用体积换的；副作用注册让 tree-shaking 无从下手。
- 判断特征：模块「被 import 就注册自己」→ 一定摇不掉 → 找 core 入口。
- 用「grep 产物里一个确定用不到的符号」来验证，比看总体积可靠。
- 配置项不影响 import 图；想减体积只能改 import。
- 只在 `package.json` 里声明过的包才能直接 import，传递依赖不算。

## 自检问题

1. 为什么打包器不敢删掉那个从没被 `highlight()` 用到的语法模块？
2. 给 `rehype-highlight` 传 `languages` 之后，产物里为什么还能搜到 objectivec？
3. 如果只看构建输出的总 kB 数，可能会漏判哪种情况？
