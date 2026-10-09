# Review 资源测试执行过程

2026-10-08，按用户要求仅测试，不修复。读取当前编译产物和源码，确认无产品源码未提交改动；保留前轮验收文档改动。

1. 临时生成10,001 tracked/20,000 ignored文件Git夹具，另建30根/3,000子目录。测试脚本均外置临时目录。
2. 真实既有main69765基线，采用top MEM而非受压缩影响的RSS。子智能体仅打开工作区菜单时出现的短时交互不当纯空闲峰值。
3. compiled组件三组30秒路线（5秒idle/20秒写入/5秒恢复）和30根生命周期；用独立新进程time对照补齐Git子进程CPU。
4. gpt-6.1-sol真实选择夹具并打开Review，不发模型请求、不创建持久会话。父先完成组件负载后采真实idle30/ignored churn40/recovery30/ordinary save20秒样本。
5. 真实高频负载中差异文件折叠/展开正常，无现场可见卡顿。普通保存后恢复唯一fixture tracked改动。
6. 原目录picker自动化GoTo未成功，误登记夹具dist子目录，未写用户文件。改用现有工作区菜单切到actspace-agent，明确Review关闭、空新建页后，测idle20/旧根churn60/recovery20秒。
7. 结果：没测到大量持续内存增长，旧根后台活动平均31.46%单核CPU为确证开销；停止即恢复。产品实现不修改。

详见[摘要](execution-summary.md)、[逐项真实界面记录](computer-use-results.md)。测试原始top输出、脚本与夹具留在environment.json记录的临时目录，仅用于复现；UI临时登记由子智能体收尾隐藏。

8. 收尾：子智能体停止所有UI动作并确认可用页。父调用已有workspace-registry service仅隐藏精确2个临时测试ID；保存restoration.json，断言其它条目及默认workspace不变。未改产品代码，未提交/推送。
