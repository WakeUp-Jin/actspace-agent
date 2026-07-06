/**
 * HTML → Markdown 转换（web_fetch 专用）
 *
 * 转换前先清洗非正文元素，思路借鉴 firecrawl 的 removeUnwantedElements：
 * - 按标签删：script/style/nav/footer 等结构性噪音
 * - 按 class/id token 删：广告、cookie 横幅、侧边栏等常见命名
 *
 * turndown 在 Node 下内置 domino 提供 DOM，直接传 HTML 字符串即可。
 */

import TurndownService from "turndown";

/** 整棵子树删除的标签（正文几乎不可能在其中） */
const REMOVE_TAGS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "svg",
  "canvas",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "header",
  "footer",
  "aside",
] as const;

/**
 * class/id 命中即删的 token（精确匹配分词，避免误伤如 "header-anchor"）。
 * 取 firecrawl excludeNonMainTags 清单中最不易误伤的子集。
 */
const REMOVE_CLASS_TOKENS = new Set([
  "ad",
  "ads",
  "advert",
  "advertisement",
  "cookie",
  "cookie-banner",
  "sidebar",
  "breadcrumb",
  "breadcrumbs",
  "social",
  "social-media",
  "share",
  "modal",
  "popup",
  "overlay",
  "widget",
]);

function hasNonContentToken(node: TurndownService.Node): boolean {
  const el = node as unknown as { getAttribute?: (name: string) => string | null };
  if (typeof el.getAttribute !== "function") return false;
  const className = el.getAttribute("class") ?? "";
  const id = el.getAttribute("id") ?? "";
  const tokens = `${className} ${id}`.toLowerCase().split(/[\s_]+/).filter(Boolean);
  return tokens.some((token) => REMOVE_CLASS_TOKENS.has(token));
}

let sharedService: TurndownService | undefined;

function getTurndownService(): TurndownService {
  if (sharedService) return sharedService;
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  service.remove([...REMOVE_TAGS]);
  service.remove(hasNonContentToken as TurndownService.Filter);
  sharedService = service;
  return service;
}

/** 清洗并转换 HTML 为 Markdown；转换失败时抛错由调用方兜底。 */
export function htmlToMarkdown(html: string): string {
  return getTurndownService().turndown(html).trim();
}

/** 提取 <title> 文本（转换前调用，避免被清洗规则影响）。 */
export function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1]?.trim();
  return title ? title.replace(/\s+/g, " ") : undefined;
}
