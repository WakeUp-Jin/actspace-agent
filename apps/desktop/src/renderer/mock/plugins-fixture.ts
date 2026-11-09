import type { PluginListItem, PythonRuntimeStatus, SettingsV4Snapshot } from "@actspace/shared";

type Row = readonly [id: string, title: string, description: string, directory: string];

const GLOBAL: readonly Row[] = [
  ["actspace-runtime", "运行时底座", "启动 ActSpace、装配插件、管理生命周期", "core"],
  ["session-journal", "会话日志", "把会话里发生的事按类型记成日志", "session"],
  ["session-persistence", "会话持久化", "读写会话日志的统一接口", "session"],
  ["session-jsonl", "会话文件存储", "把会话保存为本机的 JSONL 文件", "session"],
  ["session-projection", "会话视图", "把日志整理成界面和 Agent 能读的状态", "session"],
  ["session-runtime", "会话运行时", "新建、恢复和归档会话", "core"],
  ["session-checkpoint-policy", "检查点", "决定什么时候给会话存检查点", "session"],
  ["llm-service", "模型服务", "连接模型提供商并转发请求", "llm"],
  ["todo-projection", "待办视图", "把 Agent 的待办整理给界面显示", "todo"],
  ["core-agent", "Agent 注册表", "管理 Agent 与子 Agent 的身份", "core"],
  ["agent-runtime", "Agent 运行时", "为每个会话挂载 Harness 并运行", "core"],
  ["desktop-app", "桌面接线", "桌面端的会话与界面接口", "host"],
  ["side-chat", "侧边对话", "不打断主对话，在旁边提问", "side-chat"],
  ["english-learning", "英语学习", "双语回答、生词与朗读", "english-learning"],
];

const SESSION: readonly Row[] = [
  ["agent-factory", "Agent 循环", "每一轮调用模型和工具的主循环", "core"],
  ["tools-runtime", "工具运行时", "注册工具、执行并记录结果", "core"],
  ["tools-approval", "审批", "危险操作前先征求你的同意", "approval"],
  ["auto-review", "自动审批", "用模型判断低风险操作能否直接放行", "approval"],
  ["sandbox", "沙箱", "限制命令能访问的文件和网络", "sandbox"],
  ["sandbox-seatbelt", "沙箱：Seatbelt", "macOS 上的沙箱实现", "sandbox"],
  ["sandbox-nono", "沙箱：nono", "跨平台的沙箱实现", "sandbox"],
  ["context-engine", "上下文引擎", "组装每一轮发给模型的上下文", "context"],
  ["prompt-runtime", "提示词", "系统提示词的模板与渲染", "context"],
  ["context-system", "系统说明", "把 ActSpace 的基本说明放进上下文", "context"],
  ["context-rules", "规则", "把 AGENTS.md 等规则文件放进上下文", "context"],
  ["context-skills", "Skill 目录", "告诉 Agent 有哪些 Skill 可用", "context"],
  ["context-runtime", "运行环境", "告诉 Agent 时间、系统和工作区", "context"],
  ["context-conversation", "对话历史", "把之前的对话放进上下文", "context"],
  ["context-tools", "工具说明", "告诉 Agent 每个工具怎么用", "context"],
  ["context-background-tasks", "后台任务状态", "把正在运行的后台任务告诉 Agent", "context"],
  ["context-disclosure", "上下文披露", "按需把工作区路径和文件摘要告诉 Agent", "context"],
  ["compaction-runtime", "上下文压缩", "上下文快满时压缩较早的历史", "context"],
  ["filesystem-read", "读文件", "读取工作区里的文件", "fs"],
  ["filesystem-search", "搜索文件", "按文件名和内容搜索工作区", "fs"],
  ["filesystem-write", "写文件", "新建和修改工作区里的文件", "fs"],
  ["shell-tools", "命令行", "运行 Bash 命令", "shell"],
  ["background-tasks", "后台任务", "让命令在后台运行并查看输出", "background-tasks"],
  ["web-tools", "网页", "搜索网页、读取网页内容", "web"],
  ["image-generation", "生成图片", "按描述生成图片", "image"],
  ["image-inspection", "看图片", "让 Agent 看懂图片内容", "image"],
  ["todo-tools", "待办", "拆分任务并跟踪进度", "todo"],
  ["subagent-tools", "子 Agent", "把任务交给子 Agent 去做", "subagent"],
  ["plugin-manager", "插件开发", "帮 Agent 编写和安装插件", "harness-evolution"],
  ["browser-tools", "操控浏览器", "通过 Chrome 扩展操作网页", "browser"],
  ["subagent-codex", "Codex 子智能体", "用本机 Codex 跑子任务，用它自己的权限，不经审批和沙箱", "subagent"],
  ["subagent-claude-code", "Claude Code", "用本机 Claude Code 跑子任务，用它自己的权限，不经审批和沙箱", "subagent"],
];

/** Plugins that can be switched; the mock launched with 操控浏览器 on and 英语学习 off, like the demo. */
const MOCK_LOADED: Readonly<Record<string, boolean>> = { "english-learning": false, "browser-tools": true, "subagent-codex": true, "subagent-claude-code": false };

/** The mock machine has codex but no claude, so one subagent plugin is available and the other shows why it is not. */
const MOCK_UNAVAILABLE: Readonly<Record<string, string>> = { "subagent-claude-code": "本机没有找到 claude 命令" };

export function mockPluginList(settings: SettingsV4Snapshot["settings"]): PluginListItem[] {
  const build = (rows: readonly Row[], scope: "global" | "session"): PluginListItem[] => rows.map(([id, title, description, directory]) => {
    const canDisable = id in MOCK_LOADED;
    return {
      id, title, description, scope, directory, canDisable,
      loaded: canDisable ? MOCK_LOADED[id]! : true,
      enabled: canDisable ? settings.tools.plugins?.[id] ?? MOCK_LOADED[id]! : true,
      ...(MOCK_UNAVAILABLE[id] ? { unavailableReason: MOCK_UNAVAILABLE[id] } : {}),
      ...mockPluginSettings(id, settings),
    };
  });
  return [...build(GLOBAL, "global"), ...build(SESSION, "session")];
}

function mockPluginSettings(id: string, settings: SettingsV4Snapshot["settings"]): Pick<PluginListItem, "settings" | "settingsPendingRestart"> {
  const stored = settings.tools.externalSubagents;
  if (id === "subagent-codex") return { settings: { approvalPolicy: stored?.codex?.approvalPolicy ?? "never", sandbox: stored?.codex?.sandbox ?? "workspace-write" }, settingsPendingRestart: stored?.codex !== undefined };
  if (id === "subagent-claude-code") return { settings: { permissionMode: stored?.claudeCode?.permissionMode ?? "dontAsk" }, settingsPendingRestart: stored?.claudeCode !== undefined };
  return {};
}

/** 浏览器开发模式下的脚本运行时：核心层随包就绪，数据扩展未下载。 */
export function mockPythonRuntimeStatus(): PythonRuntimeStatus {
  return {
    runtime: { version: "3.12.16", root: "/Applications/ActSpace.app/Contents/Resources/app/runtime/python", corePackages: ["openpyxl", "xlsxwriter", "python-docx", "python-pptx", "lxml", "pillow", "pypdf", "pdfplumber", "pypdfium2"] },
    extension: { packages: ["numpy", "pandas", "markitdown"], state: "missing", localWheelsDirectory: "/Users/me/Library/Application Support/ActSpace/runtime/python-ext/wheels" },
  };
}
