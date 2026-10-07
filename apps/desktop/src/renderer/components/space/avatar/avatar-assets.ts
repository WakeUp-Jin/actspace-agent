import companion1 from "../../../assets/subagents/companion-1.webp";
import companion2 from "../../../assets/subagents/companion-2.webp";
import companion3 from "../../../assets/subagents/companion-3.webp";
import companion4 from "../../../assets/subagents/companion-4.webp";
import companion5 from "../../../assets/subagents/companion-5.webp";
import companion6 from "../../../assets/subagents/companion-6.webp";
import companion7 from "../../../assets/subagents/companion-7.webp";
import companion8 from "../../../assets/subagents/companion-8.webp";
import companion9 from "../../../assets/subagents/companion-9.webp";
import ballLilac from "../../../assets/space/ball-lilac.png";
import ballInk from "../../../assets/space/ball-ink.png";
import ballForest from "../../../assets/space/ball-forest.png";
import ballPeach from "../../../assets/space/ball-peach.png";
import ballCream from "../../../assets/space/ball-cream.png";
import spacePeach from "../../../assets/space/space-peach.png";
import spaceForest from "../../../assets/space/space-forest.png";
import spaceCream from "../../../assets/space/space-cream.png";
import spaceSlate from "../../../assets/space/space-slate.png";
import spaceBlush from "../../../assets/space/space-blush.png";
import spaceMidnight from "../../../assets/space/space-midnight.png";

// 数组顺序决定映射，不要重排（和 demo、素材 README 一致）
export const SPACE_COLORS = ["peach", "forest", "cream", "slate", "blush", "midnight"] as const;
export const BALL_COLORS = ["lilac", "ink", "forest", "peach", "cream"] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];
export type BallColor = (typeof BALL_COLORS)[number];

const companions = [companion1, companion2, companion3, companion4, companion5, companion6, companion7, companion8, companion9];
const balls: Record<BallColor, string> = { lilac: ballLilac, ink: ballInk, forest: ballForest, peach: ballPeach, cream: ballCream };
const spaces: Record<SpaceColor, string> = {
  peach: spacePeach, forest: spaceForest, cream: spaceCream, slate: spaceSlate, blush: spaceBlush, midnight: spaceMidnight,
};

// 和 demo 完全一致：同一个 id 在 demo 和桌面端拿到同一种颜色
export const hashId = (id: string): number => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const ballColorFor = (id: string): BallColor => BALL_COLORS[hashId(id) % BALL_COLORS.length];
export const ballFor = (id: string): string => balls[ballColorFor(id)];

/** n 是 1..9 的角色图序号 */
export const companionFor = (n: number): string => companions[Math.min(Math.max(Math.round(n), 1), companions.length) - 1];

export const spaceImageFor = (color: string): string => spaces[(color in spaces ? color : "peach") as SpaceColor];

/** 第 index 个创建的 Space 用什么底色 */
export const spaceColorAt = (index: number): SpaceColor => SPACE_COLORS[((index % SPACE_COLORS.length) + SPACE_COLORS.length) % SPACE_COLORS.length];
