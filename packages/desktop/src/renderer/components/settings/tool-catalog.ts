/**
 * 工具清单单一来源。
 *
 * 同时被「工具」分区（主 Agent 的全局开关）与 Kairos「禁用工具」多选复用，
 * 避免两处各维护一份工具名而漂移。普通项的 `name` 与 ToolManager 注册名一致；
 * `browser_capability_*` 是 Browser permission checker 消费的细粒度 capability 开关，不注册为模型工具。
 */
export interface ToolCatalogItem {
  name: string;
  label: string;
  description: string;
  /** true 表示是否可用取决于供应商或插件配置。 */
  conditional?: boolean;
  group?: "browser";
  kind?: "tool" | "capability";
}

export const BROWSER_TOOL_GROUP = "browser";

export const TOOL_ITEMS: ToolCatalogItem[] = [
  { name: "read_file", label: "读取文件", description: "读取工作区中的文件内容。" },
  { name: "grep", label: "Grep 搜索", description: "按正则在文件内容中搜索匹配。" },
  { name: "glob", label: "Glob 匹配", description: "按通配符查找文件路径。" },
  { name: "list_directory", label: "列出目录", description: "浏览目录结构与文件清单。" },
  { name: "edit_file_diff", label: "编辑文件", description: "以 diff 形式修改已有文件。" },
  { name: "write_file", label: "写入文件", description: "创建新文件或覆盖已有文件。" },
  { name: "web_search", label: "联网搜索", description: "调用联网搜索获取实时信息。", conditional: true },
  { name: "bash", label: "Bash 终端", description: "在工作区执行 shell 命令。" },
  { name: "browser_cua", label: "浏览器 CUA", description: "截图与坐标级鼠标、键盘操作。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_dom", label: "浏览器 DOM CUA", description: "基于 snapshot node_id 的稳定页面操作。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_locator", label: "浏览器 Locator", description: "CSS selector 点击、填写、读取与等待。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_navigation", label: "浏览器导航", description: "打开网址、前进、后退与刷新。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_tabs", label: "浏览器会话标签页", description: "管理 Agent 会话标签页及最终交付。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_user", label: "用户浏览器", description: "读取或接管用户现有标签页与历史。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_wait", label: "浏览器等待", description: "等待加载、URL、元素、文件或下载事件。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_io", label: "浏览器 I/O", description: "处理上传、下载路径和剪贴板。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_debug", label: "浏览器调试", description: "读取 console 与 runtime 日志。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_help", label: "浏览器入口", description: "按需披露 62 个 action 的分类、参数和状态。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_run", label: "浏览器批处理", description: "预检、审批并顺序执行多个结构化 action。", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_capability_download", label: "浏览器触发下载", description: "允许 CUA、DOM 或 Locator 触发媒体下载；每次仍需高风险审批。", conditional: true, group: "browser", kind: "capability" },
  { name: "browser_capability_file_upload", label: "浏览器文件上传", description: "允许把本地文件设置到网页文件选择器；每次仍需高风险审批。", conditional: true, group: "browser", kind: "capability" },
  { name: "browser_capability_clipboard_write", label: "浏览器写剪贴板", description: "允许网页上下文写入文本或富媒体剪贴板；每次仍需高风险审批。", conditional: true, group: "browser", kind: "capability" },
];

export const PRIMARY_TOOL_ITEMS = TOOL_ITEMS.filter((tool) => tool.group !== "browser");
export const BROWSER_TOOL_ITEMS = TOOL_ITEMS.filter(
  (tool) => tool.group === "browser" && tool.name !== "browser_help",
);
