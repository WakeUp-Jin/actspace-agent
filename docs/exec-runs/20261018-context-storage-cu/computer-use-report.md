# Context / Session 联合 Computer Use 验收

执行者：gpt-6.1-sol；日期：2026-10-18。状态：本轮结束，存在失败与未覆盖项。仅验收，未修改业务源码、修复或提交。

## 环境与证据边界

- Electron：Actspace Dev actspace-agent-2067 / `com.actspace.desktop.dev.w2067fa05`，renderer `127.0.0.1:5178`。
- 首屏确认测试工作区 `/tmp/actspace-context-storage-cu-20261018/workspace`，数据根 `/tmp/actspace-context-storage-cu-20261018/desktop-data`；未改真实用户配置。
- UI全程使用CUA原生app，无CDP、DOM注入或浏览器mock。Chromium内容AX/截图单次约60秒；跨调用旧索引可能失效，按当前观察重新定位。部分AX diff滞后于截图，实际截图作为视觉判断依据。
- Provider为本地受控fixture、合成凭据，模型容量32768；真实read_file、Session、IPC、压缩和SQLite链路运行。不证明外部Provider兼容性或摘要质量。
- SQLite移除、配置修正、历史/附件种子与日志核对由主智能体执行，不冒充UI操作。
- 验收期间其他开发者通过HMR加入ContextPaths.tsx路径UI（约19:11）；C5按现场版本检查，不能继续使用初始交接文档“尚无UI”的旧边界。

## 验收点与最终结果

“部分覆盖”表示该编号仍有未覆盖子项，不能视为整体通过。

| ID | 检查范围与预期 | 最终结果与证据 |
| --- | --- | --- |
| C1 | 工具后多Step刷新Context估算、明细、趋势、最近请求 | **通过（单工具批次代表场景）**。初轮6Step终态；受控大工具结果后≈15.8K→23.9K、工具结果明细新增，压缩后Step2更新≈14.7K。见[工具后中间态](evidence/c2-compaction-hold.png)、[Step2](evidence/c2-post-compaction-step2.png)。未覆盖并行多工具批次。 |
| C2 | 工具完成跨阈值自动压缩并继续下一Step | **通过（本地fixture）**。“正在压缩上下文”→“上下文已压缩·23条消息”→最终回复；摘要≈70、周期1、最近请求第6轮Step2。见[等待态](evidence/c2-compaction-hold.png)、[完成态](evidence/c2-post-compaction-step2.png)。 |
| C3 | 压缩可取消；失败可辨识且有可操作收尾 | **失败**。CU-01：Stop禁用，Escape后仍压缩。CU-02：6次受控摘要HTTP400后主任务完成，但终态无持续失败/重试提示。见下方复现与[自动失败终态](evidence/c3-auto-failure-final.png)。 |
| C4 | 切会话、关闭重开Context不沿用旧数据 | **通过（实际路线）**。真实会话23K/70%、路径3/0→长历史会话“当前没有可展示的上下文”→切回并关闭重开面板，恢复23K/70%、7轮19步与路径3/0。见[切换](evidence/c4-switch-long-history.png)、[重开](evidence/c4-context-reopen.png)。 |
| C5 | 路径接口投影、活跃/睡眠卡片与列表/空态 | **部分覆盖**。周期0→1，活跃3/100、睡眠0；展开活跃含journal.jsonl、large-evidence.txt、result.txt；AX Help含完整路径，复制全路径按钮可见；睡眠空态可见。见[活跃列表](evidence/c2-post-compaction-step2.png)、[睡眠空态](evidence/c3-auto-failure-final.png)、[完整路径AX](evidence/c2-post-compaction-step2-ax.txt)。未点击复制，未覆盖非空睡眠/唤醒/100条上限/分页/接口异常。接口正确性由主报告后端证据负责。 |
| S1 | 超过512事件后早期历史仍可加载阅读 | **部分覆盖，冷历史边界未通过验收**。真实620chunk回复及重启后的CU-EARLY-000/Todo可读；180轮种子1442事件，分页160→140→120，未实际看到115或更早（驻留窗口约始于116），未证实跨窗口加载。见[620chunk与Todo](evidence/s1-stream-complete-light.png)、[分页截图](evidence/s1-early-history-after-restart.png)。该文件名不代表到000，图中可见151附近。 |
| S2 | 重启恢复会话、标题、模式、Todo与Context | **部分覆盖**。两会话标题/消息、Pending Todo恢复；Context恢复且后续可运行；种子最新179与附件消息可见。模式持久化未独立验证；主智能体在重启时修正模型绑定，不把fixture-alternate→fixture-main视为原选择恢复。见[重启后种子](evidence/s3-seeded-image-after-restart.png)、[恢复后真实会话](evidence/s3-image-only-sent.png)、[Context](evidence/c4-context-reopen.png)。 |
| S3 | 附件重启可读、预览与分叉访问 | **部分覆盖**。生产ArtifactStore种子附件重启后渲染并预览；后续真实UI图片选择后直接发送成功，主机hasImage=true/attachments=1/文件落盘。分别证明读取恢复与UI提交，不能合成UI上传后重启完整链。分叉访问未覆盖。见[种子预览](evidence/s3-seeded-image-after-restart.png)、[上传草稿](evidence/s3-attachment-draft.png)、[发送后](evidence/s3-image-only-sent.png)。 |
| S4 | 移除隔离SQLite后恢复执行、Context查询与历史搜索重建 | **部分覆盖**。主机备份移除SQLite、事实哈希未变、重建catalog=2；UI可打开两会话、读附件、继续真实工具与压缩、查询Context。仅打开搜索入口，未执行正文查询。SQLite数值/哈希是主机证据，不是CUA推断。见[恢复读取](evidence/s3-seeded-image-after-restart.png)、[恢复后执行](evidence/c2-post-compaction-step2.png)。 |
| V1 | 浅深主题聊天、Context、路径、附件及异常视觉回归 | **部分覆盖**。浅色关键状态布局/文字/按钮/路径/附件已实际观察；未执行深色切换，深色未覆盖。 |

## 分组路线与实际执行

1. **新会话运行→失败收尾**：Agent执行FIXTURE_LONG，查看Context完成态、趋势、事件，再尝试/compact。覆盖C1初态与C3配置失败收尾。
2. **长历史与附件→退出重启**：FIXTURE_STORAGE CU-EARLY-000→FIXTURE_TODO→原生文件选择器valid.png→正常Cmd+Q。主智能体合并修正测试绑定、备份移除SQLite、通过生产接口追加历史/托管图片种子后重启。UI检查恢复、预览、分页、图片再次上传，覆盖S1–S4部分子项。
3. **受控Step/压缩→异常→切会话**：tool-hold/summary-hold保存中间态；释放工具，核对压缩中Stop与Escape；释放摘要观察Step2与路径；summary-error再跑6Step；切种子再切回、关闭重开Context。覆盖C1–C4及C5部分。随后停止扩展，搜索查询、深色、分叉未执行。

## 问题复现与证据

### CU-01：压缩中无法从UI取消

1. 正确绑定utility model，大工具结果使Context跨≈16.8K自动压缩阈值。
2. Provider保持摘要响应；UI显示“正在压缩上下文”“正在总结较早的消息”。
3. Stop灰显，AX为“按钮 (disabled) 正在压缩上下文，压缩完成后可继续”。
4. 按Escape后仍在压缩且持续时间增长；最终由主智能体释放摘要，继续其他验收。

证据：[等待截图](evidence/c2-compaction-hold.png)、[等待AX](evidence/c2-compaction-hold-ax.txt)、[Escape后AX](evidence/c3-escape-during-compaction-ax.txt)。主智能体补充源码定位ComposerToolbar.tsx因isCompacting禁用Stop、后端已有signal；源码不替代UI事实。

### CU-02：自动压缩失败结束后没有持续失败/重试提示

1. Provider设summary-error（摘要HTTP400）、工具不hold，更新隔离大文件避免未变短路。
2. UI发送 `FIXTURE_LONG 自动失败场景`，完整执行6Step。
3. 主机记录Provider16–27与6次摘要HTTP400；UI终态“Fixture completed: fixture-main.”、第7轮19步、Context≈23K/70%。
4. 聊天终态没有持续“压缩失败/重试”。只观察到终态，**没有声称现场见过提示随后消失**。

证据：[终态截图](evidence/c3-auto-failure-final.png)、[终态AX](evidence/c3-auto-failure-final-ax.txt)。主任务可完成，但压缩失败缺少可操作收尾。

## 测试配置与观察项，不计产品缺陷

- 首轮无摘要HTTP请求，/compact报provider_disconnected。主智能体定位为隔离seed-settings旧update调用被忽略、utility/default未绑定；生产settings.updateV2修正后C2成功。[首轮失败提示](evidence/c3-compaction-failed-light.png)证明失败文字/重试与暂停队列可操作，不将配置失败算产品Bug。
- 首次图片附加AX出现缩略图/预览/移除，随后paste文本再发送，主机hasImage=false/attachments=[]。缺可靠同屏已附加截图，不能排除上传时序/焦点，仅记观察项；第二次选图后直接发送成功。首轮[发送后截图](evidence/s3-attachment-before-restart.png)不证明附加态。
- 成功压缩后第2Step直接结束，因为fixture摘要未保留FIXTURE_LONG触发词。主机下一请求hasSummary=true，不计产品问题。
- Chromium缓存目录启动警告由主机记录；原生窗口、工具与SQLite实际可工作，没有仅凭警告判产品失败。

## 定向补验缺口

修复CU-01/02后复验取消与自动失败保留；补齐180轮历史跨116窗口、模式持久化、真实UI上传后再次重启、分叉访问、SQLite重建后正文搜索、非空睡眠/唤醒与深色主题。未执行项不以源码、种子生成或终点截图代替通过。
