# P00：Tool Name Contract 与影响面清单

状态：已完成

## 目标

把扁平 Agent Tool `name`、独立 `pluginId`、opaque `registrationId` 和非兼容切换边界写成可测试的契约，并形成完整影响面清单。P00 不改变当前运行时行为，可以独立合并。

## 输入

- [ActSpace Tool Name 与 Plugin Namespace 契约](../../../design-docs/agent-plugin-runtime/agent-spec-tool-name-contract.md)
- `packages/tools/runtime/src/definition.ts`
- `packages/tools/runtime/src/registry.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/llm/service/src/message.ts`
- `packages/llm/service/src/stream.ts`
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts`
- `packages/llm/pi-ai/src/pi-ai-wire-engine.ts`
- `packages/session/journal/src/core-codecs.ts`
- `tmp/deepseek-harness/packages/core/tools/src/index.ts`
- `tmp/deepseek-harness/packages/core/session/src/types.ts`

## 工作项

1. 固定 Agent Tool Name 正则、重复注册、scope visibility、provenance 和旧字段禁用规则。
2. 生成当前 first-party 工具清单：Core 14、Browser 11、Todo 2、Subagent 2；每项记录现有 local name、plugin owner、executor package、是否进入模型 schema、是否进入 Session/projection。
3. 逐项区分 Agent Tool identity 与 `WorkspaceOpenToolId` 等桌面端独立枚举，形成排除清单。
4. 准备 contract fixtures：合法 `read_file`、合法 `browser_tabs`、非法 `actspace.core-tools/read_file`、非法 `tool.name.with.dot`、重复 name、同名不同 pluginId、独立 registrationId。
5. 为 P01 列出需要同步改名的公共类型、生产代码、测试 fixture、manifest/preset 和 projection 文件，禁止用全仓库盲目字符串替换。

## 验收

- 清单覆盖所有 first-party Agent Tool registration 和所有生产 wire 入口；
- 合法/非法/冲突 fixture 的预期结果已写入测试设计；
- `WorkspaceOpenToolId` 排除边界有具体文件依据；
- 没有引入 encoded name、mapping、wire alias 或旧字段 fallback 的实施要求。

## 失败处理

发现某个插件确实需要同名能力时，不修改 `name` 契约；记录 pluginId、scope 和所需 shadow policy，暂停 P01 并重新评审冲突规则。
