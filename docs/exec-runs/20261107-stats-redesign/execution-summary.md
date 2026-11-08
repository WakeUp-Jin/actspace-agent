# 执行摘要：统计页重做

- 数据层：usage 读模型 v18 改成小时汇总，`queryUsageActivity` 一次查出全部卡片数据，请求明细在服务端分页。Harness 表删 7 张、停采不显示的数据，新增 Bash 程序和 Skill 文件两张表。删掉 `usage.getStatistics` 通道和 usage-source-cache。
- 使用统计页：5 张指标卡、Token 和耗时两个环形图、用量趋势、活跃度热力图、4 个排行榜、底部 6 个明细 tab 加悬停卡；偏好存在 `activity.usage`。
- Harness 统计页：值得关注、5 张带「比上一版本」的指标卡、7 张卡片、底部 5 个明细 tab。
- 共用件放在 `components/stats/`，样式在 `styles/stats.css`。
- 验证：自动检查全部通过，浏览器 mock 两页截图都看过。还差 Electron 真实数据走查。
