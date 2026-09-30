# 压缩耗时与辅助模型路由修复

- 状态：完成；定向自动化与 Electron 验收通过，完整原功能验收边界另见原报告。
- 日期：2026-09-30
- 执行模式：交互；用户已确认方案，实施和定向验收可连续执行。
- 依据：原 Computer Use 验收发现的 B01（压缩耗时遗漏摘要等待）与 B02（压缩忽略辅助模型绑定）；定向复验见 [修复报告](../../exec-runs/20260930-compaction-duration-utility-fix/execution-summary.md)。

## 目标与边界

真实摘要调用的耗时持久化到 compaction/end.durationMs，客户端重放优先使用该值；旧 journal 仍按 start/end 时间差处理。摘要失败不得写入半条压缩事务。压缩默认优先 utility 路由，显式 routeId 优先级最高，没有 utility 的 CLI 回退首个可用路由。沿用桌面 adapter 每次调用读取辅助模型设置的行为。

保留工作区已有改动；只修复上述两个问题，不扩展普通模型错误展示或摘要质量。

## 实施顺序

1. 在 packages/compaction/src/test/compaction.test.ts 与 lifecycle.test.ts 增加真实耗时、失败原子性和路由优先级回归；在 packages/client/src/test/compaction-projection.test.ts 覆盖持久化优先和旧格式兼容；桌面 thinking-options 测试覆盖辅助模型热更新。
2. 在 packages/compaction/src/plugin.ts 计时并选择路由；在 packages/session/journal/src/compaction.ts 添加可选完成事件字段；在 packages/client/src/sessions/chat.ts 优先投影持久化值。
3. 运行 journal、compaction、client、桌面相关测试及类型检查；启动更新后的 Electron。
4. 执行下列定向 Computer Use 路线，保留关键截图和脱敏 journal 证据；同步设计规范、原验收结果、history 和执行记录。

## 验收点

- F01：手动压缩进行中可见计时，完成耗时包含摘要等待，切换会话和重启后数值保持。
- F02：自动压缩也显示并持久化真实耗时。
- F03：主模型正常、utility 配置失败时压缩失败，恢复辅助设置后重试成功；压缩失败不提交替换事务。
- F04：辅助模型修改后的下一次压缩使用新设置；模型与 routeId 由 journal 元数据佐证。
- F05：旧事件无 durationMs 仍可展示；显式路由优先、无 utility 回退；仅自动化检查，不声称真实 CLI 验收。

## 操作分组

- 会话路线：复用原验收会话，手动压缩、切换返回、触发自动压缩，覆盖 F01/F02；记录进行中与完成状态、完成事件。
- 设置路线：辅助模型及连接故障→压缩失败→恢复连接→重试成功，覆盖 F03/F04；保留错误、成功、路由证据，最后恢复原设置。
- 重启路线：正常退出并启动 Electron，复查新完成分隔线，覆盖 F01 的持久化；旧数据兼容由 F05 自动化补充。

## 风险与回退

不提前写 compaction/start，避免失败残留事务；durationMs 为可选扩展字段，不迁移旧文件。临时设置改动验收后恢复。若外部模型不可用，标记相应界面项未覆盖，并保留自动化结果及故障证据。
