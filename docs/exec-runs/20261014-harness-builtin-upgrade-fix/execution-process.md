# 执行过程

- 2026-10-14 用户确认修复 Q1 与 C1，保护原有未提交工作。
- 以原选择日志副本复现：旧内置 revision 2、Host 指纹变化、HMR 普通 Error、RunManager blocked=true/paused=false/pending/no Run。
- 新增回归先运行失败：Control 两例失败，HMR 两例失败。
- 实施连续可信内置升级、未变化不写修订、保留恢复错误码；Control 28、HMR 5、AgentService 33 测试通过。
- C1 保留原两轮数据，补第三轮单文件并同步文档；进入构建与实机验证。

- Desktop 定向 40、Runtime 5 项通过；总计 111。Desktop 类型检查、依赖/Electron 构建通过。
- gpt-6.1-sol 正常退出原应用后重启；原选择历史 2→3，前两条逐字保留，新记录为 trusted-builtin-upgrade。
- 实机受缺失 trajectory.css 阻塞，此文件由原有 index.css 引入，本次没有修改该引用；保留真实发送、present 与 mock 交互未覆盖状态。
