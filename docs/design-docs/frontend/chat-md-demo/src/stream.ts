/**
 * 流式输出的末尾效果（只作用于正在生成的最后一块）：
 * - 末尾渐显：最后几十个字按距离分 1–3 层透明度，新字像“显影”一样浮出来；
 * - 光标：插在最后一个可见字后面。
 *
 * 稳定性约束（都会让高度一帧一跳）：
 * - 光标不能落在结尾换行符后面，否则多出一行、下一帧又收回；
 * - 代码块里不放光标（代码块头已经有「写入中」）；
 * - 平滑输出不能停在半截语法上（半个反引号、半个链接、半行表格）。
 */
import { useEffect, useRef, useState } from "react";

const LEVELS = [10, 22, 36];

type Opts = { fade: number; caret: "none" | "dot" | "bar" | "block" };

export function rehypeStreamTail(opts: Opts) {
  return (tree: any) => {
    const texts: { node: any; parent: any; inPre: boolean }[] = [];
    const walk = (node: any, inPre: boolean) => {
      for (const child of node.children ?? []) {
        if (child.type === "text") texts.push({ node: child, parent: node, inPre });
        else if (child.type === "element") {
          const cls = child.properties?.className;
          if (Array.isArray(cls) && cls.some((c: unknown) => String(c).startsWith("katex"))) continue;
          walk(child, inPre || child.tagName === "pre");
        }
      }
    };
    walk(tree, false);
    while (texts.length && !texts[texts.length - 1].node.value.trim()) texts.pop();
    if (!texts.length) return;

    const last = texts[texts.length - 1];
    if (opts.caret !== "none" && !last.inPre) {
      // 光标放在结尾空白（含换行）之前
      const value: string = last.node.value;
      const trail = value.match(/\s*$/)![0];
      const caret = { type: "element", tagName: "span", properties: { className: ["md-caret", `md-caret-${opts.caret}`], ariaHidden: "true" }, children: [] };
      const parts: any[] = [{ type: "text", value: value.slice(0, value.length - trail.length) }, caret];
      if (trail) parts.push({ type: "text", value: trail });
      last.parent.children.splice(last.parent.children.indexOf(last.node), 1, ...parts);
      last.node = parts[0];
    }

    const levels = LEVELS.slice(0, opts.fade);
    if (!levels.length) return;
    const limit = levels[levels.length - 1];
    let consumed = 0;
    for (let i = texts.length - 1; i >= 0 && consumed < limit; i--) {
      const { node, parent } = texts[i];
      const value: string = node.value;
      const pieces: any[] = [];
      let end = value.length;
      while (end > 0 && consumed < limit) {
        const level = levels.findIndex((t) => consumed < t);
        const take = Math.min(end, levels[level] - consumed);
        pieces.unshift({ type: "element", tagName: "span", properties: { className: ["md-tail", `md-tail-${level + 1}`] }, children: [{ type: "text", value: value.slice(end - take, end) }] });
        end -= take;
        consumed += take;
      }
      if (end > 0) pieces.unshift({ type: "text", value: value.slice(0, end) });
      parent.children.splice(parent.children.indexOf(node), 1, ...pieces);
    }
  };
}

/** 切点落在半截语法里时，往后挪到这段语法结束（只在后文已经到达时才挪）。 */
export function snapCut(text: string, cut: number): number {
  const lineStart = text.lastIndexOf("\n", cut - 1) + 1;
  const lineEndRaw = text.indexOf("\n", cut);
  const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, cut);
  const rest = text.slice(cut, lineEnd);
  // 表格行、代码围栏行：整行一起出现，避免列宽和代码块头反复重排
  if (/^\s*\|/.test(line) || /^\s*(```|~~~)/.test(line)) return lineEndRaw < 0 ? cut : lineEnd + 1;
  let next = cut;
  // 行内代码
  if (((line.match(/`/g)?.length ?? 0) % 2) === 1) {
    const i = rest.indexOf("`");
    if (i >= 0) next = Math.max(next, cut + i + 1);
  }
  // 粗体
  if (((line.match(/\*\*/g)?.length ?? 0) % 2) === 1) {
    const i = rest.indexOf("**");
    if (i >= 0) next = Math.max(next, cut + i + 2);
  }
  // 链接 [文字](地址)
  const open = line.lastIndexOf("[");
  if (open >= 0 && !/\]\([^)]*\)/.test(line.slice(open))) {
    const m = (line.slice(open) + rest).match(/^\[[^\]\n]*\](\([^)\n]*\))?/);
    if (m && m[1]) next = Math.max(next, lineStart + open + m[0].length);
  }
  return next;
}

/**
 * 平滑输出：网络上的 token 是一批一批到的（一次几十个字、间隔几百毫秒），
 * 这里按帧匀速放出来，积压越多放得越快，大约 200ms 内追平。
 */
export function useSmoothText(target: string, enabled: boolean): string {
  const [length, setLength] = useState(target.length);
  const lengthRef = useRef(target.length);
  useEffect(() => {
    if (!enabled || target.length < lengthRef.current) {
      lengthRef.current = target.length;
      setLength(target.length);
      return;
    }
    let frame = 0;
    const step = () => {
      const backlog = target.length - lengthRef.current;
      if (backlog <= 0) return;
      const cut = lengthRef.current + Math.max(1, Math.ceil(backlog / 12));
      lengthRef.current = Math.min(target.length, snapCut(target, cut));
      setLength(lengthRef.current);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return enabled ? target.slice(0, Math.min(length, target.length)) : target;
}
