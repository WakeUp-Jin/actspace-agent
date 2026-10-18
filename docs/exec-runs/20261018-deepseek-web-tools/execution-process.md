# 执行过程

- 2026-10-18：核对官方API与现有三层调用链，从最新 origin/main 创建功能分支。确认搜索启用状态已有存储但未被Runtime使用，本轮接通。

- 接入共享官方Key、DeepSeek独立搜索通道、RRF（k=60）融合排序和全局结果截取；付费抓取默认关闭，错误回退与实现缓存隔离。
- 设置的来源启用状态接入每次调用的Host快照；关闭搜索总开关时也不向Chat web门面注入搜索Key，抓取保持独立。
- 安装锁定依赖后，初次开发依赖构建遇到干净工作树制品顺序问题；完成 Runtime依赖闭包构建后开发构建通过。
- 特征测试发现DeepSeek重复出现在LLM与搜索凭据列表，修复重复ID后39项特征测试通过；golden只增加DeepSeek状态和默认关闭的抓取字段。
- Web工具19项通过；Desktop定向85项通过；全量1926通过/7跳过/1超时（compaction用例），该用例单独复跑通过。
- Desktop类型检查、renderer/electron构建及前端token/theme/bridge/IPC守卫通过。文档守卫314项旧截图缺失，HEAD归档基线同样314项，无新增。

- mock bridge补充23项回归通过；Computer Use完成主要mock路线，原生AX受限项如实未覆盖。
- 用隔离Electron真实preload IPC补验默认值、配置写入、磁盘JSON和进程重启读取，均通过，不使用真实Key或外部请求。脚本与脱敏结果已归档。
