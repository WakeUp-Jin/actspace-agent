# 应用与可复用包的 Workspace 边界

在 monorepo 中，`apps/` 与 `packages/` 的区别不应只是目录命名。一个可执行入口即使拥有 `package.json`，也不等于它应该作为可复用 package 留在 `packages/`；反过来，把目录移动到 `apps/` 也不会自动建立可靠的架构边界。

## 1. 先按部署身份分类，而不是按技术栈分类

Desktop、CLI、Site 使用 Electron、Node.js、Astro 等不同技术，但它们有同一个属性：都可以被直接运行、打包或部署。因此它们属于应用入口。

Runtime、Session、LLM、Tools 和共享契约的共同属性则是被其他单元消费，不能独立代表一个产品部署入口。因此它们属于可复用 package。

这个分类比“前端放 apps、后端放 packages”更稳定，因为 CLI 和 Electron main 都可能是后端代码，静态站点也可能读取仓库文档；真正决定目录的是部署身份和依赖方向。

## 2. 迁移目录时保持 package identity 稳定

物理路径和 package identity 是两件事。把 `packages/agent-cli` 移到 `apps/cli` 时，可以继续保留 `@actspace/agent-cli`：

- workspace consumer 不需要更换依赖名；
- managed packaging 和命令名不需要变化；
- Session、配置和诊断里已有的逻辑身份不会因目录整理而漂移；
- diff 更容易聚焦在物理边界，而不是混入产品重命名。

目录迁移如果同时修改 package name、命令、配置键和行为，就很难判断故障来自架构调整还是产品契约变化。

## 3. 单靠 workspace glob 不能形成边界

`pnpm-workspace.yaml` 同时发现 `apps/*` 和 `packages/**`，只说明它们都参与依赖解析。还需要机器可检查的不变量：

1. 应用必须是 private workspace package，避免误发布；
2. `packages/` 不得依赖任何应用；
3. 应用不得依赖 sibling 应用；
4. 所有跨单元消费都通过 package exports，禁止读取 sibling `src/`；
5. 构建、测试和发布脚本必须从 workspace identity 或新物理路径解析入口。

这样才能保证依赖方向始终是：

```text
apps -> reusable packages
```

而不会在迁移后悄悄形成 `package -> app` 或 `app -> app/src`。

## 4. 文本替换抓不到分段构造的路径

迁移最容易遗漏的不是显式字符串，而是这样的代码：

```js
join(repoRoot, "packages", "agent-cli", "dist", "cli.js")
```

搜索 `packages/agent-cli` 不会命中它。可靠验证需要同时覆盖：

- 搜索旧完整路径和关键路径片段；
- 检查 tsconfig、Vite、Vitest、CI working-directory 和打包脚本；
- 执行真正启动入口的 process smoke；
- 从无历史产物的隔离快照重新 install、typecheck、build、test；
- 扫描最终产物中的 retired path 和 deep import。

真实进程测试的价值在这里尤其明显：它验证的是最终被执行的入口，而不是配置文件看起来是否合理。

## 5. Site 迁移要检查仓库根数据源

静态站点常常不依赖 workspace package，却会在构建时读取根目录的 release notes、roadmap 或公开文档。移动 `packages/site` 到 `apps/site` 后，相对层级发生变化，TypeScript 编译不一定能发现这些内容读取错误。

因此 Site 至少需要三层验证：

- 静态检查，确认 Astro/TypeScript 配置有效；
- 单元测试，确认内容转换和 URL/base-path 规则；
- production build，确认根目录文档数据源能够生成全部页面。

应用与 library 的物理分离只有在这些运行时和构建时边界都被验证后才真正完成。
