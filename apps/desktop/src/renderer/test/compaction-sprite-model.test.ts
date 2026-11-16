import {
  PACK_UNITS,
  SPRITE_BEAT_MS,
  SPRITE_EASE_TAU_MS,
  barLengthAt,
  failedLength,
  finishStep,
  isPushBeat,
  layoutBricks,
  makeBricks,
  naturalLength,
} from "../components/messages/compaction-sprite-model";

describe("compaction sprite model", () => {
  it("makes the same bricks for the same seed and fits the room", () => {
    const a = makeBricks(42, 200);
    expect(makeBricks(42, 200)).toEqual(a);
    expect(naturalLength(a)).toBeLessThanOrEqual(200);
    expect(a.every((width) => width >= 2 && width <= 8)).toBe(true);
  });

  it("squeezes the end next to the sprite first: gaps close, then bricks narrow", () => {
    const widths = [4, 4, 4];
    expect(layoutBricks(widths, naturalLength(widths))).toEqual([
      { x: 0, width: 4, squeezed: false },
      { x: 5, width: 4, squeezed: false },
      { x: 10, width: 4, squeezed: false },
    ]);
    // 短 1 格：最右边那条缝先合上。
    expect(layoutBricks(widths, 13)).toEqual([
      { x: 0, width: 4, squeezed: false },
      { x: 5, width: 4, squeezed: true },
      { x: 9, width: 4, squeezed: true },
    ]);
    // 缝全合上之后，从最右边那块开始变窄，每块至少 1 格。
    const tight = layoutBricks(widths, 3);
    expect(tight.map((segment) => segment.width)).toEqual([1, 1, 1]);
    expect(tight.every((segment) => segment.squeezed)).toBe(true);
  });

  it("shortens at most one cell per push and never reaches the minimum before finishing", () => {
    const full = 200;
    const min = 30;
    let previous = barLengthAt(full, min, 0);
    expect(previous).toBe(full);
    for (let t = SPRITE_BEAT_MS; t <= 10 * 60_000; t += SPRITE_BEAT_MS) {
      const length = barLengthAt(full, min, t);
      expect(previous - length).toBeLessThanOrEqual(1);
      expect(length).toBeGreaterThan(min);
      previous = length;
    }
  });

  it("slows down over time and resumes at the same place for the same elapsed time", () => {
    // 前段按每两拍 1 格匀速推；碰到 e^(-t/τ) 下限之后越推越慢。
    const full = 60;
    const min = 10;
    const early = full - barLengthAt(full, min, SPRITE_EASE_TAU_MS);
    const late = barLengthAt(full, min, SPRITE_EASE_TAU_MS * 2) - barLengthAt(full, min, SPRITE_EASE_TAU_MS * 3);
    expect(early).toBeGreaterThan(late);
    expect(barLengthAt(full, min, 15_000)).toBe(barLengthAt(full, min, 15_000));
  });

  it("alternates stand and push beats", () => {
    expect(isPushBeat(0)).toBe(false);
    expect(isPushBeat(SPRITE_BEAT_MS)).toBe(true);
    expect(isPushBeat(SPRITE_BEAT_MS * 2)).toBe(false);
  });

  it("finishes into the pack in a few beats", () => {
    let length = 180;
    let beats = 0;
    while (length > PACK_UNITS) {
      length = finishStep(length);
      beats += 1;
    }
    expect(length).toBe(PACK_UNITS);
    expect(beats).toBeLessThan(15);
  });

  it("draws a failure that was never seen running at about half length", () => {
    expect(failedLength(200, 30)).toBe(110);
    expect(failedLength(40, 30)).toBe(30);
  });
});
