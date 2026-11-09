# Harness 条目要的 Host 数据走 Host port，不走 import

把一段「只有 Host 知道」的数据（插件目录、组合结果、全局配置）交给默认 Harness 里的一个条目时，第一反应往往是在那个条目文件里 `import` 对应模块。这在 `tsc`、单测里都没问题，却会在默认 Harness 打包时被 `scripts/build-default-harness.mjs` 的外部 import 白名单拒绝，错误只在装配测试或启动时以 `Unapproved external import <包名> in <条目>.js` 出现。结论：Harness 条目需要的 Host 数据一律由 Host 算好、放进它已经注入的 Host port（如 `actspace.host.agent`），条目只读端口字段。

关联：`docs/histories/2026-11/20261109-1400-harness-plugin-decoupling-p1.md`、`docs/exec-plans/active/20261109-harness-plugin-decoupling.md`。

## 为什么会这样

默认 Harness 不是普通的包依赖：`packages/core/runtime/src/harness/*.ts` 里标为会话插件的条目会被打成一组固定 ESM 文件，运行时在隔离的 Cordis 树里加载。打包脚本只允许条目 import 一小撮已批准的外部包，目的就是让 Harness 的依赖面可审计、可被自进化替换。条目一旦 import 了 Host 侧模块（例子是 `main-agent-form.ts` → `plugin-catalog.ts` → 全部插件 manifest），整个 Host 依赖图都被拖进 bundle，白名单检查会在第一个未批准的包上失败。

失败的位置离根因很远：`tsc --noEmit` 过，`vitest` 跑源码也过，只有走到 `prepareDefaultHarnessArtifact` 的测试或真实启动才报错，而且报的是依赖链末端的包名（这次是 `@actspace/session-journal/manifest`），不是你新加的那行 import。

## 稳定的做法

1. 先问「这份数据属于谁」。插件目录、组合摘要、Host 能力上限都属于 Host；Harness 条目只是消费者。
2. 在 `AgentRuntimeHostPort`（或条目已经注入的别的 Host port）上加一个字段，由 Host 在 `startup/boot.ts` 填好。本次加的是 `agentForm: AgentForm`，值是 `MAIN_AGENT_FORM`。
3. 条目里只读端口：`host.agentForm`，缺失时直接抛错（fail closed），不要在 Harness 里补一个默认值把 Host 的职责接过来。
4. 测试里直接提供 `actspace.host.agent` 的用例（`default-harness.test.ts`、`evolution.test.ts`）要跟着补字段；走 `boot.ts` 的用例不用改。

## 自检

- 在 `packages/core/runtime/src/harness/` 下新增 import 后，跑一次 `pnpm --filter @actspace/runtime build`，再跑 `pnpm --filter @actspace/runtime test`；只跑源码测试看不出问题。
- `rg "from \"\.\./" packages/core/runtime/src/harness/*-plugin.ts`：条目向上引用 `../` 的模块时，逐个确认那条链没有把 Host 侧模块拖进来。
