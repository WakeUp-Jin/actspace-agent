# 从 ESM 模块到真实插件包：边界、生命周期与可诊断性

## 是什么

ESM 是模块格式；真实插件是运行时可识别、可装载、可卸载的 package boundary。一个目录里的 `dynamic import()` 只能解决加载文件，不能提供稳定 plugin id、依赖声明、Service ABI、生命周期所有权或独立发布/测试身份。

## 为什么需要

单一 Runtime 包即使内部有 `src/plugins/`，Host 仍然只能替换整个 Runtime，Loader 也看不到领域级 Fiber 和 Service。迁移到独立 workspace package 后，Session、LLM、Agent Loop、Tools 等可以各自声明 manifest、Behavior Entry 和 disposer，composition 才能验证缺失能力并报告具体插件。

## 怎么判断

真实插件至少需要：

1. 独立 `package.json` 与 `exports`；
2. Static Manifest（plugin id、版本、Host/frontend、依赖和 contributions）；
3. Behavior Entry（激活 Service/Tool/Prompt 并返回可等待 dispose）；
4. 需要持久事件时提供 Codec Entry；
5. 独立 activation、卸载和 ABI 测试。

`@actspace/runtime` 可以是 ESM，但它只负责 Host-facing boot、composition、projection 和 shutdown；领域实现必须从它的 facade 依赖的公开 package exports 进入，不能回读 monolith 的 `src/`。

## 常见陷阱

- 把 `import()` 当成插件化，结果没有独立发布/替换粒度。
- 只迁移 producer，不迁移 consumer；新包存在但 Desktop/CLI 仍从旧 loader 启动。
- 删除旧目录前没有做 reachability scan，导致 deep import 或打包制品继续携带旧 Runtime。
- 用自动化 renderer 测试替代真实 Electron、Provider、Chrome Extension 或签名制品验收。

## 自检问题

- Loader 能否只根据 manifest 发现并诊断这个领域，而不读取另一个 package 的 `src/`？
- 每个 Service/Tool 注册是否拥有一个可等待的 effect disposer？
- 如果只替换 Session 或 LLM package，Host 是否无需替换整个 Runtime？

## Clean checkout 还会暴露什么

workspace package 的 `exports` 如果直接指向 `dist/*.d.ts`，递归 typecheck 依赖的是“声明产物已经存在”这个前置条件。dirty checkout 中残留的 `dist` 会让错误消失，只有没有构建缓存的 clean checkout 才能证明依赖图完整。

因此根 typecheck 必须先沿着真实 Runtime 依赖图构建声明产物，再并行检查各 package；本仓库现在用 `pnpm --filter @actspace/runtime... build` 固定这个顺序。这里的 `...` 不是模块格式或动态加载，而是 pnpm workspace 依赖闭包，确保 Session、LLM、Tools 等 package 的 public exports 在消费方 typecheck 前可解析。
