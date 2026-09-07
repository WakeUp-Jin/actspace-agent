# ActSpace v2 Package / Plugin / Entry Ledger

状态：P00 基线已按 Profile-first Runtime 更新；后续计划只能在这里追加或明确替换身份，不得把 npm version、plugin id 和 Entry id 混用。

## 规则

- `package` 是 workspace 发布边界；它由 `package.json` 和 `exports` 定义。
- `plugin` 是 Runtime 的稳定身份；它进入 manifest、诊断和 durable event namespace。
- `entry` 是一次 Composition 中的稳定装载行；它进入 Bundle、Patch 和启动诊断。
- P00 只登记身份和依赖方向；行为迁移由 P01-P04 完成。
- `llm-legacy-transport` 仍是条件包，未被纳入 Base Profile，P00 不创建它。

## 基础设施包

| Package | Plugin id | Entry id | 类型 | 依赖方向 |
| --- | --- | --- | --- | --- |
| `@actspace/runtime` | — | — | Profile bootstrap | boot, bundle, composition, diagnostics, domain packages |
| `@actspace/cordis-adapter` | — | — | lifecycle boundary | exact DSH Cordis family |
| `@actspace/boot` | — | — | trusted boot | cordis-adapter, bundle, composition, diagnostics |
| `@actspace/bundle` | — | — | composition data | cordis-adapter |
| `@actspace/composition` | — | — | loader composition | bundle, cordis-adapter, diagnostics |
| `@actspace/diagnostics` | — | — | diagnostics | cordis-adapter |

## Core semantic plugin packages

| Package | Plugin id | Entry id | 默认状态 |
| --- | --- | --- | --- |
| `@actspace/core-scope` | `actspace.core.scope` | `core.scope` | required |
| `@actspace/core-agent` | `actspace.core.agent` | `core.agent` | required |
| `@actspace/core-agent-loop` | `actspace.core.agent-loop` | `core.agent-loop` | required |
| `@actspace/session-journal` | `actspace.session.journal` | `session.journal` | required |
| `@actspace/session-persistence` | `actspace.session.persistence` | `session.persistence` | required |
| `@actspace/session-jsonl` | `actspace.session.jsonl` | `session.jsonl` | required |
| `@actspace/session-projection` | `actspace.session.projection` | `session.projection` | required |
| `@actspace/llm-service` | `actspace.llm.service` | `llm.service` | required |
| `@actspace/llm-pi-ai` | `actspace.llm.pi-ai` | `llm.pi-ai` | replaceable provider |
| `@actspace/context` | `actspace.context` | `context.default` | required |
| `@actspace/prompt` | `actspace.prompt` | `prompt.default` | required |
| `@actspace/tools-runtime` | `actspace.tools.runtime` | `tools.runtime` | required |
| `@actspace/tools-approval` | `actspace.tools.approval` | `tools.approval` | required |
| `@actspace/tools-core-tools` | `actspace.tools.core` | `tools.core` | required |
| `@actspace/tools-browser-tools` | `actspace.tools.browser` | `tools.browser` | optional capability |
| `@actspace/subagent` | `actspace.subagent` | `subagent.one-shot` | required |
| `@actspace/compaction` | `actspace.compaction` | `compaction.surface` | required |

## App Bundle and fixed-client packages

| Package | Plugin id | Entry id | 类型 |
| --- | --- | --- | --- |
| `@actspace/desktop-app` | `actspace.desktop-app` | `desktop.app` | Desktop App Bundle / Service |
| `@actspace/headless` | `actspace.headless` | `headless.runner` | Headless App Bundle / Runner |
| `@actspace/client` | — | — | fixed renderer DTO / IPC |
| `@actspace/test-support` | — | — | test-only library |
| `@actspace/util` | — | — | domain-neutral utility |

## 禁止项

- 不新增 `packages/harness/`、`packages/plugins/`。
- 不从任何 package 读取 sibling package 的 `src/`。
- 不使用 `@deepseek-ai/*/src/*` deep import。
- 不把 package version 当作 plugin 或 Entry identity。
