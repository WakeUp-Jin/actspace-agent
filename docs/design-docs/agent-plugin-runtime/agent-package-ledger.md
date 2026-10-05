# Package、Plugin 与 Entry 身份

当前清单由 [契约矩阵](agent-contract-matrix.generated.md)从实际声明生成，不再维护第二张手工包清单。

- Package 是 workspace 构建、依赖和公开导出的边界，以 `package.json` 与 `exports` 为准。
- Plugin 是 manifest 中的稳定身份，进入诊断、来源和持久事件命名空间；npm version 不等于插件 ABI。
- Entry 是某次组合中的稳定装载行，供 Bundle/Patch 寻址；同包可以拥有多个 Entry。
- Service 是能力契约；一个包、一个插件、一个 Service 不必一一对应。
- Host 数据和生命周期接口不能依赖默认 Harness 的私有实现；存储业务不能依赖 JSONL 文件布局。

目录和依赖规则见[包结构规范](agent-spec-package-layout-and-plugin-packaging.md)。矩阵的实际覆盖与限制见[生成规范](agent-spec-contract-matrix-generation.md)。新增 package/manifest 时同步显式源清单，完整性测试会检查遗漏。

早期 P00 长表已退役；原文可用 `git show 1bc434d:docs/design-docs/agent-plugin-runtime/agent-package-ledger.md` 回溯，不能按旧表重新创建已删除包。
