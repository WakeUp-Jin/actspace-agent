import { useState, type RefObject } from "react";
import { ListTree } from "lucide-react";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";

/**
 * 大纲浮层（方案 A：大纲收在操作栏的按钮里，正文保持最大宽度）。
 *
 * 列出本页 h2、h3，点击平滑滚动到对应标题；没有标题时显示「没有标题」。
 * 标题直接从已渲染的正文 DOM 里取：react-markdown 不给标题加 id，用 DOM 元素本身定位最稳，
 * 也和屏幕上看到的完全一致（围栏代码块里的 `##` 不会被误当标题）。
 */

type Heading = { level: 2 | 3; text: string; element: HTMLElement };

function readHeadings(container: HTMLElement | null): Heading[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>("h2, h3"))
    .map((element) => ({ level: element.tagName === "H3" ? (3 as const) : (2 as const), text: element.textContent?.trim() ?? "", element }))
    .filter((heading) => heading.text.length > 0);
}

const ITEM_CLASS = "w-full justify-start overflow-hidden font-normal";

export function DocsOutline({
  contentRef,
  disabled = false,
}: {
  /** 预览正文所在的滚动容器。 */
  contentRef: RefObject<HTMLElement | null>;
  /** 源码状态没有渲染出的标题，按钮置灰。 */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        // 每次打开时重新读取：正文可能刚换过一篇或刚改过。
        if (next) setHeadings(readHeadings(contentRef.current));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <IconButton label="大纲" tooltip={disabled ? "源码状态没有大纲" : "大纲"} disabled={disabled} aria-expanded={open && !disabled}>
          <ListTree size={15} strokeWidth={1.8} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" radius="lg" className="max-h-[360px] w-[240px] overflow-auto p-1.5" aria-label="本页大纲">
        {headings.length === 0 ? (
          <p className="m-0 px-2.5 py-1.5 text-act-xs text-text-faint">没有标题</p>
        ) : (
          headings.map((heading, index) => (
            <Button
              key={`${index}:${heading.text}`}
              variant="ghost"
              size="xs"
              className={ITEM_CLASS}
              style={{ paddingLeft: heading.level === 3 ? 22 : 10 }}
              title={heading.text}
              onClick={() => {
                heading.element.scrollIntoView?.({ behavior: "smooth", block: "start" });
                setOpen(false);
              }}
            >
              <span className="truncate">{heading.text}</span>
            </Button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
