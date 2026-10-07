import { describe, expect, it } from "vitest";
import { FLIP_MIN_DELTA, flipDeltas, freshRowIds } from "../components/space/panel/use-flip-rows";

describe("flipDeltas", () => {
  it("returns old minus new position for rows that moved", () => {
    expect(flipDeltas({ a: 100, b: 140 }, { a: 140, b: 100 })).toEqual({ a: -40, b: 40 });
  });

  it("ignores rows that did not move or moved less than the threshold", () => {
    const before = { a: 100, b: 140, c: 200 };
    const after = { a: 100, b: 140 + FLIP_MIN_DELTA / 2, c: 200 };
    expect(flipDeltas(before, after)).toEqual({});
  });

  it("ignores rows that only exist on one side", () => {
    expect(flipDeltas({ gone: 10, a: 50 }, { fresh: 10, a: 80 })).toEqual({ a: -30 });
  });
});

describe("freshRowIds", () => {
  it("lists rows that were not measured before, in order", () => {
    expect(freshRowIds({ a: 0, b: 36 }, { a: 0, x: 36, b: 72, y: 108 })).toEqual(["x", "y"]);
  });

  it("is empty when nothing is new", () => {
    expect(freshRowIds({ a: 0 }, { a: 0 })).toEqual([]);
  });
});
