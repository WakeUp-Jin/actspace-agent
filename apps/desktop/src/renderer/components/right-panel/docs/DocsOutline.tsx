import { useEffect, useState, type RefObject } from "react";
import { ListTree } from "lucide-react";
import type { MarkdownEditorHandle, OutlineItem } from "../../markdown-editor";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";

/**
 * 大纲浮层（方案 A：大纲收在操作栏的按钮里，正文保持最大宽度）。
 *
 * 列出本页 h2、h3，点击平滑滚动到对应标题；没有标题时显示「没有标题」。
 * 数据来自编辑器的语法树（`MarkdownEditorHandle`），预览和源码两种模式都可用，
 * 围栏代码块和 frontmatter 里的 `#` 不会被误当标题；浮层打开期间订阅大纲变化，边改边更新。
 * 这里只 `import type`：编辑器本身是懒加载的 chunk，不能被静态引入。
 */

const ITEM_CLASS = "w-full justify-start overflow-hidden font-normal";

export function DocsOutline({
  editorRef,
  disabled = false,
}: {
  /** 正文编辑器的句柄；编辑器还没加载完时为 null，按钮仍可点，列表显示「没有标题」。 */
  editorRef: RefObject<MarkdownEditorHandle | null>;
  /** 文档还没读完时置灰。 */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OutlineItem[]>([]);
  const shown = open && !disabled;

  // 打开期间读一次并订阅变化；关闭或卸载时取消订阅（没有订阅者时编辑器不会计算大纲）。
  useEffect(() => {
    if (!shown) return undefined;
    const handle = editorRef.current;
    setItems(handle?.getOutline() ?? []);
    return handle?.subscribeOutline(setItems);
  }, [shown, editorRef]);

  return (
    <Popover open={shown} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label="大纲" tooltip="大纲" disabled={disabled} aria-expanded={shown}>
          <ListTree size={15} strokeWidth={1.8} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" radius="lg" className="max-h-[360px] w-[240px] overflow-auto p-1.5" aria-label="本页大纲">
        {items.length === 0 ? (
          <p className="m-0 px-2.5 py-1.5 text-act-xs text-text-faint">没有标题</p>
        ) : (
          items.map((item) => (
            <Button
              key={`${item.line}:${item.text}`}
              variant="ghost"
              size="xs"
              className={ITEM_CLASS}
              style={{ paddingLeft: item.level === 3 ? 22 : 10 }}
              title={item.text}
              onClick={() => {
                editorRef.current?.scrollToHeading(item);
                setOpen(false);
              }}
            >
              <span className="truncate">{item.text}</span>
            </Button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
