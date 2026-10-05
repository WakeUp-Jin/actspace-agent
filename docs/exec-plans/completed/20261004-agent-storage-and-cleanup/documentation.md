# 文档与装配检查

状态：规范、装配检查、统计与执行记录完成；实机未覆盖子项明确保留。

- [x] D1 当前启动、Session、存储、Task/Run规范对齐最终源码，根层导航清晰；审计文档改为实施结果。
- [x] D2 service元数据/Host与Harness清单按真实装配校验，矩阵纳入agent-service/host/harness-control与新存储边界，补负向用例。
- [x] D3 六份旧后端active计划逐项映射独有剩余工作；已替代内容移出active入口，保护history/learnings回溯链接；不清理独立未来功能计划。
- [x] D4 全部验证记录、行数前后对照、history及必要learning；检查无关修改和原history/learnings未被改动。自动化与保护检查已通过，Computer Use 按实际覆盖记录，未覆盖子项不算通过。

验证：check:docs、test:current-docs、test:contract-matrix、gen:contract-matrix --check、check:harness-events、包/exports守卫、git diff --check。文档链接通过不等于语义正确；矩阵声明全量前必须与生产声明比对。
