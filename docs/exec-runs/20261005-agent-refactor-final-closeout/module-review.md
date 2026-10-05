# 模块处置依据

本表记录职责、公开入口与消费者核对，不声称逐行证明全仓没有冗余。删除以真实消费者闭包为依据；只有 manifest 动态入口或外部调用可能性的导出，不因静态 import 为零删除。完整逐路径结算见 [cleanup-ledger.tsv](cleanup-ledger.tsv)。

## 本轮实际删除与保留

- 23 个插件的旧 `activate()` 工厂与 `activateBehavior` 已退役，生产统一由 Cordis `apply` 装载。对应测试改为真实 Context/Fiber 服务与释放行为；AgentService 内部仍被调用的 activate 工厂保留。
- 删除空生命周期 effect、无消费者的 AgentApplication dispose 包装、重复 Cordis 版本常量/契约别名及未使用局部符号。Desktop 标题服务有实际释放动作，保留。
- Inbox 写侧只承接后台通知；Host Task 是用户内容排队与配置消费的唯一所有者，历史 Journal 读侧不按旧关键词删除。
- Session/storage、JSONL、persistence、projection/cache 分层保留；只有 JSONL 承担文件租约，Memory 验证中性接口而不能证明磁盘耐久性。
- Host/Client、控制服务/Harness/Run、工具插件各自边界保留；不为减少包数合并。Browser Bridge 是外部 Host capability。

43 个领域包 `tsc --noEmit --noUnusedLocals --noUnusedParameters` 全部成功；这只证明局部符号未使用检查通过，不能代替公共导出/动态消费者分析。隔离快照的完整测试另见执行摘要；界面覆盖以 CU 报告为准。

## 逐模块证据

| 模块 | 消费者依据 | 测试文件数 | 实际修改文件数 |
| --- | --- | ---: | ---: |
| `apps/cli` | `apps/README.md`; `apps/site/src/content/docs/cli.md`; `package.json` | 6 | 1 |
| `apps/desktop` | `apps/README.md`; `package.json`; `packages/desktop-app/package.json` | 162 | 9 |
| `apps/site` | `apps/README.md`; `package.json`; `scripts/check-package-boundaries.mjs` | 4 | 0 |
| `packages/agent-host` | `apps/cli/package.json`; `apps/cli/src/runtime-v2/host-adapter.ts`; `apps/cli/src/runtime-v2/host-command.ts` | 18 | 1 |
| `packages/agent-service` | `apps/cli/package.json`; `apps/cli/src/runtime-v2/host.ts`; `packages/agent-host/package.json` | 5 | 1 |
| `packages/boot` | `packages/agent-service/package.json`; `packages/harness-control/package.json`; `packages/runtime/package.json` | 5 | 0 |
| `packages/bundle` | `packages/agent-service/package.json`; `packages/boot/package.json`; `packages/composition/package.json` | 0 | 0 |
| `packages/client` | `apps/desktop/package.json`; `apps/desktop/src/main/remote-hosts/desktop-adapter.ts`; `apps/desktop/src/main/remote-hosts/registry.ts` | 4 | 1 |
| `packages/compaction` | `packages/core/agent-loop/package.json`; `packages/desktop-app/package.json`; `packages/runtime/package.json` | 3 | 3 |
| `packages/composition` | `packages/agent-service/package.json`; `packages/boot/package.json`; `packages/harness-control/package.json` | 3 | 0 |
| `packages/context` | `packages/compaction/package.json`; `packages/core/agent-loop/package.json`; `packages/prompt/package.json` | 2 | 4 |
| `packages/cordis-adapter` | `packages/agent-host/package.json`; `packages/agent-service/package.json`; `packages/boot/package.json` | 8 | 7 |
| `packages/core/agent` | `apps/cli/cordis.yml`; `apps/desktop/package.json`; `apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts` | 5 | 5 |
| `packages/core/agent-loop` | `apps/cli/cordis.yml`; `apps/desktop/package.json`; `apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts` | 6 | 6 |
| `packages/core/scope` | `packages/agent-service/package.json`; `packages/boot/package.json`; `packages/core/agent-loop/package.json` | 3 | 3 |
| `packages/desktop-app` | `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`; `apps/desktop/src/main/runtime-v2/runtime-registry.ts` | 2 | 1 |
| `packages/diagnostics` | `packages/boot/package.json`; `packages/composition/package.json`; `packages/runtime/package.json` | 0 | 0 |
| `packages/english-learning` | `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`; `apps/desktop/src/main/runtime-v2/runtime-registry.ts` | 2 | 0 |
| `packages/harness-control` | `packages/runtime/package.json`; `packages/runtime/src/harness/agent-host-port.ts`; `packages/runtime/src/harness/agent-runtime-plugin.ts` | 5 | 0 |
| `packages/headless` | `packages/runtime/cordis.yml`; `packages/runtime/package.json`; `packages/runtime/src/index.ts` | 1 | 2 |
| `packages/llm/pi-ai` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts` | 9 | 3 |
| `packages/llm/service` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/scripts/verify-usage-runtime.mjs` | 5 | 4 |
| `packages/prompt` | `packages/core/agent-loop/package.json`; `packages/english-learning/package.json`; `packages/runtime/package.json` | 4 | 3 |
| `packages/runtime` | `apps/cli/cordis.yml`; `apps/cli/package.json`; `apps/cli/src/runtime-v2/host-adapter.ts` | 16 | 3 |
| `packages/session/checkpoint-policy` | `packages/runtime/cordis.yml`; `packages/runtime/package.json`; `packages/runtime/src/harness/english-learning.test.ts` | 1 | 3 |
| `packages/session/journal` | `apps/desktop/package.json`; `apps/desktop/scripts/verify-trajectory-electron.mjs`; `apps/desktop/scripts/verify-usage-runtime.mjs` | 2 | 7 |
| `packages/session/jsonl` | `packages/agent-host/package.json`; `packages/agent-service/package.json`; `packages/harness-control/package.json` | 2 | 1 |
| `packages/session/persistence` | `packages/agent-host/package.json`; `packages/agent-service/package.json`; `packages/compaction/package.json` | 8 | 2 |
| `packages/session/projection` | `apps/desktop/package.json`; `packages/runtime/cordis.yml`; `packages/runtime/package.json` | 3 | 4 |
| `packages/session/projection-cache` | `packages/runtime/package.json`; `packages/runtime/src/session/session-controller.ts` | 2 | 0 |
| `packages/session/storage` | `packages/runtime/package.json`; `packages/runtime/src/harness/managed-runs.test.ts`; `packages/runtime/src/session/storage-neutral.test.ts` | 2 | 0 |
| `packages/shared` | `apps/cli/package.json`; `apps/cli/src/runtime-v2/data-root.ts`; `apps/cli/src/runtime-v2/host-adapter.ts` | 17 | 2 |
| `packages/subagent` | `packages/runtime/package.json`; `packages/runtime/src/harness/agent-factory-plugin.ts`; `packages/runtime/src/harness/agent-runtime-plugin.ts` | 2 | 3 |
| `packages/test-support` | 独立应用/Host capability 入口 | 0 | 0 |
| `packages/tools/approval` | `apps/cli/package.json`; `apps/cli/src/runtime-v2/approval.ts`; `apps/cli/src/test/runtime-v2-approval.test.ts` | 1 | 3 |
| `packages/tools/browser-tools` | `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/browser-capability.ts`; `packages/runtime/package.json` | 3 | 3 |
| `packages/tools/filesystem-read` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 2 | 2 |
| `packages/tools/filesystem-search` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 2 | 3 |
| `packages/tools/filesystem-write` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 2 | 4 |
| `packages/tools/image-generation` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 3 | 3 |
| `packages/tools/image-inspection` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 2 | 2 |
| `packages/tools/runtime` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/artifact-store.ts` | 3 | 6 |
| `packages/tools/shell-tools` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 2 | 3 |
| `packages/tools/todo-tools` | `packages/runtime/package.json`; `packages/runtime/scripts/build-default-harness.mjs`; `packages/runtime/src/profiles/composition.ts` | 2 | 3 |
| `packages/tools/web-tools` | `apps/cli/package.json`; `apps/desktop/package.json`; `apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 2 | 2 |
| `packages/util` | 独立应用/Host capability 入口 | 0 | 0 |
| `browser-bridge` | `apps/desktop/src/main/browser-bridge-service.ts`; `apps/desktop/src/main/index.ts`; `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` | 0 | 0 |

测试文件数来自路径清单，不能换算为通过用例数。详细源码文件、导出、直接消费者与变化列表保存在本机 `tmp/refactor-final-closeout/module-review-details.json`；自动化原始日志也在该隔离工作目录。

## 文档保留判据

每份文档记录标题/章节、文件身份、链接和源码路径。已确认重复的架构设计归并到主规范，历史引用通过短入口保留；两个重复过程记录的独有失败信息并入同任务摘要。其他任务的计划、验收、截图和研究不能仅按时间或相似标题删除。
保留项不是“已证明没有冗余”：二进制证据按来源保留；独立专题未逐字段验证的 API 在清单中明确检查限制。当前架构已知漂移由正文修正与守卫共同约束。独立工作台/产品草稿原样保护。
