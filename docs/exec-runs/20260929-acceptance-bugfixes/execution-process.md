# 缺陷修复过程

2026-09-29，用户授权先写计划、再修复及验证。无提交/推送；保留原有5份文档改动。

1. 源码与既有日志证实：AgentLoop 在持久化 assistant/tool-call 后直接拒绝 scope，未写结果；下一次 provider 拒绝孤立 tool_calls。新增两个回归，未修代码时均失败，修复后通过。补混合合法/未知工具批次测试，确保整批不执行且全部有拒绝结果。
2. 子会话由 store 直接创建，checkpoint policy 仅查 RuntimeSessionController.getOpen，无法找到 child。引入 provider-owned 活跃登记与 scope 清理，保持严格 checkpoint flush。测试检查登记前后、释放后和真实持久化。
3. 新测试继续揭示独立读取故障：SessionReadModel 把 delegation preset 当 main preset，抛 Unsupported main Agent preset actspace.explore；改为 delegation 只读投影使用兼容 agent 形态，主会话未知 preset 仍严格校验。
4. 实机重试仍显示3个不可读会话，进一步确认旧 global index 未重试缺失项。新增已有空索引→store新child→browse 测试，红色结果 failed=1/items=[]；修复补读及缺失索引登记后通过。一次测试失败是 objectContaining 对嵌套完整对象的断言写法，改为 toMatchObject 深层部分匹配后通过，非重复产品修复。
5. 设置页开发说明替换为中英数字字体样例及代码样例。颜色/布局未改变。
6. Runtime与build并行首次测试遇到依赖dist生成期解析失败；依赖闭包build结束后单独测试通过，不算产品失败。
7. 使用完成构建的 Electron file renderer，隔离原验收data复验：旧Chat返回CHAT_RECOVERED_AFTER_FIX；Explore与agent两子任务分别completed，各一次read_file。重启无3个不可读提示，再打开新子会话能看到完整回复。字体预览样例可见，字号增减正常并恢复14/13。
8. 应用退出码0，复制凭据删除；未触碰Chrome登记。截图/AX见本线程CU记录，子任务脱敏记录见subagent-verification.json。

同类检查：mainAgentFormFromPresetId的生产调用仅此投影一处；主Agent创建resolveMainAgentPreset仍严格，不改。子Session创建入口仅OneShot provider，factory一个生命周期登记覆盖Explore和agent。工具批次拒绝改在统一loop，正常权限denied仍由ToolRuntime结算；已有正常工具测试确认结果不重复。

## 第二轮追加

用户选择启动屏障与 read_file 会话缓存隔离，图片错误后置。先明确方案和 C01–C04 验收点；分启动/模式路线及两个独立会话读文件路线执行。

- 新增真实 dev orchestrator 子进程测试：旧产物必须经构建更新才允许进入并发阶段；构建退出23必须终止。修复前两个检查均错误启动并退出91，修复后通过。
- 新增两个 session 使用同一 ports 首读测试，修复前第二个 session 返回 File unchanged，修复后正文返回；同会话重复命中与 force=true 保持。
- 产品改动仅两处：desktop-dev 在并发阶段前执行 build:electron；文件缓存键加入 sessionId。
- 真实开发日志 dev-20260929-210720.log：一次性 main/preload 构建先完成，再启动 Electron；CU Plan/Chat/Agent 切换正常。
- CU 会话 A/B 同一路径、offset=1、limit=200、force=false，分别一次 read_file completed，返回一致完整正文；截图与 AX 位于本线程工具记录，脱敏结果另存 JSON。
- 同类扫描：File unchanged 省略正文仅此文件工具路径；waitOn 文件就绪启动仅 desktop 内部 runner，正式 dev 入口现在增加屏障。未修改内部 runner 的单独调用约定及同会话压缩后缓存策略。
- 收尾：向本轮 dev 启动器发送 SIGINT，子进程退出；删除本轮临时凭据副本。check:docs 与 git diff --check 通过。
