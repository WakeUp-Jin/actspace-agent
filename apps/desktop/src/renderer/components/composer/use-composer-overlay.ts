import { useState } from "react";
import type { ComposerStat } from "./ComposerStatsPills";
import type { RunTargetField } from "./RunTargetRow";

/** 输入框上的浮层同一时间只开一个（05 §2.3）。斜杠菜单跟着输入内容走，不在这里。 */
export type ComposerOverlay =
  | null
  | { kind: "palette" }
  | { kind: "model" }
  | { kind: "context" }
  | { kind: "stats"; stat: ComposerStat }
  | { kind: "run-target"; field: RunTargetField };

function overlayKey(overlay: ComposerOverlay): string | null {
  if (overlay === null) return null;
  if (overlay.kind === "run-target") return `run-target:${overlay.field}`;
  return overlay.kind === "stats" ? `stats:${overlay.stat}` : overlay.kind;
}

/** 09 T30：`+` 面板、模型菜单、上下文用量浮层、状态行统计胶囊面板和新建页运行位置选择器的开关。 */
export function useComposerOverlay() {
  const [overlay, setOverlay] = useState<ComposerOverlay>(null);
  return {
    overlay,
    paletteOpen: overlay?.kind === "palette",
    modelOpen: overlay?.kind === "model",
    contextOpen: overlay?.kind === "context",
    openStat: overlay?.kind === "stats" ? overlay.stat : null,
    runTargetField: overlay?.kind === "run-target" ? overlay.field : null,
    close: () => setOverlay(null),
    // 打开一个浮层就顶掉其他浮层；关闭只关它自己：晚到的关闭回调不会关掉刚打开的另一个。
    setOpen(next: NonNullable<ComposerOverlay>, open: boolean) {
      setOverlay((current) => (open ? next : overlayKey(current) === overlayKey(next) ? null : current));
    },
    toggle(next: NonNullable<ComposerOverlay>) {
      setOverlay((current) => (overlayKey(current) === overlayKey(next) ? null : next));
    },
  };
}
