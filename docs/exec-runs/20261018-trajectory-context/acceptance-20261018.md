# 轨迹上下文与子工具：真实 Electron 验收

日期：2026-10-18。结论：R1、R3、R5 及 R6 的实测范围通过；R2、R4 部分通过。未发现本次投影界面的新增失败；父委派仍出现已有的 `DURABILITY_BLOCKED`，不能宣称委派端到端成功。

## 验收点

- R1：旧会话上下文概述显示开始时间，Local/Unix 可切换，重载后时间一致。
- R2：新请求区分固定系统、AGENTS 规则、技能目录、运行信息，能够查看来源与正文；旧日志不推测不存在的分类。
- R3：修改隔离工作区 AGENTS 后，下一轮出现规则上下文更新和差异，不产生假系统更新。
- R4：真实委派读取隔离 README，父轨迹显示子 read_file、Schema、子会话身份，重载后保留。
- R5：切换及重载不重复，旧系统提示词和工具 Schema 保持可用。
- R6：浅深主题、窄窗中布局和文字可用，无严重裁切。

## 操作分组与方法

1. 旧会话组：查看复制的 075 会话，打开 runtime-state，上下文时间 Local→Unix→Local，再重载复查；查看历史 bash Schema 和系统正文。只查看，没有在旧会话发送请求。
2. 新会话组：确认环境选择器勾选隔离 workspace；真实 DeepSeek 请求委派读取 README；查看分类、规则来源、技能目录、子工具，再由主智能体修改隔离 AGENTS，发送无工具第二轮检查更新及 diff；重载和切换复查。
3. 主题与尺寸组：在隔离应用外观设置切换深色与浅色；在宽窗和原生缩窄窗口中查看子工具与规则详情。相同路线复用，没有重发模型请求。

由 Computer Use 子智能体通过 `mcp__cua_repl` 原生 Electron UI 完成。未使用 mock、Playwright 或浏览器脚本。隔离数据位置见本地 environment.json；生产 renderer，以 file:// 加载，无 Vite。证据位于本地 `tmp/codex-acceptance/20261018-trajectory-context/`，不加入 Git。截图文件虽以 .png 命名，CU 返回实际 JPEG 编码，可正常查看。

## 逐点结果

|点|结论|真实 UI 证据与边界|
|---|---|---|
|R1|通过|075 runtime-state 显示 `2026-10-18 12:51:46.422`、0 毫秒；点击变为 `1792299106.422`，再次点击回 Local。Cmd+R 后重新打开同一条，开始时间一致。`R1-old-unix.png/.txt`、`R1-old-reload.png/.txt`。仅验证时间值保留，没有声称 Unix 显示偏好跨重载保留。|
|R2|部分通过|新会话仅一固定初始系统行；运行信息 runtime-state、core/agent-descriptor、host/workspace-facts、host/capabilities，父目录与工作区两条 AGENTS 规则，技能目录均单独显示。工作区规则预览显示完整短正文；来源页有 contributorId、ownerPluginId、path、contentDigest、kind、placement、requestId、eventSeq、projection。技能目录预览显示实际目录条目，固定系统预览显示基础正文与“实际发送的完整 system 消息（包含规则与技能）”折叠入口。`R2-new-rows.txt`、`R2-rule-overview.png/.txt`、`R2-rule-source.png/.txt`、`R2-skills.png/.txt`、`R2-fixed-system.png/.txt`。未主动加载技能正文；未逐一打开全部 runtime contributor 的来源/全文；未打开完整 system 折叠；旧日志无元数据时不猜分类未构造特定场景，均不计通过。|
|R3|通过|主智能体在隔离 workspace/AGENTS.md 追加 revision-two 规则，下一轮无工具请求只新增一条“上下文／规则／已更新”；展开“与上一版本比较”显示旧正文和追加 verified 内容，仍只有一初始系统行。第二轮回复确认该规则。`R3-updated-rows.txt`、`R3-rule-diff-expanded.png/.txt`。|
|R4|部分通过|真实父请求 explore，失败后模型自动再试 agent；父工具两次均 DURABILITY_BLOCKED，不能计端到端委派成功。但两条直接子会话的 read_file 已在父轨迹展示。实际打开第一条，状态已完成、子会话 ID、参数、结果第一行 `# Acceptance workspace`、完整 read_file 描述与 properties/required/additionalProperties Schema 均可见。Cmd+R 后同条结果和 Schema 保留。`R4-child-detail.png/.txt`、`R4-child-reload.png/.txt`、`R5-reload-rows.txt`。没有递归所有会话、后台通知、分页或加载失败注入的 UI 覆盖。|
|R5|通过（实测代表范围）|新会话 Cmd+R 后一初始系统行、首轮七条组成上下文、次轮一更新规则、两条不同子会话 read_file，无重复行。切到旧会话，历史初始系统正文仍可见，历史第一条 bash Schema 可打开；再切回新会话列表一致。`R5-reload-rows.png/.txt`、`R5-old-system.png/.txt`、`R5-old-tool-schema.png/.txt`。仅代表性检查，不宣称逐一验证全部历史工具或系统工具目录。|
|R6|通过（实测范围）|浅色宽窗规则差异、深色宽窗子工具、深色窄窗子工具与浅色窄窗规则详情均目视可读；长路径在摘要省略、正文换行，窄窗侧栏自动收起，详情标签与关闭按钮可见，无严重裁切。宽窗截图约 2940×1754 像素（原生 zoom 后 2940×1722）；窄窗 1502×1520 像素，截图像素不等同 CSS viewport。`R3-rule-diff-expanded.png`、`R6-dark-child.png`、`R6-dark-narrow.png/.txt`、`R6-light-narrow.png/.txt`。未外推其他尺寸。|

## 观察与未覆盖

- OBS-01 延续：父 explore/agent 均提示 DURABILITY_BLOCKED，但子 read_file 已成功且被正确投影；模型最终回复误认为未读取，是父结果失败后的真实表现。主智能体另有日志结构证据，本报告不将其冒充 UI 成功。
- 未触发已加载技能正文、工具集合变化、后台通知、分页及加载错误 UI；相关单元测试不能替代真实界面通过。
- 本轮只做验收，未修改源码、未修复问题、未提交或推送。隔离工作区规则变更由主智能体执行。
