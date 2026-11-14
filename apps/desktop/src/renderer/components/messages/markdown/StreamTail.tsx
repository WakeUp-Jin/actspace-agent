import { createContext, useContext, type ReactNode } from "react";
import { BlockStateContext } from "./contexts";
import { TAIL_FADE_LIMIT, TAIL_LEVELS } from "./rehype-stream-tail";

/**
 * 原样尾巴与末尾渐显（front-流式Markdown解析降频规范.md §3.2）。
 * rehype-stream-tail 在最后一块的 hast 上放好 `act-stream-tail` / `act-fade` 两种占位元素，
 * 这里的组件从 context 读这一帧的尾巴：块本身不重新解析，平滑输出每帧只有这几个小组件重新渲染。
 */

export type StreamTail = {
  /** 已解析长度之后、这一帧放出来的字。正文里不含换行（遇到换行会立即解析），没闭合的代码块里可以有多行。 */
  readonly text: string;
  /** 已解析部分结尾的空格：Markdown 会把段落末尾的空格去掉，尾巴接上时要补回来。 */
  readonly lead: string;
};

export const NO_TAIL: StreamTail = { text: "", lead: "" };
export const StreamTailContext = createContext<StreamTail>(NO_TAIL);

/** 尾巴里会占渐显字数的部分：结尾空白在光标后面，不算。 */
function tailLength(tail: StreamTail): number {
  return tail.text ? (tail.lead + tail.text).trimEnd().length : 0;
}

/**
 * 把一段文字的末尾拆成渐显的 span。`offset` 是这段文字后面还有几个字（已经占掉的渐显字数）：
 * 从末尾往前数，第 1–10 个字 md-tail-1，11–22 md-tail-2，23–36 md-tail-3，更前面的原样。
 */
function fadePieces(value: string, offset: number): ReactNode[] {
  const pieces: ReactNode[] = [];
  let end = value.length;
  let consumed = offset;
  while (end > 0 && consumed < TAIL_FADE_LIMIT) {
    const level = TAIL_LEVELS.findIndex((threshold) => consumed < threshold);
    const take = Math.min(end, TAIL_LEVELS[level] - consumed);
    pieces.unshift(
      <span key={end} className={`md-tail md-tail-${level + 1}`}>
        {value.slice(end - take, end)}
      </span>,
    );
    end -= take;
    consumed += take;
  }
  if (end > 0) pieces.unshift(value.slice(0, end));
  return pieces;
}

type FadeProps = { "data-after"?: number | string; children?: ReactNode; node?: unknown };

/** 已解析部分最后 36 个字里的一段文字：尾巴越长，这里承担的渐显越少。 */
export function StreamFade({ "data-after": after, children }: FadeProps) {
  const tail = useContext(StreamTailContext);
  if (typeof children !== "string") return <>{children}</>;
  return <>{fadePieces(children, Number(after ?? 0) + tailLength(tail))}</>;
}

type TailProps = { "data-pre"?: string; "data-filled"?: string; "data-root"?: string; node?: unknown };

/**
 * 尾巴本身：普通块里是一个行内 span，带渐显，光标跟在后面（结尾空白放在光标之后）；
 * 没闭合的代码块里接在代码最后一行，不高亮、不放光标；代码区已有内容（`data-filled`）、块源码又以换行结尾时，尾巴是新的一行；
 * `data-root`：块里没有可接的容器，什么都不显示。
 */
export function StreamTailSlot({ "data-pre": pre, "data-filled": filled, "data-root": root }: TailProps) {
  const tail = useContext(StreamTailContext);
  const { source } = useContext(BlockStateContext);
  if (root !== undefined) return null;
  if (pre !== undefined) {
    if (!tail.text) return null;
    // 和解析结果对齐：代码区的文字是「源码去掉一个结尾换行 + 补一个换行」，尾巴结尾的换行不另起空行，否则下次解析会少一行（代码块回缩）。
    const text = `${filled !== undefined && source.endsWith("\n") ? "\n" : ""}${tail.text}`.replace(/\n$/, "");
    return text ? <span className="md-tail-raw">{fadePieces(text, 0)}</span> : null;
  }
  const full = tail.text ? tail.lead + tail.text : "";
  const head = full.trimEnd();
  const trail = full.slice(head.length);
  return (
    <span className="md-tail-raw">
      {fadePieces(head, 0)}
      <span className="md-caret" aria-hidden="true" />
      {trail || null}
    </span>
  );
}
