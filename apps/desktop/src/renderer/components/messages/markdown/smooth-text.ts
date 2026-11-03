import { useLayoutEffect, useRef, useState } from "react";

/**
 * 平滑输出（规范 §7.3）：网络上的 token 是一批一批到的（一次几十个字、间隔几百毫秒），
 * 这里按帧把积压的文字匀速放出来——每帧放出“剩余积压 ÷ 12”个字符，向上取整，至少 1 个，积压越多放得越快，
 * 大约 200ms 内追平。
 */

/**
 * 切点落在半截语法上时，往后挪到这段语法结束；只有后文已经到达才挪，后文还没到就不动（等它到）：
 * - 表格行、代码围栏行：整行一起出现，避免列宽和代码块头反复重排；
 * - 没闭合的行内代码、`**` 粗体；
 * - 写了一半的链接 `[文字](地址)`。
 *
 * 围栏行（包括只写了一两个反引号的行）是例外：后文没到时退回行首，整行先不放出。
 * 收尾围栏写到 "``" 时如果放出来，代码块里会多出一行，下一帧围栏闭合又收回去（规范 §7.2 代码块不能回缩）。
 * `complete` 为真（网络流已结束，文字不会再变）时，行尾就是全文结尾，不用再等。
 */
const FENCE_LINE = /^\s*(?:`{3,}|~{3,}|`{1,2}$|~{1,2}$)/;

export function snapCut(text: string, cut: number, complete = false): number {
  const lineStart = text.lastIndexOf("\n", cut - 1) + 1;
  const lineEndRaw = text.indexOf("\n", cut);
  const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, cut);
  const rest = text.slice(cut, lineEnd);
  if (FENCE_LINE.test(text.slice(lineStart, lineEnd))) {
    if (lineEndRaw >= 0) return lineEnd + 1;
    return complete ? text.length : lineStart;
  }
  if (/^\s*\|/.test(line)) return lineEndRaw < 0 ? cut : lineEnd + 1;

  let next = cut;
  if ((line.match(/`/g)?.length ?? 0) % 2 === 1) {
    const close = rest.indexOf("`");
    if (close >= 0) next = Math.max(next, cut + close + 1);
  }
  if ((line.match(/\*\*/g)?.length ?? 0) % 2 === 1) {
    const close = rest.indexOf("**");
    if (close >= 0) next = Math.max(next, cut + close + 2);
  }
  const open = line.lastIndexOf("[");
  if (open >= 0 && !/\]\([^)]*\)/.test(line.slice(open))) {
    const link = (line.slice(open) + rest).match(/^\[[^\]\n]*\](\([^)\n]*\))?/);
    if (link?.[1]) next = Math.max(next, lineStart + open + link[0].length);
  }
  return next;
}

/**
 * 这一帧该放到哪：积压 ÷ 12 向上取整（至少 1 个），再避开半截语法。
 * 切点被退回到已显示的位置之前（在等一行没写完的围栏）时返回 shown，表示这一帧不放。
 */
export function nextCut(target: string, shown: number, complete = false): number {
  const backlog = target.length - shown;
  const wanted = shown + Math.max(1, Math.ceil(backlog / 12));
  const snapped = snapCut(target, wanted, complete);
  if (snapped <= shown) return shown;
  return Math.min(target.length, snapped);
}

/**
 * 返回平滑后的文字，以及是否还有积压没放完。
 * - `streaming` 为真：新到的内容按帧放出；
 * - `streaming` 变假时还有积压：继续放完（调用方放完之前仍按流式显示）；
 * - 不在流式中，或内容不是在末尾追加（变短、被改写）：直接显示全部。
 * 首次挂载时已有的内容整段直接显示。
 */
export function useSmoothText(target: string, streaming: boolean): { text: string; backlog: boolean } {
  const [length, setLength] = useState(target.length);
  const shown = useRef(target.length);
  const previous = useRef(target);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = target;
    const draining = shown.current < before.length;
    const appended = target.length >= before.length && target.startsWith(before);
    if (!appended || (!streaming && !draining) || shown.current >= target.length) {
      if (shown.current !== target.length) {
        shown.current = target.length;
        setLength(target.length);
      }
      return;
    }
    let frame = 0;
    const step = () => {
      const next = nextCut(target, shown.current, !streaming);
      // 没有进展：在等一行没写完的围栏，停下来，等下一批文字到达（或流式结束）时 effect 重新开始。
      if (next <= shown.current) return;
      shown.current = next;
      setLength(next);
      if (next < target.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, streaming]);

  const backlog = length < target.length;
  return { text: backlog ? target.slice(0, length) : target, backlog };
}
