# @actspace/subagent

子智能体管理器与工具定义。`SubagentManager` 实现 Host 端口 `SubagentHostPort`：创建（同步或后台，同步超时转后台）、`agent_fork`、`send_message` 续派与插话、`wait_agent`、`list_agents`、`interrupt_agent`、`list_subagent_models`，以及完成通知、唤醒空闲的主会话、重启后补 `lost`。

- 每个子智能体一个 child Session（lineage 指向主会话），预设 `general` / `explore`，工具集在创建时固定；子智能体不弹审批，继承父会话的权限模式和会话授权。
- `agent_fork` 复制主会话到「当前轮最后一个完整步骤」（`fork-boundary.ts`），按主 Agent 组装：系统提示词、工具列表和模型与父会话相同，首个请求能命中父会话的缓存；子智能体不能用的工具在执行时拦下。
- 每次激活写一对 `subagent/activation`（`start` / `settle`）；状态只从主会话 Journal 折叠，内存里只留正在运行的激活。
- transcript 路径由 Host 给出，每步之后刷新；模型可见文字全部在 `messages.ts`，与设计 02 §2 逐字一致。
