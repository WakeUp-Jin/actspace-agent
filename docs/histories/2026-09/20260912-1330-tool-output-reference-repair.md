# 工具输出引用、图片协议与失败反馈修复

用户发现安装态会话在工具执行后突然停止。分析确认长 Bash 输出被保存为 text/plain artifact，随后 Core 无条件转换为图片，使下一次请求在 DeepSeek 本地校验阶段失败。用户要求恢复有界输出、文件回读及图片历史引用的原设计。

## 改动

- Core 按 MIME 区分普通文件与图片，文件通过 Host 的 Session resolver 获得可读路径及分页/搜索引导；request snapshot 保存归一化逻辑输入，既有 Journal 无须迁移。
- Desktop/CLI 接通受管输出文件回读。读取与搜索仅允许本 Session 文件，保留 metadata、digest、realpath 检查。
- pi-ai 与 legacy adapter 正确处理工具图片、并行调用顺序和 text-only 模型；图片字节仅在 wire 边界读取。
- turn/end 保存脱敏失败信息，live 与 durable projection 均显示原因；旧失败日志有通用提示。
- 新增当前设计说明与学习文档；原工作区变更保留，未更新安装包。

## 验证

两条核心回归先失败再通过。Core 13、LLM 29、Tool Runtime 18、Core Tools 17、CLI 13、Desktop 670 项测试通过；真实 Bash 大输出至文件回读贯通，>1 MiB 搜索通过。Runtime 依赖闭包、类型、renderer/Electron/CLI 构建和文档检查通过。

安装包更新、真实 Provider 与 Electron 安装态验收未执行。详见[执行摘要](../../exec-runs/20260912-tool-output-references/execution-summary.md)。
