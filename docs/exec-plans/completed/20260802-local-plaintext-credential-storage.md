# Actspace 本地明文凭据存储迁移

## 目标

让开发版与本地安装版继续共用 `<userData>`，将 `secrets.json` 从依赖系统安全存储的 v1 密文升级为主进程专用的 v2 明文凭据文件，并以 `0600` 权限、原子写入和失败保护保证本地更新与重启后的稳定读取。

## 范围

- 包含：`secrets.json` v1 到 v2 迁移、凭据文件权限、不可读状态保护、renderer 脱敏状态、自动测试和安全文档。
- 不包含：多套开发/正式配置、云同步、凭据导入导出、可切换 keyring/file 后端、真实供应商调用验收。

## 背景

- 相关文档：`docs/SECURITY.md`、`docs/design-docs/model-context/agent-multi-provider-llm.md`、`docs/design-docs/frontend/front-设置页规范.md`。
- 相关代码路径：`packages/desktop/src/main/settings-service.ts`、`packages/desktop/src/main/index.ts`、`packages/shared/src/settings.ts`、`packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`。
- 已知约束：Key 只在 main 进程使用；renderer 只接收配置状态；开发版和安装版固定共用 `~/Library/Application Support/actspace`。

## 风险

- 风险：迁移时部分密文无法解密，或无效凭据文件被后续保存覆盖。
- 缓解方式：先在内存中完成全部解密和校验，再原子写入 v2；任何读取或迁移失败都保留原文件、标记只读阻塞并向设置页返回脱敏错误。
- 风险：原子写临时文件继承默认 `0644` 权限。
- 缓解方式：凭据临时文件创建时显式使用 `0600`，rename 后再次修正目标权限；启动读取 v2 时同步修复旧权限。

## 里程碑

1. 定义 v2 明文格式、读取状态与迁移事务。
2. 接入脱敏 UI 状态并覆盖保存、移除、搜索与图片 Key 路径。
3. 完成迁移、权限、重启和失败保护验证，更新文档后归档计划。

## 验证方式

- 命令：Desktop 聚焦单测、renderer 设置页单测、Shared/Desktop typecheck、仓库文档与密钥扫描、`git diff --check`。
- 手工检查：由用户自行执行 Actspace 设置页、正式版/开发版交替重启和真实供应商连接验收。
- 观测检查：启动日志只记录凭据存储状态码和文件路径，不记录 Key、密文或原始文件正文。

## 进度记录

- [x] 确认共享 userData、当前 v1 密文格式和静默失败链路。
- [x] 完成 v2 迁移、权限和写入阻塞。
- [x] 完成 renderer 脱敏错误状态。
- [x] 完成测试、文档与计划归档。

## 完成说明

- 自动验证：Shared build、Desktop typecheck、密钥泄露扫描、`git diff --check` 通过；SettingsService、服务商设置和设置页共 74 条聚焦测试通过。
- 仓库完整 Desktop 测试共 752 条，其中 750 条通过；`app-streaming-user-message.test.tsx` 的 waiting approval / failed 两条 sidebar 状态断言在整套和单文件运行中均失败，与本计划改动路径无交集，未在本任务中扩展修复。
- 人工边界：未启动或重启真实 Actspace，因此没有修改用户当前 `secrets.json`；v1 到 v2 的真实迁移、开发版/安装版交替启动和 UI 验收由用户自行执行。

## 决策记录

- 2026-08-02：保留开发版与安装版单一配置目录，不引入双配置或可切换存储后端；本地凭据改为 `0600` 明文文件，以跨构建稳定性优先，并继续维持 main-only 进程边界。
