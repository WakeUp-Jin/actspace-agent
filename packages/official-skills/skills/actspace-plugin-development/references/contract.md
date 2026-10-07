# 工具源码契约 v1

工作区只有 tool.json 和 implementation.ts 参与构建。工具名创建后不变；tool.json 包含 name、description、inputSchema（type=object）。implementation.ts 导出 async function execute(args: Record<string, unknown>): Promise<unknown>，返回有限、可序列化的 JSON。抛出 Error 表示失败。

首版支持无外部 import 的单文件 TypeScript。可使用 ECMAScript 标准库进行文本和数据加工。不能新增 Host 服务、Codec、依赖安装脚本；初始化不发网络请求，不启动后台任务。不把运行时目录或进程内存当作持久状态。

系统生成 Cordis wrapper、Tool ABI 2 定义、process 权限声明及注册清理代码；不能通过修改元数据移除权限。候选在同进程可信执行，绝不是恶意代码沙箱；prepare 和 apply 由 Host 审批。版本由固定内容摘要标识，旧版本不覆盖。

inputSchema 支持现有 Runtime 校验器的子集：type、properties、required、additionalProperties、items、enum、const、default、minItems/maxItems、minLength/maxLength、pattern、minimum/maximum，以及 title/description。根 type 必须为 object；不支持 $ref、oneOf 等组合关键字，构建会明确拒绝。类型为空的叶子 schema 表示任意 JSON。

状态 editable → built → ready → bound 分别表示可编辑、固定构建成功、候选已初始化、会话绑定已提交。status 在重启后会把失效的内存候选恢复为 built，重新 prepare 后再 apply。初次修改要回退到基座时，可对原 workspaceId 使用其 source.executionDigest；以后可使用 harness_inspect 返回的历史 digest。回退产生新的局部选择，不改 main。
