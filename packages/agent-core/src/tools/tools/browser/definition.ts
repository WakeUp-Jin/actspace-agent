import type { ToolDefinitionSpec } from "../../types";
import { browserActionsByCategory } from "./generated-actions";

const tabId = { type: "number", description: "目标 Chrome 标签页 ID。" };
const selector = { type: "string", description: "CSS selector；精确参数请先调用 browser_help。" };
const timeout = { type: "number", description: "可选超时毫秒数。" };

export const browserCuaDefinition: ToolDefinitionSpec = {
  name: "browser_cua",
  description: "坐标级浏览器操作。适合截图驱动、Canvas 或无法稳定使用 selector 的页面。先用 screenshot，再按 CSS 像素坐标执行。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...browserActionsByCategory.cua], description: "CUA action。" },
      tab_id: tabId,
      x: { type: "number", description: "CSS 像素 x 坐标。" },
      y: { type: "number", description: "CSS 像素 y 坐标。" },
      scroll_x: { type: "number", description: "水平滚动量。" },
      scroll_y: { type: "number", description: "垂直滚动量。" },
      text: { type: "string", description: "要输入的文本。" },
      keys: { type: "array", items: { type: "string" }, description: "按键或组合键。" },
      path: { type: "array", items: { type: "object" }, description: "拖拽路径点数组，每项包含 x/y。" },
      button: { type: "string", enum: ["left", "middle", "right"], description: "鼠标按钮。" },
    },
    required: ["action", "tab_id"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_cua",
};

export const browserDomDefinition: ToolDefinitionSpec = {
  name: "browser_dom",
  description: "DOM CUA 操作。先用 snapshot 获取稳定 node_id，再点击、滚动或下载对应节点；页面导航后必须重新 snapshot。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...browserActionsByCategory.dom], description: "DOM action。" },
      tab_id: tabId,
      node_id: { type: "string", description: "snapshot 返回的 node_id。" },
      scroll_x: { type: "number", description: "水平滚动量。" },
      scroll_y: { type: "number", description: "垂直滚动量。" },
      text: { type: "string", description: "要输入的文本。" },
      keys: { type: "array", items: { type: "string" }, description: "按键或组合键。" },
    },
    required: ["action", "tab_id"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_dom",
};

export const browserLocatorDefinition: ToolDefinitionSpec = {
  name: "browser_locator",
  description: "CSS Locator subset。用于 selector 点击、填写、读取、状态判断、等待和元素截图；不承诺完整 Playwright selector grammar。",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...browserActionsByCategory.locator], description: "Locator action。" },
      tab_id: tabId,
      selector,
      value: { type: "string", description: "fill 值。" },
      replace: { type: "boolean", description: "是否替换已有输入，默认 true。" },
      keys: { type: "array", items: { type: "string" }, description: "按键或组合键。" },
      modifiers: { type: "array", items: { type: "string" }, description: "鼠标操作修饰键。" },
      button: { type: "string", enum: ["left", "middle", "right"], description: "鼠标按钮。" },
      checked: { type: "boolean", description: "目标 checked 状态。" },
      name: { type: "string", description: "属性名。" },
      state: { type: "string", enum: ["attached", "detached", "visible", "hidden"], description: "等待状态。" },
      selections: { type: "array", items: { type: "object" }, description: "select 选项数组。" },
      relative_selector: { type: "string", description: "相对 selector。" },
      direction: { type: "string", enum: ["up", "down", "left", "right"], description: "滚动方向。" },
      amount: { type: "number", description: "滚动 CSS 像素数。" },
      x: { type: "number", description: "element_info/screenshot 的 x 坐标。" },
      y: { type: "number", description: "element_info/screenshot 的 y 坐标。" },
      crop_x: { type: "number", description: "截图裁剪 x。" },
      crop_y: { type: "number", description: "截图裁剪 y。" },
      crop_width: { type: "number", description: "截图裁剪宽度。" },
      crop_height: { type: "number", description: "截图裁剪高度。" },
      include_non_interactable: { type: "boolean", description: "element_info 是否包含不可交互祖先。" },
      timeout_ms: timeout,
    },
    required: ["action", "tab_id"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_locator",
};

export const browserNavigationDefinition = categoryDefinition(
  "browser_navigation",
  "浏览器导航：goto、back、forward、reload。",
  "browser_navigation",
  browserActionsByCategory.navigation,
  { tab_id: tabId, url: { type: "string", description: "HTTP/HTTPS URL。" }, timeout_ms: timeout },
  ["action", "tab_id"],
);

export const browserTabsDefinition = categoryDefinition(
  "browser_tabs",
  "管理当前 Agent browser session 的标签页、命名和 finalize。",
  "browser_tabs",
  browserActionsByCategory.tabs,
  {
    tab_id: tabId,
    url: { type: "string", description: "创建标签页时的可选 URL。" },
    active: { type: "boolean", description: "创建后是否激活。" },
    name: { type: "string", description: "session 名称。" },
    keep: { type: "array", items: { type: "object" }, description: "finalize 保留项，含 tab_id/status。" },
  },
  ["action"],
);

export const browserUserDefinition = categoryDefinition(
  "browser_user",
  "访问用户真实 Chrome 表面：列出 tabs、claim tab、搜索 history。",
  "browser_user",
  browserActionsByCategory.user,
  {
    tab_id: tabId,
    query: { type: "string", description: "历史搜索文本。" },
    limit: { type: "number", description: "最大结果数。" },
    from: { type: "string", description: "历史起始时间。" },
    to: { type: "string", description: "历史结束时间。" },
  },
  ["action"],
);

export const browserWaitDefinition = categoryDefinition(
  "browser_wait",
  "等待页面加载、URL、selector、文件选择器或下载事件。",
  "browser_wait",
  browserActionsByCategory.wait,
  {
    tab_id: tabId,
    state: { type: "string", description: "加载或 locator 状态。" },
    url: { type: "string", description: "等待的 URL。" },
    selector,
    timeout_ms: timeout,
  },
  ["action", "tab_id"],
);

export const browserIoDefinition = categoryDefinition(
  "browser_io",
  "浏览器文件、下载路径和剪贴板操作。上传和剪贴板写入属于高风险动作。",
  "browser_io",
  browserActionsByCategory.io,
  {
    tab_id: tabId,
    file_chooser_id: { type: "string", description: "文件选择器 token。" },
    files: { type: "array", items: { type: "string" }, description: "本地绝对文件路径。" },
    download_id: { type: "string", description: "下载 ID。" },
    text: { type: "string", description: "剪贴板文本。" },
    items: { type: "array", items: { type: "object" }, description: "富剪贴板 items。" },
    timeout_ms: timeout,
  },
  ["action", "tab_id"],
);

export const browserDebugDefinition = categoryDefinition(
  "browser_debug",
  "读取指定标签页的 bounded console/runtime 日志。",
  "browser_debug",
  browserActionsByCategory.debug,
  {
    tab_id: tabId,
    filter: { type: "string", description: "日志子字符串过滤。" },
    levels: { type: "array", items: { type: "string" }, description: "日志级别。" },
    limit: { type: "number", description: "最大日志条数。" },
  },
  ["action", "tab_id"],
);

export const browserHelpDefinition: ToolDefinitionSpec = {
  name: "browser_help",
  description: "渐进查看 Browser Use 分类、action、精确 schema、风险、backend 和实现状态。调用分类工具前参数不确定时使用。",
  parameters: {
    type: "object",
    properties: {
      category: { type: "string", enum: Object.keys(browserActionsByCategory), description: "可选分类。" },
      action: { type: "string", description: "可选 action；与 category 同时提供时返回精确 schema。" },
      query: { type: "string", description: "可选搜索词。" },
    },
    required: [],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "browser",
  previewKind: "browser_help",
};

export const browserRunDefinition: ToolDefinitionSpec = {
  name: "browser_run",
  description: "顺序执行结构化 Browser Use actions。整批先校验和审批；包含 mutation 时强制首错停止。",
  parameters: {
    type: "object",
    properties: {
      actions: { type: "array", items: { type: "object" }, description: "action 数组，每项包含 category、action、params。" },
      stop_on_error: { type: "boolean", description: "只读批处理可设 false；包含 mutation 时仍强制 true。" },
    },
    required: ["actions"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_run",
};

export const browserDefinitions = [
  browserCuaDefinition,
  browserDomDefinition,
  browserLocatorDefinition,
  browserNavigationDefinition,
  browserTabsDefinition,
  browserUserDefinition,
  browserWaitDefinition,
  browserIoDefinition,
  browserDebugDefinition,
  browserHelpDefinition,
  browserRunDefinition,
] as const;

function categoryDefinition(
  name: string,
  description: string,
  previewKind: ToolDefinitionSpec["previewKind"],
  actions: readonly string[],
  properties: ToolDefinitionSpec["parameters"]["properties"],
  required: string[],
): ToolDefinitionSpec {
  return {
    name,
    description,
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...actions], description: "分类 action。" },
        ...properties,
      },
      required,
      additionalProperties: false,
    },
    isReadOnly: false,
    category: "browser",
    previewKind,
  };
}
