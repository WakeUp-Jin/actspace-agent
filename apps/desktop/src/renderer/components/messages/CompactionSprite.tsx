import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BAR_H,
  BAR_Y,
  PACK_ROWS,
  PACK_UNITS,
  SPRITE_BEAT_MS,
  SPRITE_FINISH_BEAT_MS,
  SPRITE_FRAMES,
  SPRITE_PX,
  SPRITE_W,
  STAGE_ROWS,
  WALL_UNITS,
  barLengthAt,
  failedLength,
  finishStep,
  framePixels,
  isPushBeat,
  layoutBricks,
  makeBricks,
  naturalLength,
  type SpriteFrame,
} from "./compaction-sprite-model";

export type CompactionSpriteMode = "running" | "finishing" | "failed";

const SVG_NS = "http://www.w3.org/2000/svg";
/** 舞台最小 96px（48 格）；jsdom 和隐藏时 clientWidth 为 0，也按这个算。 */
const MIN_UNITS = 48;
const HOP_OFFSETS = [-2, -1, 0, 0, 0, 0];

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  return element;
}

function pixelGroup(rows: readonly string[], bodyClass: string, eyeClass: string): SVGGElement {
  const group = svgEl("g", {});
  const { body, eyes } = framePixels(rows);
  for (const [x, y] of body) group.appendChild(svgEl("rect", { class: bodyClass, x, y, width: 1, height: 1 }));
  for (const [x, y] of eyes) group.appendChild(svgEl("rect", { class: eyeClass, x, y, width: 1, height: 1 }));
  return group;
}

interface DrawState {
  length: number;
  frame: SpriteFrame;
  dust: boolean;
  hop: number;
  packed: boolean;
  spriteHidden: boolean;
}

/**
 * 舞台只在建立（挂载、宽度变化）时生成一次 SVG；之后每拍只改有变化的属性，不走 React 渲染。
 * front-轮尾与导航规范「上下文压缩分隔线」：逐格，不做连续补间。
 */
class SpriteStage {
  readonly full: number;
  readonly minLength: number;
  lastLength: number | undefined;
  private readonly widths: number[];
  private readonly bricks: SVGRectElement[] = [];
  private readonly brickCache: string[] = [];
  private readonly frames = new Map<SpriteFrame, SVGGElement>();
  private readonly sprite: SVGGElement;
  private readonly pack: SVGGElement;
  private readonly trail: SVGLineElement;
  private readonly dust: SVGRectElement;
  private shownFrame: SpriteFrame | undefined;
  private spriteTransform = "";

  constructor(host: HTMLElement, seed: number) {
    const units = Math.max(MIN_UNITS, Math.floor(host.clientWidth / SPRITE_PX));
    this.widths = makeBricks(seed, units - WALL_UNITS - SPRITE_W - 1);
    this.full = naturalLength(this.widths);
    this.minLength = this.widths.length;
    const svg = svgEl("svg", { viewBox: `0 0 ${units} ${STAGE_ROWS}`, width: units * SPRITE_PX, height: STAGE_ROWS * SPRITE_PX, "shape-rendering": "crispEdges", "aria-hidden": "true", focusable: "false" });
    svg.appendChild(svgEl("rect", { class: "cs-wall", x: 0, y: 1, width: 1, height: STAGE_ROWS - 2 }));
    for (let index = 0; index < this.widths.length; index += 1) {
      const rect = svgEl("rect", { class: "cs-brick", x: WALL_UNITS, y: BAR_Y, width: 1, height: BAR_H });
      this.bricks.push(rect);
      this.brickCache.push("");
      svg.appendChild(rect);
    }
    this.pack = pixelGroup(PACK_ROWS, "cs-pack", "cs-pack");
    this.pack.setAttribute("transform", `translate(${WALL_UNITS} ${BAR_Y})`);
    this.pack.style.display = "none";
    svg.appendChild(this.pack);
    this.trail = svgEl("line", { class: "cs-trail", x1: units, x2: units, y1: BAR_Y + 1.5, y2: BAR_Y + 1.5, "stroke-width": 1, "stroke-dasharray": "1 2" });
    svg.appendChild(this.trail);
    this.dust = svgEl("rect", { class: "cs-dust", x: 0, y: STAGE_ROWS - 2, width: 1, height: 1 });
    this.dust.style.display = "none";
    svg.appendChild(this.dust);
    this.sprite = svgEl("g", {});
    for (const frame of Object.keys(SPRITE_FRAMES) as SpriteFrame[]) {
      const group = pixelGroup(SPRITE_FRAMES[frame], "cs-body", "cs-eye");
      group.style.display = "none";
      this.frames.set(frame, group);
      this.sprite.appendChild(group);
    }
    svg.appendChild(this.sprite);
    host.replaceChildren(svg);
  }

  draw(state: DrawState): void {
    if (state.packed) {
      this.pack.style.display = "";
      for (const rect of this.bricks) rect.style.display = "none";
    } else {
      this.pack.style.display = "none";
      layoutBricks(this.widths, state.length).forEach((segment, index) => {
        const key = `${segment.x}:${segment.width}:${segment.squeezed}`;
        if (this.brickCache[index] === key) return;
        this.brickCache[index] = key;
        const rect = this.bricks[index]!;
        rect.style.display = "";
        rect.setAttribute("x", String(WALL_UNITS + segment.x));
        rect.setAttribute("width", String(segment.width));
        // 相邻块深浅交替：挤紧、缝合上之后仍看得出一块一块，不连成一整条（demo「乙 · 逐格」）。
        rect.setAttribute("class", `cs-brick${index % 2 === 1 ? " cs-brick-alt" : ""}${segment.squeezed ? " cs-brick-squeezed" : ""}`);
      });
    }
    const barEnd = WALL_UNITS + (state.packed ? PACK_UNITS : state.length);
    const spriteX = barEnd + (state.frame === "push" ? 0 : 1);
    const transform = `translate(${spriteX} ${state.hop})`;
    if (transform !== this.spriteTransform) {
      this.spriteTransform = transform;
      this.sprite.setAttribute("transform", transform);
      this.trail.setAttribute("x1", String(spriteX + SPRITE_W + 2));
    }
    this.sprite.style.display = state.spriteHidden ? "none" : "";
    if (state.frame !== this.shownFrame) {
      if (this.shownFrame) this.frames.get(this.shownFrame)!.style.display = "none";
      this.frames.get(state.frame)!.style.display = "";
      this.shownFrame = state.frame;
    }
    this.dust.style.display = state.dust ? "" : "none";
    if (state.dust) this.dust.setAttribute("x", String(spriteX + SPRITE_W + 1));
    this.lastLength = state.length;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 压缩进行中 / 收尾 / 失败的像素舞台：墙在左，精灵把消息块往墙角推。
 * 只在 running、finishing 时有定时器；窗口隐藏时跳过绘制；减少动态效果时只画一帧。
 */
export function CompactionSprite({
  mode,
  startedAt,
  seed,
  onFinished,
}: {
  mode: CompactionSpriteMode;
  startedAt: string | undefined;
  seed: number;
  onFinished?: () => void;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<SpriteStage | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const origin = Number.isNaN(startMs) ? mountedAt : startMs;

  // 宽度变化时重建舞台（条长按时间重算，不从头推）。
  const width = useStageUnits(hostRef);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const previous = stageRef.current;
    const stage = new SpriteStage(host, seed);
    // 重建时沿用失败 / 收尾时已停住的长度（不超过新条长）。
    if (previous?.lastLength !== undefined && mode !== "running") stage.lastLength = Math.min(previous.lastLength, stage.full);
    stageRef.current = stage;
    const reduce = prefersReducedMotion();
    const runningState = (now: number): DrawState => {
      const elapsed = now - origin;
      const length = barLengthAt(stage.full, stage.minLength, elapsed);
      const push = !reduce && isPushBeat(elapsed);
      const dust = push && stage.lastLength !== undefined && length < stage.lastLength;
      return { length, frame: push ? "push" : "stand", dust, hop: 0, packed: false, spriteHidden: false };
    };

    if (mode === "failed") {
      const length = stage.lastLength ?? failedLength(stage.full, stage.minLength);
      stage.draw({ length, frame: "melt", dust: false, hop: 0, packed: false, spriteHidden: false });
      return;
    }

    if (mode === "running") {
      stage.draw(runningState(Date.now()));
      if (reduce) return;
      const timer = window.setInterval(() => {
        if (!document.hidden) stage.draw(runningState(Date.now()));
      }, SPRITE_BEAT_MS);
      return () => window.clearInterval(timer);
    }

    // finishing：一口气压成方块 → 精灵转身跳一下 → 消失 → 交给父组件换成完成行。
    let length = stage.lastLength ?? barLengthAt(stage.full, stage.minLength, Date.now() - origin);
    let hopIndex = -1;
    const timer = window.setInterval(() => {
      if (hopIndex < 0) {
        length = finishStep(length);
        const packed = length <= PACK_UNITS;
        stage.draw({ length, frame: packed ? "happy" : "push", dust: !packed, hop: 0, packed, spriteHidden: false });
        if (packed) hopIndex = 0;
        return;
      }
      if (hopIndex < HOP_OFFSETS.length) {
        stage.draw({ length, frame: "happy", dust: false, hop: HOP_OFFSETS[hopIndex]!, packed: true, spriteHidden: false });
        hopIndex += 1;
        return;
      }
      stage.draw({ length, frame: "happy", dust: false, hop: 0, packed: true, spriteHidden: true });
      window.clearInterval(timer);
      onFinishedRef.current?.();
    }, SPRITE_FINISH_BEAT_MS);
    return () => window.clearInterval(timer);
    // width 变化要重建舞台；origin 由 startedAt 决定。
  }, [mode, origin, seed, width]);

  return <span ref={hostRef} className="compact-sprite-stage relative block h-4 min-w-24 flex-1 overflow-hidden" aria-hidden="true" />;
}

/** 舞台宽度按 2px 一格取整；只有格数变了才触发重建。 */
function useStageUnits(ref: RefObject<HTMLSpanElement | null>): number {
  const [units, setUnits] = useState(0);
  useEffect(() => {
    const host = ref.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = Math.floor(host.clientWidth / SPRITE_PX);
      setUnits((previous) => (previous === next ? previous : next));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [ref]);
  return units;
}
