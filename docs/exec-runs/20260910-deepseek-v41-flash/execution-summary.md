# 执行摘要

状态：实现完成，用户确认提交。

## 交付

- 正式 ID 与显示名 `deepseek-flash`；图片输入、1M 上下文、384K 输出能力、low/high/max 推理档位，默认 high。
- 移除 V4 Pro 候选和日期切换；旧 Pro/Flash 配置归一，优先保留已有 Flash 配置的启用状态、名称与凭据。历史 Journal 不改写。
- DeepSeek 设置页可更新目录并从目录添加；网络、缓存、IPC 按服务商隔离。未知 ID 不猜测工具、图片或价格。
- 费用沿用固定官方高峰 USD 估算：每百万 token 输入 0.30、输出 1.20、缓存读 0.006；历史费用快照不重算。
- Chat Completions 图片与 reasoning_content 回放同时覆盖直连和 scoped proxy。模型输出能力上限不抬高默认请求预算。

## 验证证据

- 仅含本次变更的隔离检出中，依赖构建通过；shared 72、LLM 22、Desktop 658 项测试全部通过。
- Desktop typecheck、renderer 与 Electron 构建通过。
- 真实 DeepSeek `/models` 请求成功；本地生成红蓝色块图片得到 `red blue`，输入 225、输出 2 token。
- Electron 隔离实例可启动，Composer 名称正确，DeepSeek 显示 1/1 模型。

## 人工验证边界

用户确认转入提交时，完整设置目录交互和浅深主题截图尚未完成。后续启动开发版，在设置 → 模型 → DeepSeek 中点击“更新模型目录”，检查成功状态；打开“从目录添加”，确认仅一个 Flash、没有 Pro，并在浅深主题下检查可读性。代理请求已有自动化覆盖，未进行真实代理网络验收。打包、签名与发布不属于本轮。
