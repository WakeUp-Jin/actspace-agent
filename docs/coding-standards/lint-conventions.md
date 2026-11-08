# Lint 与格式化约定

仓库用 [Biome](https://biomejs.dev) 做通用 lint；配置在根目录 `biome.jsonc`，每条偏离默认值的规则旁边都写了原因。仓库特有的约束（包边界、IPC 通道、设计 token、热路径读取等）仍由 `scripts/check-*.mjs` 负责，Biome 不替代它们。

## 命令

| 命令 | 做什么 | 什么时候跑 |
|---|---|---|
| `pnpm lint` | 全库 lint，只输出并只在 error 级诊断上失败 | 提交前；CI `workspace-checks` 会跑 |
| `pnpm lint:report` | 按规则汇总所有 error / warning / info 的数量 | 想看存量债务，或清零某条规则准备升级为 error 时 |
| `pnpm exec biome lint --write <path>` | 应用安全自动修复；加 `--unsafe` 才会删未使用 import 之类 | 修自己改动的文件 |
| `pnpm format` | 只格式化相对 `main` 改过的文件 | 可选；格式化不进 CI |

Biome 读取 `.gitignore`，`dist/`、`node_modules/` 等不会被扫描。检查范围只有 `apps/`、`packages/`、`scripts/`、`browser-bridge/`；`docs/` 下的 demo、`test-fixtures/`、`.html` 和 `.astro` 不在范围内（Biome 看不到 Astro 模板里的引用，会误报未使用 import）。

## 规则分层

- **error（阻塞 CI）**：Biome `recommended` 预设里剩下的规则，加上 `noUnusedImports`。
- **warn（可见但不阻塞）**：存量命中多、修复会改行为或需要逐处判断的规则——`useExhaustiveDependencies`、`noExplicitAny`、`noNonNullAssertion`、`noUnusedVariables`、`useIterableCallbackReturn`、`noAssignInExpressions`、`noArrayIndexKey`，以及 nursery 的 `noFloatingPromises`。新代码不要再增加这些 warning；某条规则清零后把它升为 error。
- **off**：与仓库惯用写法冲突或误报的规则，原因写在 `biome.jsonc` 里（a11y 整组、`noVoidTypeReturn`、`useHookAtTopLevel`、`noControlCharactersInRegex`、`noImplicitAnyLet`、`noExportsInTest`）。测试文件额外关闭 `noComponentHookFactories` 和 `useYield`。
- CSS 不由 Biome 检查，由 `check:frontend-tokens` / `check:frontend-theme` 负责。

## 抑制单处告警

确有理由时用带原因的行内注释，不要为单个位置改配置：

```ts
// biome-ignore lint/security/noDangerouslySetInnerHtml: html 来自 highlight.js，自带转义
dangerouslySetInnerHTML={{ __html: html }}
```

## 格式化

`biome.jsonc` 里格式化已配置（双引号、分号、2 空格、行宽 120），但**不强制**：存量代码大量单行超 200 字符，全库格式化会制造巨大 diff。`pnpm format` 只处理相对 `main` 改过的文件；对一个只改了几行的大文件运行它会重排整个文件，是否这么做自行判断。不要为了格式化单独提交全库改动。
