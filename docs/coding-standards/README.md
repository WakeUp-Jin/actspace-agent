# 编码规范

仓库的编码规范入口。通用编码行为纪律见 [`REPO_COLLAB_GUIDE.md`](../REPO_COLLAB_GUIDE.md) 的「编码行为纪律」；这里放按领域划分的约定，每份一个文件，命名 `{领域}-conventions.md`。

## 当前约定

| 文件 | 管什么 | 什么时候读 |
|---|---|---|
| [`perf-memory-conventions.md`](perf-memory-conventions.md) | 性能与内存：高频路径的工作量、只读数据不复制、同一份内容只存一份、缓存与轮询、流式渲染，以及怎么验证 | 写或改每次请求、流式片段、每帧渲染、IPC 轮询、审批、工具调用会经过的代码之前 |
| [`frontend-style-scope-conventions.md`](frontend-style-scope-conventions.md) | 前端样式作用域、全局 CSS 与组件样式的归属边界、样式覆盖类 bug 的排查方式 | 改样式之前 |
| [`lint-conventions.md`](lint-conventions.md) | Biome lint 的命令、规则分层（error / warn / off）、单处抑制写法和不强制的格式化 | 提交前跑 `pnpm lint` 报错时，或想调整规则时 |

## 什么时候在这里加文件

- 某个约定是本仓库特有的，没有通用 skill 能覆盖；
- 某个 skill 的默认行为需要仓库级别的覆盖或补充。

## 编写建议

- 只写 skill 覆盖不到的内容，不重复。
- 保持简短：规范越短越容易被遵守。
- 能变成机械检查的约束（lint 规则、`check:*` 脚本），就不要只停留在文档里；文档写明对应的检查命令。
