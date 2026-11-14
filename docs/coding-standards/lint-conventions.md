# Lint 与格式化约定

仓库用 [Biome](https://biomejs.dev) 做通用 lint 和格式化；配置在根目录 `biome.jsonc`，每条偏离默认值的规则旁边都写了原因。仓库特有的约束（包边界、IPC 通道、设计 token、热路径读取等）仍由 `scripts/check-*.mjs` 负责，Biome 不替代它们。

## 命令

| 命令 | 做什么 | 什么时候跑 |
| --- | --- | --- |
| `pnpm lint` | 全库 lint，只输出并只在 error 级诊断上失败 | 提交前；CI 的 `lint-typecheck` 会跑 |
| `pnpm lint:report` | 按规则汇总所有 error / warning / info 的数量 | 想看存量债务，或清零某条规则准备升级为 error 时 |
| `pnpm exec biome lint --write <path>` | 应用安全自动修复；加 `--unsafe` 才会删未使用 import 之类 | 修自己改动的文件 |
| `pnpm format` | 全库格式化：写两遍，再检查一遍 | 提交前 |
| `pnpm format:check` | 只检查格式，不改文件 | CI 的 `lint-typecheck` 会跑 |

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

格式是强制的：双引号、分号、2 空格缩进、行宽 120。CI 的 `lint-typecheck` 跑 `pnpm format:check`，有文件不符合就失败；提交前跑 `pnpm format`。

**范围。** 和 lint 相同的四个目录下的 JS、TS（含 JSX）和 YAML。CSS、JSON、Markdown 不格式化；两个由脚本生成、检查时逐字节比较的文件除外，文件名和原因写在 `biome.jsonc`。

**为什么写两遍。** Biome 2.6.6 对两类写法一遍到不了稳定结果：返回类型里带多行对象类型的函数签名，和以多行参数结尾的成员调用链（`vi.fn().mockResolvedValue({ … })`）。第一遍的输出第二遍还会再改，只跑一遍 `biome format --write` 可能留下 CI 会报的文件。`pnpm format` 连写两遍再检查一遍，检查不过就失败。

**格式化会碰到的几样东西。** 它只改排版，但下面这些认的是「行」或「字节」：

- 只管下一行的注释指令（`// @ts-expect-error`、`// biome-ignore`、`// perf-allow`）。一条语句折成几行之后，指令要写在出错的那一行上面：对象字面量里出错的那个字段、JSX 里出错的那个标签，不要写在整条语句上面。没用上的 `@ts-expect-error` 由 `pnpm typecheck` 报出来。
- 读源码的检查脚本和测试。按语法或整份文本匹配，不要假设一条语句写在一行里。
- JSX 里紧挨着表达式或标签的行尾空格会被写成 `{" "}`，显示的文字不变。
- 按源码字节记摘要的生成文件。格式化改到它们覆盖的源码时要重新生成：`pnpm gen:contract-matrix`（Agent 契约矩阵）、`pnpm build:browser-locator`（Browser Bridge 定位运行时）。

**改格式化选项或升级 Biome。** 两者都会重排存量代码。重排单独放一个提交，整个提交只有 `pnpm format` 的输出，提交说明里写明怎么复现，再把这个提交的完整哈希记进根目录的 `.git-blame-ignore-revs`。

### `.git-blame-ignore-revs`

列出只改排版、或只做机械改名的提交，`git blame` 会跳过它们。GitHub 的 blame 页面自动读这个文件；本地每个克隆配置一次：

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

- 配置之后，检出还没有这个文件的旧提交时，`git blame` 会报 `could not open object name list`。这时先 `git config --unset blame.ignoreRevsFile`。
- 文件里只能写完整的 40 位哈希，缩写会让 `git blame` 直接报错。
- 哈希要留在 `main` 的历史里才有效，所以带这类提交的 PR 只能用 **Create a merge commit** 合并；squash 或 rebase 会换掉哈希。git 对历史里没有的哈希不报错，只是不再跳过那个提交。

`pnpm check:blame-ignore-revs` 查这个文件：每个哈希都是完整的 40 位、不重复、上一行有注释、是当前分支历史里的提交。它在 `scripts/ci.sh` 的仓库卫生检查里；CI 的 `repository-checks` 另外带 `--require-history` 再跑一遍。浅克隆里看不到历史，最后一项默认跳过，并在输出里说明。检查报「不在当前分支的历史里」时，把那一行改成新的哈希，或者删掉。

### 格式化提交之前拉出去的分支

直接合并 `main`，自己改过、又被重排的地方会冲突，要手工在两种排版之间取舍。按下面的顺序做，格式化这一步不产生冲突。命令里的哈希是 2026-11-14 那次全量格式化的：`1d68d3e8` 是格式化前的最后一个提交，`d26331ad` 是只含格式化的那个提交。

```bash
git fetch origin
# 1. 合并格式化前的最后一个提交。这里出现的冲突是内容冲突，照常解决。
git merge 1d68d3e8
pnpm install
# 2. 把自己分支上的代码也格式化。这时还没有新的 pnpm format，直接调 Biome，写两遍。
pnpm exec biome format --write . && pnpm exec biome format --write .
git commit -am "按 Biome 配置格式化"
# 3. 合并格式化提交，整个保留自己这边。
git merge-base --is-ancestor 1d68d3e8 HEAD && git merge -s ours d26331ad
# 4. 合并其余的提交。
git merge origin/main
pnpm format:check
```

第 3 步用 `-s ours`：前两步做完，自己这边已经是格式化之后的样子。`-s ours` 会丢掉对方的全部内容，所以只能用在只含格式化的那一个提交上，而且必须先合并过它的上一个提交；命令的前半句检查的就是这一点。
