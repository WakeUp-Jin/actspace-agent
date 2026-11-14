# @actspace/subagent

子智能体管理器与工具定义。`SubagentManager` 实现 Host 端口 `SubagentHostPort`（`actspace.host.subagents`）。行为规则见[子智能体运行规范](../../../docs/design-docs/collaboration/agent-subagent-runtime.md)，这里只说代码在哪。

公开入口：`.`、`./manifest`、`./plugin`。

| 文件 | 内容 |
| --- | --- |
| `manager.ts` | 创建、fork、同步等待与转后台、登记后台任务、`send_message`、界面停止（`stopByUser`）、编辑重发停止（`stopAll`）、重启后补 `lost`（`recoverLost`）、`spawnExternal`、外部记录文件放行（`isExternalRecordPath`） |
| `child-session.ts` | 创建子会话（lineage 指向主会话） |
| `preset.ts` | `general` / `explore` 的工具集与子智能体不能用的工具 |
| `fork-boundary.ts` | `agent_fork` 复制到哪里为止 |
| `messages.ts` | 模型可见的全部英文：工具描述、参数说明、返回与错误文字、追加在任务后的说明。改措辞只改这里 |
| `tools.ts` | 四个工具和外部工具的注册函数（`registerSubagentTools`、`registerExternalSubagentTool`） |
| `external.ts`、`external-cli.ts` | 外部子智能体的后端接口（`ExternalSubagentBackend`）、找命令与结束进程（`resolveCommand`、`terminate`） |

测试：`pnpm --filter @actspace/subagent test`。
