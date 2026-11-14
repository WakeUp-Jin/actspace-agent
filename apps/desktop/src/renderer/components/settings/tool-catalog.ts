/**
 * 工具清单单一来源。
 *
 * 由「工具」分区用于主 Agent 的全局开关，
 * 避免两处各维护一份工具名而漂移。普通项的 `name` 与 Runtime Tool Registry 注册名一致；
 * `browser_capability_*` 是 Browser permission checker 消费的细粒度 capability 开关，不注册为模型工具。
 */
export interface ToolCatalogItem {
  name: string;
  label: string;
  /** 只有敏感能力开关写一句警示；普通工具标题已够，不写说明。 */
  description?: string;
  /** true 表示是否可用取决于供应商或 Host 扩展配置。 */
  conditional?: boolean;
  group?: "browser";
  kind?: "tool" | "capability";
}

export const BROWSER_TOOL_GROUP = "browser";

export const TOOL_ITEMS: ToolCatalogItem[] = [
  { name: "read_file", label: "读取文件" },
  { name: "grep", label: "Grep 搜索" },
  { name: "glob", label: "Glob 匹配" },
  { name: "list_directory", label: "列出目录" },
  { name: "edit_file_diff", label: "编辑文件" },
  { name: "write_file", label: "写入文件" },
  { name: "web_search", label: "联网搜索", conditional: true },
  { name: "generate_image", label: "图片生成", conditional: true },
  { name: "inspect_image", label: "图片分析", conditional: true },
  { name: "bash", label: "Bash 终端" },
  { name: "browser_cua", label: "截图与鼠标键盘操作", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_dom", label: "按页面节点操作", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_locator", label: "按选择器操作页面", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_navigation", label: "浏览器导航", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_tabs", label: "浏览器标签页", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_user", label: "接管你的浏览器标签页", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_wait", label: "浏览器等待", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_io", label: "上传、下载与剪贴板", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_debug", label: "读取控制台日志", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_help", label: "浏览器操作目录", conditional: true, group: "browser", kind: "tool" },
  { name: "browser_run", label: "批量执行浏览器操作", conditional: true, group: "browser", kind: "tool" },
  {
    name: "browser_capability_download",
    label: "允许触发下载",
    description: "每次仍需审批",
    conditional: true,
    group: "browser",
    kind: "capability",
  },
  {
    name: "browser_capability_file_upload",
    label: "允许上传本地文件",
    description: "每次仍需审批",
    conditional: true,
    group: "browser",
    kind: "capability",
  },
  {
    name: "browser_capability_clipboard_write",
    label: "允许写入剪贴板",
    description: "每次仍需审批",
    conditional: true,
    group: "browser",
    kind: "capability",
  },
];

export const PRIMARY_TOOL_ITEMS = TOOL_ITEMS.filter((tool) => tool.group !== "browser");
export const BROWSER_TOOL_ITEMS = TOOL_ITEMS.filter((tool) => tool.group === "browser" && tool.name !== "browser_help");
