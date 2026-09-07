# Applications

`apps/` 只放可直接运行、打包或部署的产品入口：

- `desktop/`：Electron Desktop Host，package identity 为 `@actspace/desktop`。
- `cli/`：CLI Host，package identity 为 `@actspace/agent-cli`。
- `site/`：Astro 静态官网，package identity 为 `@actspace/site`。

可复用的 Runtime、领域能力、Plugin ABI package 和共享契约继续放在 `packages/`。应用只能通过 package exports 消费这些能力，不能相对读取 sibling package 的 `src/`。
