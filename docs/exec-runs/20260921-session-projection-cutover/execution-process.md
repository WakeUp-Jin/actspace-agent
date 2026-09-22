# 执行过程

- 2026-09-21：核对 DSH Registry/cache/client window 与 ActSpace 生产调用链。确认已有 Registry 未被生产 controller 使用；现有 browse index 独立承担冷读；Desktop 仍将部分展示模型在 main 计算。用户批准一次性切换和相关冗余清理。
- 执行前发现官网、CI、lockfile 已有用户变更，保留这些内容。
- 2026-09-21：完成 Registry definitions、SessionReadModel、durable checkpoint/byte offsets、raw window IPC、Client 展示投影；删除被替代的 browse index/Main projection/cache helpers。
- 回归中迁移仍返回旧 record DTO 的夹具，修复 bootstrap effect 重复触发；分页夹具必须提供全 Session activeMessageIds，不能把页内 IDs 当作有效 Surface 全集。
- 补齐 failed ToolView、后台 Bash detail、完整复制读取，以及冻结 reducer state 防止失败污染。Desktop 全量 750 项通过；后续改动定向 47 项通过，Runtime 最终 11 项通过。
- 2026-09-22：修复跨包 src/test 深引用，提供 core-agent-loop/testing 子入口；包边界通过。renderer/Electron 构建及类型检查通过。
- 隔离 Electron 实测尝试失败于本机 Electron 可执行文件缺失，未进入应用；记录外部门禁，不伪称 UI 验收成功。
- 同步当前设计、完成计划、history 与学习记录，保留旧计划中的历史证据。未提交、推送或删除用户数据。
