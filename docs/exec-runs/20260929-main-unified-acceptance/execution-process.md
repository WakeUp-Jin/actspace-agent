# main 统一实机验收过程

- 基线：082287af4219eaff8637741dc2d78f04289f59d0（186a18b..082287a）。
- 用户确认：2026-09-29，按聊天确认的 A01–A25 与 G1–G8 执行。
- 隔离数据和工作区：/tmp/actspace-main-acceptance-20260929/{data,workspace}。复用现有模型配置及 main-only 凭据，不复制个人会话。
- 保留开始前 5 份未提交文档修改。不开启自动修复、不提交代码。
- 原生 Computer Use 可用；浏览器专用连接返回 unsupported Codex auth method: apikey，Chrome 改用原生窗口验收。
- 已启动当前 main 的 pnpm dev:log，正在构建与准备 Electron。

## 操作分组

G1 主会话与模式：A01–04/A08；G2 执行与忙碌：A05–07；G3 Mermaid：A11–13；G4 Chrome 安装与使用：A17–18/A20–21；G5 Chrome 多资料恢复：A18–19/A21–24；G6 外观与窗口：A13–16；G7 持久化旧数据：A09–10/A15/A18/A23；G8 安装态退出：A25。

结果按验收点列，不把历史分支证据或源码检查当本次实机通过。

## G1 进行中

- 新建隔离 Session `54d5deb2-bfeb-460a-9339-2679afe7c4e8`，真实 deepseek-flash 返回 ACCEPTANCE_READY。
- UI 三模式菜单可见，默认 Agent。
- 第一次选择 Chat 未生效；随后搜索/生图实际为 Agent（request/header.agentMode=agent）。web_search、web_fetch、generate_image 成功，不能记作 Chat 通过。
- 日志明确出现 IPC `runtime-v2:fixed-renderer:set-session-agent-mode` 无 handler。当前源码与磁盘编译产物均包含 handler；开发启动只等待文件存在，疑似加载旧 main 的启动竞态，尚待重启复验。
- 停止本次开发进程并以同一隔离目录重新启动；未修改源码。
- 重启后模式切换成功，Chat rev1 / Plan rev2 实际请求确认；首次 IPC 缺失属于启动时运行版本混用，保留为启动缺陷线索。
- Chat web 搜索和 generate_image 成功，右侧真实预览白底蓝圆。请求工具集合恰好 generate_image/web，见 runtime-tool-sets.json。
- Chat→Plan 草稿保持；Plan read/list/glob/Todo 成功，UI 两项 pending。活动 Run 模式菜单三项 disabled。
- sample.xyz 发送被支持格式校验拒绝，正文与附件保留。移除按钮多次点击未见变化，尚未排除 CUA 命中问题，保留原会话状态。
- 第二主会话 db87674b-79a5-42fb-90c4-b4c0b9ec9fad：Plan grep/web_search/web_fetch 成功；explore 两次约30ms即失败，工具结果 SUBAGENT_FAILED：Agent turn failed and its settlement checkpoint also failed. UI 子 Agent 面板两项失败。A04 Explore 子项失败。

## G2 已执行部分

- Agent write_file 创建 g2.txt=ALPHA，edit_file→BETA，read/grep/glob成功。
- Bash sleep 90 显示审批卡，命令/cwd清楚；批准后运行；运行中模式菜单三项禁用。任务 completed 后 bash_output exit0。
- printf G2_DENY_TEST 审批拒绝，UI Denied、工具 user-denied，单次调用未重试。
- 后台运行但主 Run 已空闲的切换、bash_kill、通用子 Agent、已有 Grant/full-access等仍待补。

## G3 进行中

- 同一主会话通过真实模型请求 flowchart/sequence/state/宽图/错误语法/普通代码混合回复。
- flowchart/sequence/state/宽图四个正常图表可见；错误块显示局部错误和源码，下载/放大禁用，普通 JS 块正常。
- sequence 放大初始100%，键盘放大125%；Esc返回原按钮焦点。PNG 经原生保存对话框导出并视觉检查，证据 mermaid-sequence.png。
- state 源码切换成功，复制后粘贴入草稿与源码逐字一致；深色紫强调色下按钮键盘焦点呈紫色。
- 宽图放大预览100%显示A–J，放大125%后裁切边缘，按0复位100%完整显示。拖拽/窄屏/流式中间态未覆盖。

## G4 安装入口进行中

- 扩展页从未安装进入安装中，再到等待Chrome配置；managed bin/extension已生成。
- Chrome专用API不可用，原生UI切换至已有未登录的ActSpace验收资料；旧扩展0.2.2停用。
- 本地扩展加载涉及action-time确认，已通过异步问题请求；尚未收到答复，未执行加载。两个测试资料可见，未操作个人资料数据。
- 原Native Host manifest已备份至隔离目录native-host-before.json，结束需恢复。

## G6 进行中

- 原偏好system/default，系统当前浅色。实际观察system/default、light/blue、dark/blue外观页，布局/选中态可读。
- dark/purple会话内发送按钮空草稿禁用、非空草稿启用；子Agent失败状态仍红色；Mermaid源码按钮键盘焦点紫色。
- 深色会话中Mermaid图面仍浅底，文字可读，需对照设计要求后判定主题适配。
- 外观页底部展示开发性说明“已完成设置页重构”和测试命令，记录为产品文案问题，未改代码。
- CUA原生Electron每次状态读取约60秒；部分AX点击先只聚焦，随后键盘space可激活，不以此判定产品按钮失败。
- A14追加：浅/深下五色选择和页面显示均观察；代表控件验证为紫色发送启禁与键盘焦点、浅橙开关启禁及关联配置禁用。未声称所有色×所有控件逐一通过。
- system/purple实测系统浅→深→浅，应用自动跟随且紫色不变；系统原浅色已恢复。其他system颜色组合仍未覆盖。
- Mermaid固定浅色已对照设计文档第235行确认符合明确决策，不记主题缺陷。

## G7 重启恢复部分

- 停止本任务dev进程55542，再使用同一隔离目录启动82543；未变更源码。
- 两个主会话历史、Plan模式、Todo和Mermaid恢复。紫色偏好保留。
- UI新增“2个会话暂时无法读取，可重试”；点击重试后仍需核对错误源是否为此前两个Explore子会话。
- 重启后未发送草稿、附件和右侧面板未恢复；重启前活动主会话为ACCEPTANCE_READY，启动选中另一主会话。作为恢复行为记录，需对照产品承诺再定缺陷。
- 附件移除经AX、键盘和截图坐标多种操作仍未得到消失证据；保留为CUA待复核，不能确认产品缺陷。重启后附件消失不算移除按钮通过。
- Plan补验输入使用typeText时中文丢失，模型收到不完整英文词组；在停止前已完成。inspect_image两次Connection error，无视觉结论；Todo两项从pending更新为completed，UI显示2/2。准确纠正第二项pending的英文指令已粘贴，发送时遭遇系统锁屏，未确认发送。

## 当前外部阻断

- CUA原文：The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.
- 暂停界面操作，等待用户手动解锁。Chrome加载本地扩展的即时确认也仍未收到。
- dev进程82543仍在运行，隔离数据保留，当前应用偏好system/purple；系统外观已恢复浅色。Native Host备份与隔离凭据尚保留，完成后需恢复/清理。
- 未完成A01–A25全量验收，不出整体通过结论。无产品代码修改。

## 解锁后续验

- 用户“继续”，CUA恢复。纠正Todo请求实际已在锁屏前发送完成：rev3，第一项completed、第二项pending，UI 1/2，精确更新通过。
- Plan边界请求创建forbidden-plan.txt及pwd：模型明确能力不可用，零工具调用；文件不存在。未绕过到explore。
- 切Chat后工作区/权限入口隐藏，历史Todo保留。请求本地read_file/Shell/Todo时模型受历史影响生成read_file与todo_write调用；运行时在read_file可见性检查拒绝，turn failed。证据chat-boundary-failure.json。界面仅失败状态，无清楚错误说明。
- 随后无工具CHAT_RECOVERED请求仍失败：provider400，上一assistant tool_calls缺少对应tool messages。此会话续聊被阻断，不能记边界完整通过；范围拒绝生效但失败历史未正确结算。
- 新独立Agent会话“在测试工作区后台运行 sleep 600”：批准sleep600后主回复结束为空闲。模式菜单可选，尝试Chat被明确提示仍有运行/审批/后台任务，模式保持Agent。后台任务busy边界通过。
- 已发送bash_kill + bash_output结束bash_66c27a00-2a57-4131-a5d8-7692f8550da9，等待结果。

## G2 续验收尾

- bash_kill/bash_output 界面确认任务 killed；停止后切 Chat 成功，工作区/权限控件隐藏。再移除 Chat 恢复 Agent。
- delete_file 审批卡明确显示 g2.txt；等待审批时 Agent/Plan/Chat 均 disabled。批准后界面 Deleted g2.txt，文件系统独立确认不存在。
- 通用 agent 子任务读取 README.md 运行约214秒后失败，错误同 Explore：Agent turn failed and its settlement checkpoint also failed. 主会话正常结算为空闲，右侧从运行中更新为已结束/失败。模型回退直接 read_file 得到 marker，不算子 Agent 成功。
- G2 尚未覆盖已有 Grant/full-access 组合；不以常规批准/拒绝覆盖这些条件。

## G7 分叉追加

- 主会话最新模式切为Plan，侧栏右键→分叉；后续刷新出现两个同名会话，当前分支保留三轮历史及Plan标记。末尾fork通过。
- 指定历史轮次截断的CU验收受入口限制：源码ConversationView的消息分叉按钮disabled，固定renderer IPC仅以parent.throughJournalSeq分叉。不能以末尾fork声称历史截断模式继承通过。

## G3/G6 分栏追加与 G8 准备

- 状态图预览键盘plus从100%到110%，Esc返回原放大按钮焦点。坐标drag未取得位移证据，平移未通过验收。
- 浅色分栏场景：右侧390宽，聊天区宽图可见A–H，尾部I/J超出可见范围；错误块/代码/输入框布局可读。横向scroll未取得尾部可见证据，横向浏览未覆盖。分栏不替代系统窄窗口。
- 停止dev82543，准备当前082287a安装包。旧dist清单为186a18b，暂存隔离目录prior-dist-186a18b，完成后原位恢复；本次制品另存。构建命令ACTSPACE_MAC_ADHOC_SIGN=true ACTSPACE_MAC_NOTARIZE=false pnpm package:desktop，日志在隔离目录package-current-main.log。

## 安装态与交互补验

- 当前main打包exit0，manifest见package-manifest.json；darwin/arm64、ad-hoc、未公证。制品移至隔离目录current-main-dist；原dist已原位恢复。
- 全新packaged-data从包外cwd启动成功，首页无模型提示明确。开始连接遇到本次dev Host登记时明确拒绝覆盖；将自己dev登记备份移开后，安装态随包组件准备成功，等待扩展加载，无Go构建。
- 复制目录经粘贴逐字核对；Finder显示正确extension目录。主动断开→退出exit0→包外重启仍为开始连接，深色偏好保留。这不覆盖已连接后断开/页面保留。
- Window菜单左半窗口：连接页深色布局可读、侧栏自动收起。
- 安装态读取原验收data成功，出现3个不可读取会话（之前2个，新增通用agent失败后变3；归因仍需运行时证据）。
- 窄窗口Mermaid浅/深两态：宽图横向滚动条拖至末端后J可见；预览fit54%显示A–J，实际大小100%裁切，画布拖动后节点位置改变，fit恢复完整。平移/横向访问已取得截图证据。
- Agent→Chat保留G1_ATTACHMENT_DRAFT_KEEP及sample.xyz；发送明确格式错误，附件/正文保留；点击移除附件后附件和错误消失、正文仍在。之前附件移除CUA疑点关闭。

## 本轮补验与收尾

- A11：第二次250边 Mermaid 生成捕获到未闭合围栏中间态（源码仍流式追加、停止按钮可见、未报语法错误）；结束后 Worked、PNG/放大可用、横向图正常渲染。流式子项通过。
- 恢复当前测试应用 system/default，UI 单选状态确认；Cmd+Q 后进程10725退出码0。
- 原 Native Host manifest 从 native-host-before.json 逐字恢复；备份 manifest SHA256 为48f5880bc7d98b49ab94c317e8fbdd368b0582d60a13e3a90fb17899044f8892。此哈希属于manifest，非可执行文件。
- 删除隔离data/secrets.json及Downloads内本次误命名重复PNG；会话、日志及制品保留，原个人凭据未改动。
- 汇总至 execution-summary.md；全量未通过，未覆盖项未计通过。
