# 外部参考资料

这个目录沉淀值得长期放进仓库、供 Agent 直接读取的外部参考材料，应是经过筛选和整理的资料，不要把大段供应商文档原样塞进来。第三方视频截图、过期的调研草稿和已被设计文档取代的底稿不保留，需要时查 git 历史。

## 现有资料

- `dsh-self-modification-20261007.md`：DeepSeek Harness 自修改机制的源码级调研，是[自进化总体架构与 DSH 借鉴边界](../design-docs/自进化的方案设计/05-总体架构与DSH借鉴边界.md)的依据。
- `sandbox-research-20261022/README.md`：沙箱调研原稿（nono / DSH / Windows 方案与 Mac 性能实验）；当前决策见[沙箱设计](../design-docs/execution-safety/agent-沙箱设计.md)。
- `minecontext-architecture-analysis.md`：MineContext（字节跳动开源）上下文分类体系与主动推送机制的源码级分析：六种认知对齐的上下文类型、四大定时推送任务的级联信息流、双通道检索机制。
