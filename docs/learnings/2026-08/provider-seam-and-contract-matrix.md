# Provider seam 与契约矩阵：让可替换性变成可审计事实

## 这次重构暴露出的核心问题

如果 Session Core 直接创建 JSONL writer，或者 Agent Boot 直接从静态配置推断插件能力，那么“可替换 Provider”和“可组合插件”只停留在命名上：实现一变，边界就会重新耦合，测试也只能证明某一条默认路径。

本轮采用两个互补的模式：

1. **Provider seam**：Core 只接收稳定的 `driver`/`binding`，Provider 负责物理资源、lease、目录和 recovery。
2. **Contract matrix**：从显式 allowlist 读取事件、服务、manifest、package 和 verification 声明，生成可复现的 JSON/Markdown 快照，并在 CI 中用 digest 与结构校验阻止漂移。

## 为什么两个模式要一起使用

单独抽接口只能解决运行时耦合，不能证明所有声明、实现和验证入口仍然一致；单独生成矩阵只能发现静态差异，不能保证 Core 没有偷偷调用具体 writer。前者约束代码依赖，后者约束仓库事实，两者形成“运行边界 + 审计边界”。

## 可迁移的实现步骤

- 先定义最小的 backend-neutral driver：append、ownership check、close；不要把文件路径、锁和 writer 类型泄露给 Core。
- Provider 返回 binding，而不是已经组装好的 Core 对象；由组装层把 binding 注入 Core，所有权更容易测试。
- 用 Definition/Provider/Consumer 三层记录 owner、scope、ABI 和 public surface，避免只靠字符串 service id。
- 生成器必须使用显式 allowlist；默认不读取环境变量、session data、workspace 或网络。
- 把未来声明与当前可运行状态分开，例如 `goal/change`、`schedule/change` 可以进入矩阵，但 producer status 必须是 `not-implemented`。
- 让 digest 覆盖 loader、service、codec、patch 和 startup requirements，否则 composition 变化可能复用旧 Boot 结果。

## 常见陷阱

- 把 `session.jsonl` 这个 Provider 名称当成旧 v1 回连 token，导致 legacy checker 误报；检查器应按当前包边界判断，而不是按单个词禁用。
- 只比较 Composer 输出、不比较实际 transport 文件；静态 `cordis.yml` 被手动修改后会出现“内存配置正确、真实加载错误”。
- 生成器递归扫描整个仓库；这会把本地路径、临时 session 或密钥意外带入制品，也会让 digest 因无关文件频繁变化。
- 将“声明存在”写成“能力已实现”；必须同时保存 implementation/producer status 与 declaration status。

## 自检问题

1. 如果把 JSONL Provider 换成 SQLite，Session Core 是否无需导入新包或修改 writer 逻辑？
2. 如果只改动一个 loader inject，是否会同时触发 composition digest 和 transport parity 失败？
3. 矩阵中一个事件的 `declared`、`implemented`、`verified` 是否可以分别解释？

关联变更：`docs/histories/2026-08/20260829-2200-actspace-p1-p2-contract-composition.md`。
