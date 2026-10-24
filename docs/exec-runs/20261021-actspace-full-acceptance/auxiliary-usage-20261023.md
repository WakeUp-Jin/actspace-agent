# 辅助模型请求用量验收（2026-10-23）

对应 BUG-045、F1-07 与 F1-09。修复与回归细节见 [Bug](bugs/BUG-045.md)。

`gpt-6.1-sol` 在当前构建真实 Electron 中以原生 AX/键盘完成标题、手动压缩、自动审批 Bash、Usage、双主题及正常退出重开。逐点 [R45-1–5 原生报告](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/bug045-native/report.md)；HTTP、Journal、SQLite 与公开 preload 查询为独立旁证。

| 实际请求 | 请求数 | Token | Run 贡献 |
| --- | ---: | ---: | ---: |
| 主模型 | 4 | 480 | 3个真实Run、4步 |
| 标题 | 1 | 14 | 0 |
| 手动压缩 | 1 | 22 | 0 |
| 自动审批 | 1 | 30 | 绑定已有工具Run |
| 合计 | 7 | 546（451输入、95输出） | 3 |

真实无害 Bash 输出及 exit0 已核对。辅助事件 surface 均为空，Chat/Context 未混入计量事实；轨迹展示用途、实际模型、attempt与用量。全局模型请求47→54、Token30326→30872；会话summary/daily同为546 Token、3Run、1工具。正常重开后五组逐字段比较相同，HTTP仍7次，没有重计。全部本批费用未知，不作为商业账单证据。原设置、主题及选中会话已恢复。

## schema14 副本迁移检查

主智能体另复制已正常关闭的自有验收 profile 数据库及本次会话 Journal，在新隔离 profile 将副本 schema 标记为13；原 profile 未改动。当前生产应用启动后 schema14、原错误索引与游标已清除；公开 Usage 查询触发按需重建，SQLite得到8活动（7模型、1工具）、546 Token及3个真实Run，与公开summary一致。见 [夹具声明](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/sidebar-pagination-native-20261023/fixture-manifest.json)、[迁移核对](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/sidebar-pagination-native-20261023/migration-reconciliation.json)。已有自动化数据库回归也验证schema13→14和重复读取不重计。

这属于生产索引的受控副本重建与只读核对，不是原生操作，也不代表真实旧版本升级。R45-5原生报告明确未观测迁移过程，该限制由本节独立证据补充；全项目真实旧版本迁移仍保留原覆盖缺口。初始核对脚本曾误用kind=llm，改为实际llm_request后断言全部通过，未改产品或夹具数据。

BUG-045关闭；结合既有explore/视觉/用途路由证据，F1-07通过。F1-09商业余额、管理Key等原有缺口仍保留。
