import type { SessionSurfaceView } from "./surface.js";

declare const trustedSurface: unique symbol;
/**
 * 日志交出的对话视图（agent-spec-context-trusted-surface.md §3.1）：视图、entries、条目、节点外壳都已冻结，
 * 节点字段引用日志里已校验、已深度冻结的事件 data。只有 `SessionJournal.surface` 能产出；运行时以 WeakSet 为准。
 */
export type TrustedSurfaceView = SessionSurfaceView & { readonly [trustedSurface]: true };

const trustedViews = new WeakSet<object>();

/**
 * 登记日志交出的视图。只给 `SessionJournal` 用，不从包入口导出：
 * `SessionSurface.fromView` / `fromEvents` 接受调用方的任意输入，它们的视图不能算已信任。
 */
export function trustSurfaceView(view: SessionSurfaceView): TrustedSurfaceView {
  trustedViews.add(view);
  return view as TrustedSurfaceView;
}

/** 是否日志产出的视图。形状相同的普通对象不算。 */
export function isTrustedSurfaceView(value: unknown): value is TrustedSurfaceView {
  return typeof value === "object" && value !== null && trustedViews.has(value);
}

/**
 * 对话的版本号（规范 §3.3）：日志里的对话只能追加（条数、最后一个 seq 变）或替换（replaceGeneration 加 1），
 * 所以已信任视图的版本号相同，内容就相同。不是已信任视图时退回整份转字符串。
 */
export function surfaceViewVersion(view: SessionSurfaceView): string {
  if (!isTrustedSurfaceView(view)) return JSON.stringify(view);
  const last = view.entries.at(-1);
  const lastSeq = last ? last.sourceEventSeqs.reduce((max, seq) => Math.max(max, seq), -1) : -1;
  return `${view.replaceGeneration}:${view.entries.length}:${lastSeq}`;
}
