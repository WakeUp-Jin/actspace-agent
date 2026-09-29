# 统一验收缺陷修复

用户要求根据验收结果制定修复计划、实施并复验。

- core agent loop：越界批次写拒绝结果，避免孤立tool_calls；旧历史通过请求投影补明确未知结果，不改写Journal。
- Runtime：provider-owned子会话加入活跃检查点登记并随scope释放；delegation投影不再误用main preset校验；索引重试缺失会话。
- 设置字体预览：替换开发状态文案为字体/代码样例。
- 自动化与真实Electron/Provider定向复验通过；完整边界见exec-runs/20260929-acceptance-bugfixes。原全量验收未覆盖项保持未覆盖。
- 学习记录命中可迁移、有陷阱与有模式：工具调用拒绝也必须协议结算。

## 第二轮追加：启动与缓存

用户要求优先修复 dev 启动竞态、read_file 跨会话缓存误命中，暂缓图片错误。启动器新增本轮 Electron main/preload 成功构建屏障，失败直接退出；文件读取缓存键加入 sessionId。新增进程顺序/失败阻断及跨会话首读回归，均有修复前失败证据。

真实 Computer Use 首次启动后模式切换成功；两个独立会话相同参数且 force=false，各一次调用均得到完整正文。自动化、类型检查及构建结果见[验收摘要](../../exec-runs/20260929-acceptance-bugfixes/execution-summary.md)。学习点具有可迁移性与易踩坑特征，记录于[缓存的作用域](../../learnings/2026-09/20260929-cache-consumer-scope.md)。未提交或推送。

## 提交与日志

用户后续授权将两轮已验证修复、回归测试、验收证据与文档合成一个本地 commit，并更新[更新日志](../../releases/feature-release-notes.md)。本次不包含原有的5份无关文档修改，不推送、不创建版本发布。图片连接错误与 Chrome 覆盖继续后置。
