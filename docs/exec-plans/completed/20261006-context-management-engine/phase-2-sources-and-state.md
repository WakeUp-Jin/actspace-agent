# P2：来源插件、动态补充和状态地基

状态：实现完成，自动化检查通过；真实模型/实机覆盖限制见执行摘要。依赖：P1；产物由 P3/P4 消费。先读 [总计划](README.md)和[共享契约](shared-contracts.md)。本阶段能独立提供来源卸载、规则刷新与动态尾部能力；不写空的披露功能。

## 允许修改范围

- `packages/context/src/engine.ts`、新增 `registry.ts`、`state.ts`、`codec.ts`、`supplements.ts`、`sources/{conversation,tools}.ts` 及测试/exports/manifest。
- `packages/prompt/src/context-sources/{system,rules,skills,runtime}.ts`（新增）、`plugin.ts`、`host-context.ts`、`core-contributors.ts`、registry/assembler 的迁移接线。
- `packages/runtime/src/startup/boot.ts`、`profiles/composition.ts`、`harness/{agent-factory-plugin,default-harness,default-harness-definition}.ts`、`scripts/build-default-harness.mjs` 及对应测试。
- `packages/core/agent-loop/src/loop.ts` 与生命周期/消息测试；`packages/english-learning/src/service.ts` 与测试，`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts` 的 Prompt Host 端口接线；`packages/cordis-adapter/src/event-contract.ts` 仅用于同步已迁移的事件契约。
- `packages/session/persistence/src/test/`、`packages/session/journal/src/test/` 增加兼容测试；不修改已有 Session envelope/Surface/storage 格式。

## 任务

### P2.1 注册与独立生命周期

- [x] 实现来源 registry：稳定 ID/顺序、归属验证、required/optional、重复注册拒绝、幂等撤销与作用域隔离。
- [x] 六来源作为独立 Cordis behavior/注册单元接入；四个 Prompt 来源共享现有 Prompt Host 能力，工具来源仅提供工具定义与事实适配，不执行工具。
- [x] 为系统/规则/Skill/运行信息/会话/工具分别提供可撤销注册；Harness Entry 名固定为 `context-system`、`context-rules`、`context-skills`、`context-runtime`、`context-conversation`、`context-tools`，不创建新 package。构建脚本从声明表生成这些入口。
- [x] 必要来源缺失拒绝请求，可选来源撤销后删除其当前贡献；注册表在 Agent scope dispose 时清空，两个 Session 与两个 Harness generation 独立。
- [x] 迁移英语学习为独立来源，通过共享契约规定的 Prompt Host 来源注册表关联目标 Session/Agent scope，解决 Host 不能直接查找 Harness 子服务的边界；保留双语开关效果。迁完现有消费者后删除 P1 旧汇总桥和生产 `system-prompt/assemble` 依赖，同步事件清单/verifier，不保留第二条隐藏注入通道。

### P2.2 系统 Prompt、AGENTS 与 Skill

- [x] system 来源暴露按 route/model/mode 选择模板的扩展方法；第一版只提供当前 Agent/Chat 默认模板，未匹配模型使用默认，不新增专用模板。
- [x] rules 来源每个新用户 Turn 调用 Host 刷新，按内容 digest 复用未变结果；删除 AGENTS 后不继续缓存旧内容。缺失正常，I/O 错误有来源诊断。
- [x] Agent/Plan 读取用户数据目录与工作区根目录 AGENTS；Chat 只读用户规则，保持原有权限和内容边界。显式标注用户规则优先，不依赖拼接先后猜优先级；不读取 CLAUDE.md/嵌套规则。
- [x] Skill 来源复用现有 discovery/catalog/selected contributor。保持当前模式、显式选择和路径披露行为，不重新实现 Skill 发现。

### P2.3 Codec 与动态补充

- [x] 按共享契约新增两个 v1 required Codec，Host 启动在恢复前准入，停用行为仍保留 Codec；不在 behavior 激活时临时注册。
- [x] 实现 state reducer 和 supplement 事件；旧会话没有事件默认空状态，未启用披露不产生路径状态。
- [x] 动态来源提供模式/阶段信息、当前日期与时区；已有稳定 modelFacts 保持归属，审计 ID 不送模型，同一 Turn 不每步注入高精度时间。
- [x] 变化时在安全尾部追加带 owner 的补充，旧版本保留至压缩，最新版本明确标注为当前状态。相同展示不追加；无关计数不影响内容 digest。
- [x] 按 Surface 精确来源定位锚点；至少两并行 tool-call 的全部结果完成后才能追加。用户消息、工具结果、摘要本身不改写。

### P2.4 恢复、fork、压缩兼容

- [x] 从 Journal 恢复补充、撤销和生命周期；未知 required codec 维持现有 browse-only 行为，禁止删掉未知事件后继续写。
- [x] P2 仍使用现有压缩实现；getContext 根据有效替换记录清除被覆盖的旧补充，再补入当前版本，避免依赖 P3 才能正确压缩。
- [x] fork 后原 seq 继续定位，Turn 已结束的临时内容不复活；父子后续变化独立。来源撤销后不展示其补充，历史原文保留。

### P2.5 临时插槽

- [x] 引擎实现仅请求尾部的受控插槽，支持共享契约两种寿命；内部事件字段不加入额外公共业务对象。
- [x] 验证准备失败不消费、request 绑定先持久化、传输重试复用、Turn 结束不再显示、显式移除和重复移除幂等。
- [x] 将子 Agent 步数用尽等现有运行提醒接入动态来源/插槽，执行预算仍在 Loop 执行，不由提示词控制。

## 验证矩阵与命令

新增 `packages/context/src/test/{registry,supplements,state-recovery,lifecycle}.test.ts`；扩展 Prompt host-context/assembler、Runtime composition/factory/english-learning 和 Session fork fixture。

必测：两轮之间修改/删除 AGENTS；同轮多步不重复；Chat 不注入 workspace/Skill；两工具结果安全插入；压缩后只补当前版本；重启、fork、停用行为保留 Codec；来源失败与 owner 冒充；取消注册/插件重载无重复；单次插槽的失败与重试。

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/context test
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/english-learning test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/runtime test
pnpm check:harness-events
pnpm test:harness-events
pnpm test:harness-recovery
pnpm check:packages
pnpm check:package-cutover -- --strict
pnpm check:docs
```

## 回退与交付

Codec 先于首次写入启用；失败时停止新行为，但保留 Codec 和 Journal。关闭某来源不得清空 Session。旧二进制不识别 required 事件时只能浏览，这是已声明边界。阶段完成后默认 Harness 已使用六来源，旧统一 contributor 汇总不再承担生产组装；记录快照、缓存和模式的真实回归结果。

## 实施证据与限制

本阶段代码已完成。实际命令结果、首次测试异步异常及复跑结果见[执行摘要](../../../exec-runs/20261006-context-management-engine/execution-summary.md)。勾选表示工程任务完成，不表示所有产品场景已用真实 Provider 验收；U1–U8 的状态以 Computer Use 报告为准。故障注入使用真实 Journal 编码/投影及模拟失败和持久前缀，未声称执行了每个切点的操作系统掉电实验。
