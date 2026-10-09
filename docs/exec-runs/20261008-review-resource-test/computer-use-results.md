# B03监听资源开销：真实桌面交互观察

本轮仅测试、不修复、不改产品代码、不发模型请求。指定gpt-6.1-sol操作同真实Electron main69765 / com.actspace.desktop.dev.w2067fa05；CUA与已授权原生AX交互、专属window21510截图。CPU/RSS/top MEM与独立compiled监听benchmark由主智能体记录，本报告不以资源采样冒充UI响应，也不以UI正常推断资源占用低。

## 验收点

| 编号 | 行为与预期 | 结果 |
|---|---|---|
| R1 | 原空新建页空闲时界面正常 | 通过：实际绑定空新建页/空消息框/发送禁用；[空闲](screenshots/idle.png) |
| R2 | 指定large-repo打开Review，显示仅一个tracked文件差异 | 通过：未发消息，新建页真实large-repo/main/本机；Review仅src/group-0/file-0.txt +1/-1。[就绪](screenshots/large-review-ready.png) |
| R3 | 构建产物连续写入时Review和界面代表操作仍有响应 | 通过（本次代表操作）：父40秒ignored dist写入期间，实际文件折叠/展开成功且准确diff恢复。[期间交互](screenshots/churn-interaction.png) |
| R4 | 切走后、停止写入后恢复，最终回空新建页 | 通过（实际路线）：停止写入后Review仍正常；切离large-repo并关闭Review，留actspace-agent空新建页。后台旧根60秒写入及停止恢复期间全程静止，未进行交互，CPU恢复依据父采样。[切离](screenshots/switched-review-closed.png) |

## 分组路线

1. 空闲基线：实际绑定原空新建页，不导航用户仓库；父先采样。
2. 指定大仓库：新建页选择临时large-repo，打开Review但不发消息；静止等待独立benchmark/真实进程采样。
3. 写入与恢复：仅代表安全UI操作观察；切走、停止写入后回空新建页清除临时草稿，不修改真实设置。关键状态最少截图，实际动作与性能样本分层。

fixture路径：/var/folders/h6/wv0phjfx6pb36n57tb4d9sww0000gn/T/actspace-review-resources-g3hqxth0/large-repo。父准备1万已跟踪文件/2万ignored node_modules文件、dist ignored与唯一tracked改动；这些是父fixture辅证，UI仍须真实读取。

## 现场

CUA绑定耗时63秒，当前main69765仍存在。只打开选择工作区菜单（未点目录入口），父要求20秒pre-open采样，立即停止导航并保持menu静止。原空新建页截图在菜单打开前保存。

系统目录选择器实际指定large-repo并Open，返回后fresh截图明确large-repo/main/本机；右侧对象Review入口可用，无需建立会话。未提交仅src/group-0/file-0.txt，fixture 0→fixture changed。通知父ready后保持静止，不切范围、不刷新。

R3现场：父通知review-churn40秒约400次写入/s时，仅对freshAX“收起src/group-0/file-0.txt”AXPress，立即真实变为“展开”；再AXPress展开，真实变回“收起”、准确+1/-1旧差异恢复。4次动作/观察总工具wall约0.4秒、截图正常，未观察该批次可见冻结。没有连续帧/事件延迟计量，不能推断每次刷新均不卡、也不能把该时间当产品端精确latency。单行无滚动内容，本次不声称滚动已验。父随后通知写入停止/recovery30秒，保持同面板静止。

R4切离现场：Review通过原生AX关闭，空新建页恢复原git-workspace的系统picker GoTo未稳定出现PathTextField，两次Open实际仍临时large-repo/dist；没有发送请求/建立会话，不将尝试当恢复成功。主智能体据此改为当前菜单已有且位于large-repo之外的actspace-agent，仅导航空新建页。AXMenuItem press返回0但界面未变；正常置前并核目标PID后，对fresh截图中的actspace-agent行实际OS click，随后截图明确actspace-agent/main/本机、右侧Objects、空输入/发送禁用。已通知ready后保持静止，不隐藏临时根，等待旧根后台写入对照。


## 资源结果的验证层

主智能体的独立进程采样（[原始阶段摘要](execution-summary.md)，不属于本子智能体的UI测量）：Review打开idle四进程CPU约1.12%单核；ignored构建40秒CPU平均43.8%、峰50.2%，足迹平均1209/峰1243MiB，GPU增长占多数。停止后CPU约1.25%、GPU回54MiB。普通tracked每秒保存20秒平均CPU12.35%。切走且Review关闭后，旧large-repo后台ignored写入60秒CPU平均31.46%单核，主要renderer约30%；足迹约1066→1076MiB，未测到大量或持续增长。停止后CPU约1.09%。真实可见交互仍仅R3一批折叠/展开，背景阶段没有交互测试，不能由CPU或无用户动作推出持续不卡顿。

父要求采样完后隐藏本轮large-repo与误选dist临时项。fresh原生AX当前整侧栏遍历，二者title/description及限定安全AXValue匹配均0，没有可见可操作的相应行；父白名单确认两个临时项实际已登记：ws_large_repo_naisks、ws_dist_1aoou8；无会话因此不在侧栏展示。按父指令停止UI寻找，不制造会话；父使用既有workspace-registry service仅隐藏精确两个测试ID并核对其它条目。父已完成仅隐藏这两条，并断言其它工作区条目及defaultWorkspace完全未变，见[恢复断言](restoration.json)。这是父metadata恢复，不冒称真实UI隐藏；收尾已完成。没有操作任何原有工作区的移除入口。最终界面保持actspace-agent/main/本机空新建页、右侧Objects、Review关闭；全轮没有新建持久会话或发模型请求。

执行时HEAD观察为4301a0e56568c4f049bae8a2efd021d26e53a310，结论对应实际已启动main69765的工作区与上述场景，不只按HEAD推定。仅本验收记录/必要证据改动，没有产品修复。
