# Agent Contract Matrix

> Generated artifact; edit source declarations instead. Do not hand-edit this file.
> Generator 1.0.0; source digest `82bc4c58fc05f8f43210a8c28860550f29335a660a77070cf21bdf714c781831`.

This document is an audit view of the current ActSpace v2 declarations. It never activates Runtime services, plugins, Session persistence, tools or Cordis entries.

- Services: 14
- Events: 71 (Session core 13, Loop interventions 10, notifications 6)
- Plugins: 19
- Packages: 32

## Services

| id | owner | status | scope | providerId | consumerIds | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| agent.loop | @actspace/core-agent-loop | active | agent | agent.loop:default | agent.runtime<br>headless.runner | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.agentLoop | cordis-adapter/service-contract |
| agent.registry | @actspace/core-agent | active | root | agent.registry:default | agent.loop<br>agent.runtime<br>subagent.one-shot | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.agentRegistry | cordis-adapter/service-contract |
| agent.runtime | @actspace/runtime | active | root | agent.runtime:default | headless.runner<br>runtime.handle | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.agentRuntime | cordis-adapter/service-contract |
| compaction.runtime | @actspace/compaction | optional | session | compaction.runtime:default | agent.loop<br>agent.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.compaction | cordis-adapter/service-contract |
| context.assembly | @actspace/context | active | root | context.assembly:default | agent.loop<br>prompt.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.contextAssembler | cordis-adapter/service-contract |
| llm.service | @actspace/llm-service | active | root | llm.service:default | agent.loop<br>compaction.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.llmRuntime | cordis-adapter/service-contract |
| prompt.runtime | @actspace/prompt | active | root | prompt.runtime:default | agent.loop<br>context.assembly | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.systemPrompt | cordis-adapter/service-contract |
| session.journal | @actspace/session-journal | active | root | session.journal:default | - | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.sessionJournal | cordis-adapter/service-contract |
| session.persistence | @actspace/session-persistence | active | session | session.persistence:jsonl | session.runtime<br>session.store | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.sessionPersistence | cordis-adapter/service-contract |
| session.projection | @actspace/session-projection | optional | session | session.projection:default | runtime.projection<br>session.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.sessionProjection | cordis-adapter/service-contract |
| session.store | @actspace/session-persistence | active | session | session.store:default | agent.loop<br>agent.runtime<br>session.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.sessionStore | cordis-adapter/service-contract |
| tools.browser | @actspace/browser-tools | optional | agent | tools.browser:default | tools.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.browserTools | cordis-adapter/service-contract |
| tools.core | @actspace/core-tools | active | agent | tools.core:default | tools.runtime | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.coreTools | cordis-adapter/service-contract |
| tools.runtime | @actspace/tools-runtime | active | agent | tools.runtime:default | agent.loop<br>subagent.one-shot | packages/cordis-adapter/src/service-contract.ts#ACTSPACE_SERVICE_DEFINITIONS.toolsRuntime | cordis-adapter/service-contract |

## Events

| eventType | category | plane | status | scope | mode | codecStatus | producerStatus | containment | owner | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| agent/pre-step | agent-loop | intervention | active | agent | waterfall | n/a | present | step-skip-or-rewrite | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/request | agent-loop | intervention | active | agent | waterfall | n/a | present | request-reject | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/request-error | agent-loop | intervention | active | agent | waterfall | n/a | present | retry-abort-escalate | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/turn-stopping | agent-loop | intervention | active | agent | serial | n/a | present | stop-or-continue | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| llm/stream | agent-loop | intervention | active | agent | waterfall | n/a | present | abort-or-replace | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/checkpoint | agent-loop | intervention | active | agent | required | n/a | present | fail-closed | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| system-prompt/assemble | agent-loop | intervention | active | agent | waterfall | n/a | present | request-reject | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tools/execute | agent-loop | intervention | active | agent | waterfall | n/a | present | wrap-or-replace | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tools/post-execute | agent-loop | intervention | active | agent | waterfall | n/a | present | result-fail-or-redact | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tools/pre-execute | agent-loop | intervention | active | agent | waterfall | n/a | present | deny-or-rewrite | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentLoopIntervention | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/error | notification | notification | active | agent | emit | n/a | present | observer-isolated | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentNotification | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/session-start | notification | notification | active | agent | emit | n/a | present | observer-isolated | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentNotification | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/status | notification | notification | active | agent | emit | n/a | present | observer-isolated | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentNotification | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| llm/chunk | notification | notification | active | agent | emit | n/a | present | observer-isolated | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentNotification | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/event | notification | notification | active | session | emit | n/a | present | post-commit-observer-isolated | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentNotification | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tools/result | notification | notification | active | tool | emit | n/a | present | observer-isolated | @actspace/cordis-adapter | packages/cordis-adapter/src/event-contract.ts#AgentNotification | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent-preset/selected | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| agent/inbox/spliced | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| approval/asked | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| approval/decided | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| approval/policy | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| assistant/chunk | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| assistant/message | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| command/done | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| command/run | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| compaction/end | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| compaction/prune | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| compaction/start | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| compaction/summary | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| delegation/child-terminal | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| delegation/completed | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| delegation/requested | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| feedback/record | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| goal/change | extension | session | unimplemented | session |  | present | not-implemented |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| hook/invoked | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| hook/result | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| llm/retry | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| llm/retry-started | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| permission/preset | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| plan/mode | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| recovery/committed | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| recovery/start | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| request/context | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| request/header | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| sandbox/mode | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| schedule/change | extension | session | unimplemented | session |  | present | not-implemented |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/archived-set | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/end-seed | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/pinned-set | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/title | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/title-llm-request | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/title-set | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| session/workspace-set | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| step/end | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| step/start | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| subagent/descriptor | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| surface/replaced | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| todo/write | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool-workflow/agent-end | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool-workflow/agent-start | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool-workflow/run-end | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool-workflow/run-start | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool/call | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool/code-dispatch | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool/code-dispatch-start | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool/recovery-outcome | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| tool/result | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| turn/end | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| turn/start | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| user/message | core | session | active | session |  | present | present |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#CORE_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |
| web/deepseek-search-llm-request | extension | session | active | session |  | present | none |  | @actspace/session-journal | packages/session/journal/src/core-codecs.ts#PERSISTED_EXTENSION_EVENT_TYPES | session-journal/core-codec-contract<br>cordis-adapter/event-contract |

## Session boundaries

| id | owner | status | scope | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- |
| session.journal | @actspace/session-journal | active | session | packages/session/journal/src/index.ts#SessionJournal | session-journal/core-codec-contract<br>session-persistence/provider-seam |
| session.persistence | @actspace/session-persistence | active | session | packages/session/persistence/src/session-persistence.ts#SessionPersistence<br>packages/session/persistence/src/session-driver.ts#SessionPersistenceDriver | session-journal/core-codec-contract<br>session-persistence/provider-seam |
| session.projection | @actspace/session-projection | optional | session | packages/session/projection/src/index.ts#SessionProjection | session-journal/core-codec-contract<br>session-persistence/provider-seam |

## Host capabilities

| id | status | required | requiredBy | optionalBy | owner | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| approval | active | true | actspace.tools.approval | actspace.browser-tools | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |
| browser | active | true | actspace.browser-tools | - | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |
| filesystem.session | active | true | actspace.session.journal<br>actspace.session.jsonl<br>actspace.session.persistence | - | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |
| headless | optional | false | - | actspace.headless | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |
| network.provider | active | true | actspace.llm.pi-ai | actspace.core-tools<br>actspace.llm.service | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |
| process | optional | false | - | actspace.core-tools | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |
| proxy.scoped | optional | false | - | actspace.llm.pi-ai | @actspace/cordis-adapter | packages/cordis-adapter/src/manifest.ts#PluginHostRequirement | composition/admission-contract |

## Plugins

| id | name | version | entryId | status | required | provides | injects | requiredCapabilities | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| actspace.browser-tools | ActSpace Browser Tools | 2.0.0 | tools.browser | active | true | tools.browser | tools.runtime | browser | packages/tools/browser-tools/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.compaction | ActSpace Surface Compaction | 0.1.0 | compaction.surface | active | true | compaction.runtime<br>compaction.surface | llm.service | - | packages/compaction/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.context | ActSpace Context | 0.1.0 | context.default | active | true | context.assembly | session.journal | - | packages/context/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.core-tools | ActSpace Core Tools | 2.0.0 | tools.core | active | true | tools.core | actspace.host.tools.core<br>llm.service<br>tools.runtime | - | packages/tools/core-tools/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.core.agent | ActSpace Core Agent | 0.1.0 | core.agent | active | true | agent.registry<br>core.agent | core.scope | - | packages/core/agent/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.core.agent-loop | ActSpace Agent Loop | 0.1.0 | core.agent-loop | active | true | agent.loop<br>core.agent-loop | actspace.agent.factory | - | packages/core/agent-loop/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.core.scope | ActSpace Core Scope | 0.1.0 | core.scope | active | true | core.scope | - | - | packages/core/scope/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.desktop-app | ActSpace Desktop Application | 0.1.0 | desktop.app | active | true | desktop.app | agent.runtime<br>compaction.runtime<br>llm.service<br>session.runtime | - | packages/desktop-app/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.headless | ActSpace Headless Runner | 0.1.0 | headless.runner | active | true | headless.runner | actspace.host.headless<br>agent.loop<br>session.runtime | - | packages/headless/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.llm.pi-ai | ActSpace pi-ai Provider | 0.1.0 | llm.pi-ai | active | true | llm.route.pi-ai | llm.service | network.provider | packages/llm/pi-ai/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.llm.service | ActSpace LLM Service | 0.1.0 | llm.service | active | true | llm.service | actspace.host.llm | - | packages/llm/service/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.prompt | ActSpace Prompt | 0.1.0 | prompt.default | active | true | prompt.assembly<br>prompt.runtime | actspace.host.prompt<br>context.assembly | - | packages/prompt/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.session.journal | ActSpace Session Journal | 0.1.0 | session.journal | active | true | session.journal | actspace.host.session.codecs | filesystem.session | packages/session/journal/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.session.jsonl | ActSpace Session JSONL | 0.1.0 | session.jsonl | active | true | session.jsonl | session.journal<br>session.persistence | filesystem.session | packages/session/jsonl/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.session.persistence | ActSpace Session Persistence | 0.1.0 | session.persistence | active | true | session.persistence | - | filesystem.session | packages/session/persistence/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.session.projection | ActSpace Session Projection | 0.1.0 | session.projection | active | true | session.projection | session.journal | - | packages/session/projection/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.subagent | ActSpace One-shot Subagent | 0.1.0 | subagent.one-shot | active | true | subagent.one-shot | core.agent<br>core.agent-loop<br>session.journal<br>tools.runtime | - | packages/subagent/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.tools.approval | ActSpace Tool Approval | 0.1.0 | tools.approval | active | true | tools.approval | - | approval | packages/tools/approval/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |
| actspace.tools.runtime | ActSpace Tool Runtime | 0.1.0 | tools.runtime | active | true | tools.runtime | tools.approval | - | packages/tools/runtime/src/manifest.ts#manifest | cordis-adapter/event-contract<br>cordis-adapter/service-contract |

## Packages

| id | packageRole | status | exports | dependencies | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- | --- |
| @actspace/agent-cli | host | active | - | @actspace/llm-pi-ai<br>@actspace/llm-service<br>@actspace/runtime<br>@actspace/shared<br>@actspace/tools-approval<br>@actspace/tools-core-tools<br>@actspace/tools-runtime | apps/cli/package.json#package.json | composition/admission-contract |
| @actspace/boot | domain | active | . | @actspace/bundle<br>@actspace/composition<br>@actspace/cordis-adapter<br>@actspace/diagnostics<br>@actspace/shared | packages/boot/package.json#package.json | composition/admission-contract |
| @actspace/bundle | domain | active | . | @actspace/cordis-adapter | packages/bundle/package.json#package.json | composition/admission-contract |
| @actspace/client | domain | active | .<br>./sessions | @actspace/shared | packages/client/package.json#package.json | composition/admission-contract |
| @actspace/compaction | domain | active | .<br>./manifest<br>./plugin | @actspace/context<br>@actspace/cordis-adapter<br>@actspace/llm-service<br>@actspace/session-journal<br>@actspace/session-persistence<br>@actspace/shared | packages/compaction/package.json#package.json | composition/admission-contract |
| @actspace/composition | domain | active | . | @actspace/bundle<br>@actspace/cordis-adapter<br>@actspace/diagnostics | packages/composition/package.json#package.json | composition/admission-contract |
| @actspace/context | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/shared | packages/context/package.json#package.json | composition/admission-contract |
| @actspace/cordis-adapter | domain | active | .<br>./behavior<br>./codec<br>./cordis<br>./events<br>./manifest<br>./plugin-contract<br>./service<br>./source-loader | @deepseek-ai/cordis<br>@deepseek-ai/cordis-plugin-group<br>@deepseek-ai/cordis-plugin-include<br>@deepseek-ai/cordis-plugin-loader<br>@deepseek-ai/cordis-plugin-timer | packages/cordis-adapter/package.json#package.json | composition/admission-contract |
| @actspace/core-agent | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/core-scope<br>@actspace/session-persistence<br>@actspace/shared<br>@actspace/tools-runtime | packages/core/agent/package.json#package.json | composition/admission-contract |
| @actspace/core-agent-loop | domain | active | .<br>./manifest<br>./plugin | @actspace/compaction<br>@actspace/context<br>@actspace/cordis-adapter<br>@actspace/core-agent<br>@actspace/core-scope<br>@actspace/llm-service<br>@actspace/prompt<br>@actspace/session-journal<br>@actspace/session-persistence<br>@actspace/shared<br>@actspace/tools-runtime | packages/core/agent-loop/package.json#package.json | composition/admission-contract |
| @actspace/core-scope | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter | packages/core/scope/package.json#package.json | composition/admission-contract |
| @actspace/desktop | host | active | - | @actspace/client<br>@actspace/desktop-app<br>@actspace/english-learning<br>@actspace/llm-pi-ai<br>@actspace/llm-service<br>@actspace/runtime<br>@actspace/session-journal<br>@actspace/session-projection<br>@actspace/shared<br>@actspace/tools-approval<br>@actspace/tools-browser-tools<br>@actspace/tools-core-tools<br>@actspace/tools-runtime<br>@radix-ui/react-hover-card<br>@radix-ui/react-tooltip<br>@tanstack/react-virtual<br>@xterm/addon-fit<br>@xterm/xterm<br>highlight.js<br>lucide-react<br>node-pty<br>react<br>react-dom<br>react-markdown<br>rehype-highlight<br>remark-gfm | apps/desktop/package.json#package.json | composition/admission-contract |
| @actspace/desktop-app | domain | active | .<br>./manifest<br>./plugin | @actspace/bundle<br>@actspace/compaction<br>@actspace/cordis-adapter<br>@actspace/english-learning<br>@actspace/llm-service<br>@actspace/session-journal<br>@actspace/session-persistence<br>@actspace/shared | packages/desktop-app/package.json#package.json | composition/admission-contract |
| @actspace/diagnostics | domain | active | . | @actspace/cordis-adapter | packages/diagnostics/package.json#package.json | composition/admission-contract |
| @actspace/headless | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/core-agent-loop<br>@actspace/session-persistence<br>@actspace/shared | packages/headless/package.json#package.json | composition/admission-contract |
| @actspace/llm-pi-ai | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/llm-service<br>@actspace/shared<br>@earendil-works/pi-ai<br>openai | packages/llm/pi-ai/package.json#package.json | composition/admission-contract |
| @actspace/llm-service | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/shared<br>undici | packages/llm/service/package.json#package.json | composition/admission-contract |
| @actspace/prompt | domain | active | .<br>./manifest<br>./plugin | @actspace/context<br>@actspace/cordis-adapter<br>@actspace/core-agent<br>@actspace/core-scope<br>@actspace/shared | packages/prompt/package.json#package.json | composition/admission-contract |
| @actspace/runtime | domain | active | .<br>./agent-factory<br>./agent-runtime<br>./cordis<br>./headless<br>./loader<br>./session | @actspace/boot<br>@actspace/bundle<br>@actspace/compaction<br>@actspace/composition<br>@actspace/context<br>@actspace/cordis-adapter<br>@actspace/core-agent<br>@actspace/core-agent-loop<br>@actspace/core-scope<br>@actspace/desktop-app<br>@actspace/diagnostics<br>@actspace/english-learning<br>@actspace/headless<br>@actspace/llm-pi-ai<br>@actspace/llm-service<br>@actspace/prompt<br>@actspace/session-checkpoint-policy<br>@actspace/session-journal<br>@actspace/session-jsonl<br>@actspace/session-persistence<br>@actspace/shared<br>@actspace/subagent<br>@actspace/tools-approval<br>@actspace/tools-browser-tools<br>@actspace/tools-core-tools<br>@actspace/tools-runtime | packages/runtime/package.json#package.json | composition/admission-contract |
| @actspace/session-journal | domain | active | .<br>./codec<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/shared | packages/session/journal/package.json#package.json | composition/admission-contract |
| @actspace/session-jsonl | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/session-journal<br>@actspace/shared | packages/session/jsonl/package.json#package.json | composition/admission-contract |
| @actspace/session-persistence | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/session-journal<br>@actspace/session-jsonl<br>@actspace/session-projection<br>@actspace/shared | packages/session/persistence/package.json#package.json | composition/admission-contract |
| @actspace/session-projection | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/session-journal<br>@actspace/shared | packages/session/projection/package.json#package.json | composition/admission-contract |
| @actspace/shared | domain | active | .<br>./model-catalog-data<br>./runtime-v2<br>./runtime-v2/desktop-ipc<br>./runtime-v2/projection<br>./runtime-v2/runtime<br>./session-selectors | - | packages/shared/package.json#package.json | composition/admission-contract |
| @actspace/site | host | active | - | @astrojs/markdown-satteri<br>@astrojs/sitemap<br>astro<br>mdast-util-to-string<br>rehype-sanitize<br>rehype-stringify<br>remark-gfm<br>remark-parse<br>remark-rehype<br>sharp<br>unified | apps/site/package.json#package.json | composition/admission-contract |
| @actspace/subagent | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/core-agent<br>@actspace/core-agent-loop<br>@actspace/core-scope<br>@actspace/llm-service<br>@actspace/session-journal<br>@actspace/session-jsonl<br>@actspace/session-persistence<br>@actspace/shared<br>@actspace/tools-runtime | packages/subagent/package.json#package.json | composition/admission-contract |
| @actspace/test-support | domain | active | . | @actspace/cordis-adapter | packages/test-support/package.json#package.json | composition/admission-contract |
| @actspace/tools-approval | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter | packages/tools/approval/package.json#package.json | composition/admission-contract |
| @actspace/tools-browser-tools | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/shared<br>@actspace/tools-runtime | packages/tools/browser-tools/package.json#package.json | composition/admission-contract |
| @actspace/tools-core-tools | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/llm-service<br>@actspace/shared<br>@actspace/tools-runtime<br>turndown | packages/tools/core-tools/package.json#package.json | composition/admission-contract |
| @actspace/tools-runtime | domain | active | .<br>./manifest<br>./plugin | @actspace/cordis-adapter<br>@actspace/shared<br>@actspace/tools-approval | packages/tools/runtime/package.json#package.json | composition/admission-contract |
| @actspace/util | domain | active | . | - | packages/util/package.json#package.json | composition/admission-contract |

## Composition declarations

| Profile | Bundles | Patch kinds | Source refs |
| --- | --- | --- | --- |
| actspace.headless, actspace.desktop | actspace.base@2.0.0, actspace.desktop-app@0.1.0, actspace.headless@0.1.0, actspace.kernel@2.0.0 | insert, replace-config, disable, remove | packages/runtime/src/profiles/composition.ts#profileDefinitions; packages/runtime/src/profiles/composition.ts#profileDefinitions; packages/runtime/src/profiles/base.bundle.ts#BASE_BUNDLE; packages/desktop-app/src/bundle.ts#DESKTOP_APP_BUNDLE; packages/headless/src/manifest.ts#manifest; packages/runtime/src/profiles/kernel.bundle.ts#KERNEL_BUNDLE; packages/bundle/src/index.ts#PatchOperation; packages/composition/src/compose.ts#composeRuntime |

## Verification evidence

| id | status | evidenceKind | owner | sourceRefs | tests |
| --- | --- | --- | --- | --- | --- |
| composition/admission-contract | active | contract | @actspace/verification | packages/composition/tests/composition.spec.ts#contract | - |
| cordis-adapter/event-contract | active | contract | @actspace/verification | packages/cordis-adapter/tests/contract.spec.ts#contract | - |
| cordis-adapter/service-contract | active | contract | @actspace/verification | packages/cordis-adapter/tests/service-contract.spec.ts#contract | - |
| desktop-app/lifecycle-contract | active | lifecycle | @actspace/verification | packages/desktop-app/src/test/lifecycle.test.ts#lifecycle | - |
| runtime/lifecycle-contract | active | lifecycle | @actspace/verification | packages/runtime/src/runtime/agent-runtime-lifecycle.test.ts#lifecycle | - |
| runtime/profile-composition-contract | active | contract | @actspace/verification | packages/runtime/src/profiles/composition.test.ts#contract | - |
| session-journal/core-codec-contract | active | contract | @actspace/verification | packages/session/journal/src/test/journal.test.ts#contract | - |
| session-journal/lifecycle-contract | active | lifecycle | @actspace/verification | packages/session/journal/src/test/lifecycle.test.ts#lifecycle | - |
| session-persistence/provider-seam | active | contract | @actspace/verification | packages/session/persistence/src/test/provider-seam.test.ts#contract | - |

## Diagnostics

- none

