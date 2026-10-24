# 压缩后历史图片恢复：BUG-051闭环

本批主侧串行修复，实际gpt-6.1-sol/high执行原生，另一同模型等级智能体只读审查授权边界。真实Electron、公开只读IPC、Journal/磁盘与工程测试分别列证；没有远端UI或商业端点补签。

## 版本与根因

修前HEAD00d6b763+296源码c5152219/2342制品d043744e。实际/compact后历史消息仍展示，但当前snapshot.messages只含摘要及最后助手。Desktop resolveArtifact只查当前snapshot，冷启动时拒绝仍归本Session的历史图片；rollback也可能误清历史附件。详见[BUG-051](bugs/BUG-051.md)。

修后固定298源码`cd43ecdb18d93ab236460d06358020932bfec5e6e829e46e4027facd7e5dfef7`/2342制品`b4acff273c9b5f446283b7b5c0a3731dc85f96b94871973ee3df24600f22130d`，包含未提交代码。原296源码不变，增加此前clean的registry与新test。实际构建仅registry的d.ts/js/map变化；静态file renderer无HMR。

引用缺失时仅从该Session已验证Journal append的content找结构化artifact，继续owner/MIME/size/SHA校验；rollback保护历史引用。无schema/Journal改写、renderer路径授权或缓存持久化。Host/CLI同形审查未发现当前上下文过滤；不据此签远端交互。

## 逐点结果

| 点 | 必需方法与结果 | 证据 |
| --- | --- | --- |
| B51-0修前复现 | 真原生：历史Preview disabled且同屏5条消息/164字摘要；正常退出 | native-evidence/01–02；修前readonly-probe显示历史有ref、当前无ref且readArtifact not_found |
| B51-1历史实际打开 | 真原生：同旧消息缩略图恢复，点击打开owned-image.png Image Tab及AX图像，无loading/error | 03–04 PNG/AX |
| B51-2往返无串位 | 真原生：展开原Worked、inspect、bash和摘要，收起/关闭后同图实际重新打开 | 05–06 PNG/AX；未发送/重新压缩 |
| B51-3源缺席冷启动 | 真原生：正常退出后主侧仅暂移自有源PNG，冷态实际打开同历史图 | source-held.json、08 PNG/AX/UTC；公开readonly IPC返回74B image/png+dataURL仅作旁证 |
| B51-4事实与恢复 | 真原生正常CmdQ及主侧独立核对通过 | 09–10；main-restoration-proof.json：两次修后exit0/PID消失，整Journal字节不变，原HTTP仍7，受保护文件/298源码/2342制品无漂移 |

完整原生报告、冻结清单、红绿及主审证据均在[本批目录](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/bug051-history-image-20261024/native-evidence/report.md)。原图真实2×2、74B，右侧自然intrinsic小色点；不夸称大尺寸预览。此图用于同原图片与artifact恢复回归，大图及系统Preview/Finder原M17证据仍保留各自版本。

独立[授权审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/bug051-authorization-review-20261024/report.md)A1–A5完成，0确定问题；当前无已交付历史引用撤销语义。工程7项修前5失败/2通过→修后7通过，Desktop全量2014通过/7跳过、typecheck、Electron构建、Host安全5项与文档检查通过。测试模拟压缩后投影，真实压缩/冷启由本批自然历史和原生证据承担，不互相冒充。

原始真实Purpose Journal与artifact、bug051副本Journal与artifact均保留。整Journal248874B、SHA`09b040a4d49da3ec1d356f2acc63b1a9262cb6cb4a16a53b1f874b276a957d12`逐字相同，未新增模型请求或Run。源PNG先恢复原名/字节核验，再仅清理验收自有PNG与空的唯一Desktop文件夹；Provider此前已停止，未操作用户数据或安装版。

## 回填

BUG-051复验关闭；P2-D17结合原媒体/网络完整证据恢复通过，D06为定向回归、不改变其原结论。全局165项104通过/0失败/61未完成；51Bug50关闭，仅BUG-039待真实OS派发。该计数是各原编号注明方法/版本的累计结果，不声称新制品全项目重跑。整体验收仍未完成，无提交/推送。
