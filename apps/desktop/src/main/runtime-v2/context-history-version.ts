/**
 * 上下文历史投影的口径版本，口径变化时加一：老会话第一次打开面板时整会话重建。
 * 1：初版；2：新增 Bash 命令统计；3：Bash「值得注意」（最慢 / 重复命令原文、后台调用数）；
 * 4：估算改由日志折叠（agent-spec-request-record.md），不再读 `request/context` 里的明细；
 * 5：上下文事件带标题、说明、轮 / 步位置和 token 增减，补充按来源分类，同轮同来源连续更新合成一行（front-Context面板规范.md §2 第 6 块）。
 * 单独成文件，主进程只引这个常量，不加载投影代码。
 */
export const CONTEXT_PROJECTOR_VERSION = 5;
