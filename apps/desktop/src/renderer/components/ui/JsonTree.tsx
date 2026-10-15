import { Check, Copy, Minimize2 } from "lucide-react";
import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from "react";
import { cn } from "./cn";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";
import {
  ARRAY_PREVIEW_LIMIT, OBJECT_PREVIEW_LIMIT, PREVIEW_DEPTH_LIMIT, bracketOf, copyText, entriesOf, fieldText, isExpandableValue, pathId,
  type CopyMode, type JsonPath,
} from "./json-tree-model";

// 只读 JSON 检查器树（移植自 DeepSeek Harness JsonTree）。顶层始终展开，子对象 / 数组默认折叠并显示摘要；
// 长字符串按 collapsedStringLines 截断，可展开成完整原文。样式在 styles/json-tree.css（类名 json-tree-*）。

const c = (name: string) => `json-tree-${name}`;

function primitiveValue(value: unknown, preview = false): ReactNode {
  if (value === null) return <span className={c("keywordValue")}>null</span>;
  if (typeof value === "string") return <span className={c("stringValue")}>{JSON.stringify(value)}</span>;
  if (typeof value === "boolean") return <span className={c("keywordValue")}>{String(value)}</span>;
  if (typeof value === "number") return <span className={c("numberValue")}>{String(value)}</span>;
  if (typeof value === "bigint") return <span className={c(preview ? "otherValue" : "numberValue")}>{preview ? value.toString() : `${value.toString()}n`}</span>;
  if (value instanceof Date) return <span className={c("otherValue")}>{value.toISOString()}</span>;
  if (typeof value === "function") return <span className={c("otherValue")}>{preview ? value.name || "Function" : "function() { }"}</span>;
  if (typeof value === "undefined") return <span className={c("otherValue")}>undefined</span>;
  return <span className={c("otherValue")}>{preview ? (value as symbol).description ?? "Symbol" : (value as symbol).toString()}</span>;
}

function previewValue(value: unknown, depth: number): ReactNode {
  if (!isExpandableValue(value)) return primitiveValue(value, true);
  const array = Array.isArray(value);
  const entries = entriesOf(value);
  const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT;
  const [open, close] = bracketOf(value);
  return (
    <>
      <span className={c("punctuation")}>{open}</span>
      {depth >= PREVIEW_DEPTH_LIMIT
        ? <span className={c("previewEllipsis")}>…</span>
        : entries.slice(0, limit).map(([key, item], index) => (
          <span key={key}>
            {index > 0 && <span className={c("punctuation")}>, </span>}
            {!array && (<><span className={c("previewProperty")}>{key}</span><span className={c("punctuation")}>: </span></>)}
            {previewValue(item, depth + 1)}
          </span>
        ))}
      {depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && <span className={c("previewEllipsis")}>, …</span>}
      <span className={c("punctuation")}>{close}</span>
    </>
  );
}

function moveFocus(button: HTMLElement, direction: -1 | 1) {
  const tree = button.closest<HTMLElement>('[role="tree"]');
  if (!tree) return;
  const expanders = Array.from(tree.querySelectorAll<HTMLElement>("[data-json-expander]"));
  const current = expanders.indexOf(button);
  if (current < 0) return;
  expanders[(current + direction + expanders.length) % expanders.length]?.focus();
}

type CopyState = "idle" | "copied" | "failed";

function CopyAction({ path, value, persistent = false }: { path: JsonPath; value: unknown; persistent?: boolean }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const object = typeof value === "object" && value !== null;
  const copy = async (mode: CopyMode) => {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(copyText(path, value, mode));
    } catch {
      next = "failed";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };
  const title = state === "copied" ? "已复制" : state === "failed" ? "复制失败" : object ? "复制 JSON" : "复制值";
  const items: readonly (readonly [CopyMode, string])[] = object
    ? [["prettyJson", "复制 JSON（格式化）"], ["json", "复制 JSON（紧凑）"], ["path", "复制路径"]]
    : [["value", "复制值"], ["json", "复制 JSON"], ["path", "复制路径"]];
  return (
    <span className={c("copySlot")} data-persistent={persistent || undefined}>
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className={c("actionButton")} data-json-copy-button data-state={state} aria-label={title} title={title}>
            {state === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          {items.map(([mode, label]) => <MenuItem key={mode} onSelect={() => void copy(mode)}>{label}</MenuItem>)}
        </MenuContent>
      </Menu>
    </span>
  );
}

function Field({ field, onToggle }: { field: string | undefined; onToggle?: () => void }) {
  if (field === undefined) return null;
  return <span className={cn(c("label"), onToggle && c("clickableLabel"))} onClick={onToggle}>{fieldText(field)}:</span>;
}

function Comma({ last }: { last: boolean }) {
  return last ? null : <span className={c("punctuation")}>,</span>;
}

function JsonString({ lines, field, last, path, copyable, value }: {
  lines: number; field: string | undefined; last: boolean; path: JsonPath; copyable: boolean; value: string;
}) {
  const contentsId = useId();
  const contentRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (expanded || !content) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight) || 16;
      setTruncated(content.scrollHeight > lineHeight * lines);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [lines, expanded, field, last, value]);

  if (expanded) {
    const fieldId = `${contentsId}-field`;
    return (
      <div className={c("stringField")} data-expanded>
        {field !== undefined && <span id={fieldId} className={c("label")}>{fieldText(field)}:</span>}
        <pre id={contentsId} className={c("stringRaw")} tabIndex={0} aria-labelledby={field === undefined ? undefined : fieldId}>{value}</pre>
        <Comma last={last} />
        <div className={c("stringActions")}>
          <button type="button" className={c("actionButton")} aria-label="收起" title="收起" aria-expanded aria-controls={contentsId} onClick={() => setExpanded(false)}>
            <Minimize2 size={12} aria-hidden="true" />
          </button>
          {copyable && <CopyAction path={path} value={value} persistent />}
        </div>
      </div>
    );
  }
  return (
    <>
      {copyable && <CopyAction path={path} value={value} />}
      <span className={c("stringField")}>
        <span ref={contentRef} id={contentsId} className={c("stringText")}>
          {truncated && (
            <span className={c("stringToggleSlot")}>
              <button type="button" className={c("stringToggle")} aria-label="展开" aria-expanded={false} aria-controls={contentsId} onClick={() => setExpanded(true)}>
                <span aria-hidden="true">…</span>展开
              </button>
            </span>
          )}
          <Field field={field} />
          {primitiveValue(value)}
          <Comma last={last} />
        </span>
      </span>
    </>
  );
}

type NodeProps = {
  lines: number; field?: string; last: boolean; path: JsonPath; value: unknown; copyable: boolean;
  tabStopId: string | null; onClaimTabStop: (id: string) => void;
};

function JsonNode({ lines, field, last, path, value, copyable, tabStopId, onClaimTabStop }: NodeProps) {
  const contentsId = useId();
  const expanderRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const nodeId = pathId(path);
  const container = isExpandableValue(value);
  const entries = container ? entriesOf(value) : [];
  const expandable = entries.length > 0;

  const toggle = () => {
    setExpanded((current) => !current);
    expanderRef.current?.focus();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setExpanded(event.key === "ArrowRight");
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(event.currentTarget, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };
  const row = (children: ReactNode, ariaExpanded?: boolean) => (
    <div className={c("row")} role="treeitem" aria-expanded={ariaExpanded}>
      {typeof value !== "string" && copyable && <CopyAction path={path} value={value} />}
      {children}
    </div>
  );

  if (typeof value === "string") {
    return row(<JsonString lines={lines} field={field} last={last} path={path} copyable={copyable} value={value} />);
  }
  if (!container || !expandable) {
    const [open, close] = container ? bracketOf(value) : ["", ""];
    return row(
      <>
        <Field field={field} />
        {container
          ? (<><span className={c("punctuation")}>{open}</span><span className={c("punctuation")}>{close}</span></>)
          : primitiveValue(value)}
        <Comma last={last} />
      </>,
    );
  }
  return row(
    <>
      <span
        ref={expanderRef}
        className={cn(c("expander"), expanded ? c("collapseIcon") : c("expandIcon"))}
        data-json-expander
        role="button"
        aria-label={expanded ? "收起" : "展开"}
        aria-expanded={expanded}
        aria-controls={expanded ? contentsId : undefined}
        tabIndex={tabStopId === nodeId ? 0 : -1}
        onFocus={() => onClaimTabStop(nodeId)}
        onClick={toggle}
        onKeyDown={onKeyDown}
      />
      <span className={c("summary")}>
        <Field field={field} onToggle={toggle} />
        <span className={c("preview")}>{previewValue(value, 0)}</span>
        <Comma last={last} />
      </span>
      {expanded && (
        <ul id={contentsId} role="group" className={c("children")}>
          {entries.map(([key, item], index) => (
            <JsonNode
              key={key} lines={lines} field={key} value={item} copyable={copyable}
              path={[...path, Array.isArray(value) ? index : key]}
              last={index === entries.length - 1} tabStopId={tabStopId} onClaimTabStop={onClaimTabStop}
            />
          ))}
        </ul>
      )}
    </>,
    expanded,
  );
}

export type JsonTreeProps = {
  /** 要展示的值；对象 / 数组按树展示，其他类型按单个叶子展示。 */
  data: unknown;
  /** 树的 aria-label。 */
  label?: string;
  /** 折叠状态下字符串最多显示的行数，默认 12。 */
  collapsedStringLines?: number;
  /** 每行是否提供复制菜单，默认 true。 */
  copyable?: boolean;
  className?: string;
};

export function JsonTree({ data, label = "JSON", collapsedStringLines = 12, copyable = true, className }: JsonTreeProps) {
  const rootEntries = isExpandableValue(data) ? entriesOf(data) : [];
  const firstExpandable = rootEntries.findIndex(([, value]) => isExpandableValue(value) && entriesOf(value).length > 0);
  const firstEntry = rootEntries[firstExpandable];
  const initialTabStopId = firstEntry ? pathId([Array.isArray(data) ? firstExpandable : firstEntry[0]]) : null;
  const [tabStopId, setTabStopId] = useState<string | null>(initialTabStopId);
  useEffect(() => setTabStopId(initialTabStopId), [data, initialTabStopId]);

  const style = { "--json-tree-collapsed-lines": collapsedStringLines } as CSSProperties;
  if (!isExpandableValue(data)) {
    return (
      <div className={cn(c("root"), className)} style={style}>
        <div aria-label={label} className={c("container")} role="tree">
          <JsonNode lines={collapsedStringLines} value={data} path={[]} last copyable={copyable} tabStopId={null} onClaimTabStop={setTabStopId} />
        </div>
      </div>
    );
  }
  const [open, close] = bracketOf(data);
  return (
    <div className={cn(c("root"), className)} style={style}>
      <div className={c("expandedTopLevel")}>
        <div className={cn(c("row"), c("topLevelBracket"))} data-json-root-row>
          {copyable && <CopyAction path={[]} value={data} />}
          <span className={c("punctuation")}>{open}</span>
        </div>
        <div aria-label={label} className={cn(c("container"), c("expandedTopLevelContainer"))} role="tree">
          {rootEntries.map(([key, value], index) => (
            <JsonNode
              key={key} lines={collapsedStringLines} field={key} value={value} copyable={copyable}
              path={[Array.isArray(data) ? index : key]} last={index === rootEntries.length - 1}
              tabStopId={tabStopId} onClaimTabStop={setTabStopId}
            />
          ))}
        </div>
        <div className={cn(c("row"), c("topLevelBracket"))}>
          <span className={c("punctuation")}>{close}</span>
        </div>
      </div>
    </div>
  );
}
