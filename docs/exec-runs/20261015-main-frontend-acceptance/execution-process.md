# main 前端统一验收执行过程

- 2026-10-16：用户批准完整验收计划，要求直到计划完成；只验收、不修复，记录 Bug 原因、背景及建议。
- P0：复核 main `00e5a159d2bc45fe6f6a7ec4d4da7a5162a9f745`，Git 只有本次计划与台账文档改动。建立 `tmp/codex-acceptance/20261015-main/execution-baseline.json`。
- 统一构建：规划前依赖、renderer、Electron 构建均退出 0；批准时源码未变化，复用统一产物。工程检查将核对该版本。
- 分工：gpt-6.1-sol 三组分别覆盖轨迹/统计、模型/轮尾、侧栏/工作区。全部只写临时证据，无修复授权。
- 工具限制：三组原生 CUA 均出现 `unsupported Codex auth method: apikey`，按计划转用隔离 Playwright Electron/浏览器。报告分别注明真实 Electron、mock、Provider、测试/源码证据。
- 工程测试集中运行；计算性能及浏览器帧采样在重负载测试结束后进行，避免把测试满载当成产品帧表现。

- P3 工程：Desktop 全量 1917 通过 / 7 跳过；类型、相关包、Harness 恢复及规则全通过。独立计算性能 5 项通过（2000 chunk p95 0.368ms）；普通事件重建 p95 22.543ms 保留 O01。
- 补充真实 Electron 验收 11 项通过，隔离目录清理；projection-cache 2、runtime session-projection 15 项通过。
- 发现并记录 MN01 灰色失败行、MN02 停止/失败终态丢部分正文、MN03 重试模型用时漏计；仅追踪源码与数据，不修复。

- P1/P2三组结果：真实正文/详情增长、新词搜索、OFF/ON、长历史统计与真实present完成；停止恢复通过但发现正文丢失。侧栏、默认工作区迁移/移除/重开、Harness连续升级与升级后运行链路完成。
- 细节补验：模型9个路由浅深×1440/480共36组合，连接异常状态、混合未知费用、120行420px diff内部滚动，隐藏改动后图片/交付仍显示并可预览。均为隔离证据，分别注明真实Provider或fixture方法。
- 新记录MN04搜索Esc焦点BODY；4个确认Bug与已有O01性能观察分开，不进行修复。
- H02原结果末尾摘录误取种子B会话，已取得A会话精确脱敏Journal摘要，按实际completed/aborted/present事件作为结果依据，原宽泛字符串计数不作为工具次数。
- 收尾补验SB08非空正文保存和W05目录加载期间响应；系统外部打开/Finder最终态及DSH双页视觉保留明确未覆盖条件，不把UI反馈或CSS源码当成真实终态。

- 补验结果：SB08两条非空正文Journal原UTF8字节及业务元数据重置前后相同；W05真实Host目录IPC仅在自有进程异步延迟15秒，pending期间导航B/菜单280ms响应。两项通过，补验进程及私有数据清理。
- P3收束：60点53通过、5失败、2部分覆盖，无待执行主项。4个Bug独立交接；T18双页渲染对比、D05系统最终态/首次查询保留未覆盖子项。原旧HMR、远端、Word/Excel、旧二进制等范围边界另列。
- 本轮计划归档completed，4份验收Markdown与索引同步。最终源码指纹、清理与文档检查记录见final-fingerprint.json和final-docs/final-diff日志；未修改产品、正式测试或配置，未提交。
