# Lint 与格式化约定

仓库用 [Biome](https://biomejs.dev) 做通用 lint；配置在根目录 `biome.jsonc`，每条偏离默认值的规则旁边都写了原因。仓库特有的约束（包边界、IPC 通道、设计 token、热路径读取等）仍由 `scripts/check-*.mjs` 负责，Biome 不替代它们。

## 命令

| 命令 | 做什么 | 什么时候跑 |
| --- | --- | --- |
| `pnpm lint` | 全库 lint，只输出并只在 error 级诊断上失败 | 提交前；CI `workspace-checks` 会跑 |
| `pnpm lint:report` | 按规则汇总所有 error / warning / info 的数量 | 想看存量债务，或清零某条规则准备升级为 error 时 |
| `pnpm exec biome lint --write <path>` | 应用安全自动修复；加 `--unsafe` 才会删未使用 import 之类 | 修自己改动的文件 |
| `pnpm format` | 只格式化相对 `main` 改过的文件 | 可选；格式化不进 CI |

Biome 读取 `.gitignore`，`dist/`、`node_modules/` 等不会被扫描。检查范围只有 `apps/`、`packages/`、`scripts/`、`browser-bridge/`；`docs/` 下的 demo、`test-fixtures/`、`.html` 和 `.astro` 不在范围内（Biome 看不到 Astro 模板里的引用，会误报未使用 import）。

## 规则分层

- **error（阻塞 CI）**：Biome `recommended` 预设里剩下的规则，加上 `noUnusedImports`、`noUnusedVariables`、`noExplicitAny`（产品代码用 `unknown` 再收窄；测试文件通过 overrides 关闭，mock 和拦截到的请求体可以写 `any`）、`useIterableCallbackReturn`（`forEach` 回调写块语句 `x => { f(x); }`，表达式体会被当成「返回了值」；这样 `map` / `filter` 漏 `return` 才能被抓到）、`useExhaustiveDependencies`（只追漏依赖，`reportUnnecessaryDependencies` 关掉：`useEffect(fn, [refreshKey])` 这类「把 key / revision 当触发器」是有意写法。回调是「事件」而不是依赖时，用 `const ref = useRef(cb); ref.current = cb;` 在 effect 里读最新值，别加 `biome-ignore`；只依赖对象某个字段时，先把字段取成变量再进依赖数组），以及 nursery 的 `noFloatingPromises`（故意不等待的 Promise 写 `void promise`，并保证内部已处理 rejection；它的类型推断不完整，没报不代表没问题）。预设里的 `useImportType`、`useOptionalChain` 已清零，保持预设默认级别。a11y 组 2026-11-10 起按 `recommended` 打开，零命中的规则（`useButtonType`、`useAltText`、`useValidAriaProps`、`useValidAriaRole`、`noPositiveTabindex`、`noRedundantRoles`、`useHeadingContent`、`useAnchorContent` 等）直接是 error：原生 `<button>` 必须写 `type`，`<img>` 必须有 `alt`，aria 属性名和取值要合法。
- **warn（可见但不阻塞）**：存量命中少、但每处都要看上下文才能决定是改标记还是改交互的规则，`pnpm lint:report` 可看，新代码不要再增加，清零后升为 error。目前是 a11y 的 8 条（2026-11-10 共 22 处）：`useKeyWithClickEvents`（6，`div` 上的 `onClick` 要配键盘事件或换成按钮）、`useKeyWithMouseEvents`（1）、`noAriaHiddenOnFocusable`（3）、`useAriaPropsForRole`（1，`role="separator"` 缺 `aria-valuenow` 等）、`useValidAnchor`（1）、`noLabelWithoutControl`（1）、`noNoninteractiveElementToInteractiveRole`（1）、`noSvgWithoutTitle`（8，命中的是 `assets/` 下装饰性品牌 svg 和 `aria-hidden` 占位图，规则不认 `aria-hidden`，暂留）。预设自带的 warning / info 级小规则还有存量（`noUnusedFunctionParameters`、`noBannedTypes`、`useTemplate`、`useLiteralKeys` 等），同样新代码不要再增加。
- **off**：与仓库惯用写法冲突或误报的规则，原因写在 `biome.jsonc` 里。a11y 组里关掉的是两类：`noAutofocus`（对话框和行内编辑态打开时把焦点放到第一个输入是组件规范要求的行为）；以及 `useSemanticElements`（44）、`useAriaPropsSupportedByRole`（39）、`noStaticElementInteractions`（30）、`noNoninteractiveElementInteractions`（30）、`noNoninteractiveTabindex`（11）、`useFocusableInteractive`（11）这六条存量几十处、修法等于重做交互语义（`div` 换 `button`、补 `tabIndex` 与键盘事件）的规则，留给桌面端 a11y 专题整体处理。其余 off 的是 `noVoidTypeReturn`、`useHookAtTopLevel`、`noControlCharactersInRegex`、`noImplicitAnyLet`、`noExportsInTest`、`noConfusingVoidType`、`noAssignInExpressions`、`noArrayIndexKey`、`noNonNullAssertion`）。后四条是 2026-11-09 清理时逐处核对后关掉的：`Handlers | void` 回调返回类型、`x ??= init` / `return this.#closing = …` 惰性初始化与记忆化、diff 行 / token 这类无身份派生列表用 index 做 key，全部是有意写法，改写只会变长或更差；`!` 则是先用 tsc 把所有「删掉也不报错」的断言删光，剩下的每一处都在表达 tsc 看不见的不变量（`if (map.has(k)) map.get(k)!`、`length > 0 ? arr.shift()!`、闭包里已赋值的局部变量），改成 `?.` 或抛错是改行为。测试文件额外关闭 `noComponentHookFactories`、`useYield` 和 `noExplicitAny`。
- **非空断言 `!` 的写法约束**（规则关了，靠约定守）：仓库没开 `noUncheckedIndexedAccess`，`arr[i]!`、`obj[key]!`、`match[1]!` 这类索引访问不需要 `!`，不要写；`!` 只用于 tsc 看不见的不变量，并且该不变量要在同一个函数里能看出来（前面的 `has()` / `length` 判断、同一闭包里的赋值）。看不出来的，用收窄或抛错代替。
- CSS 不由 Biome 检查，由 `check:frontend-tokens` / `check:frontend-theme` 负责。

## 抑制单处告警

确有理由时用带原因的行内注释，不要为单个位置改配置：

```ts
// biome-ignore lint/security/noDangerouslySetInnerHtml: html 来自 highlight.js，自带转义
dangerouslySetInnerHTML={{ __html: html }}
```

## 格式化

`biome.jsonc` 里格式化已配置（双引号、分号、2 空格、行宽 120），但**不强制**：存量代码大量单行超 200 字符，全库格式化会制造巨大 diff。`pnpm format` 只处理相对 `main` 改过的文件；对一个只改了几行的大文件运行它会重排整个文件，是否这么做自行判断。不要为了格式化单独提交全库改动。
