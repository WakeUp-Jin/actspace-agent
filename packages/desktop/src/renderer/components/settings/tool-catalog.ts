/**
 * 工具清单单一来源。
 *
 * 同时被「工具」分区（主 Agent 的全局开关）与 Kairos「禁用工具」多选复用，
 * 避免两处各维护一份工具名而漂移。`name` 必须与后端 ToolManager 注册名一致。
 */
export interface ToolCatalogItem {
  name: string;
  label: string;
  description: string;
  /** true 表示是否可用取决于供应商配置（如联网搜索 / 媒体分析）。 */
  conditional?: boolean;
}

export const TOOL_ITEMS: ToolCatalogItem[] = [
  { name: "read_file", label: "读取文件", description: "读取工作区中的文件内容。" },
  { name: "grep", label: "Grep 搜索", description: "按正则在文件内容中搜索匹配。" },
  { name: "glob", label: "Glob 匹配", description: "按通配符查找文件路径。" },
  { name: "list_directory", label: "列出目录", description: "浏览目录结构与文件清单。" },
  { name: "edit_file_diff", label: "编辑文件", description: "以 diff 形式修改已有文件。" },
  { name: "write_file", label: "写入文件", description: "创建新文件或覆盖已有文件。" },
  { name: "web_search", label: "联网搜索", description: "调用联网搜索获取实时信息。", conditional: true },
  { name: "analyze_media", label: "媒体分析", description: "解析图片等多模态内容。", conditional: true },
  { name: "bash", label: "Bash 终端", description: "在工作区执行 shell 命令。" },
];
