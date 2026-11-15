import { describe, expect, it } from "vitest";
import { hasReadableText, hasVisibleText } from "../visible-text";

describe("hasVisibleText", () => {
  it("is false for empty, whitespace-only and zero-width-only text", () => {
    for (const text of ["", "   ", "\n\t \r", "​‌‍", "⁠﻿", " ​ \n﻿"]) expect(hasVisibleText(text)).toBe(false);
  });

  it("is true as soon as one readable character appears", () => {
    for (const text of ["a", "  中", "​x", "\n\n.", "﻿**"]) expect(hasVisibleText(text)).toBe(true);
  });

  it("gives the same answer on repeated calls (no global regex state)", () => {
    expect([hasVisibleText("ab"), hasVisibleText("ab"), hasVisibleText("ab")]).toEqual([true, true, true]);
  });
});

describe("hasReadableText", () => {
  it("treats punctuation-only prose as nothing to read", () => {
    for (const text of ["", " ", ".", "\n.\n", "…", "。", "---", "**"]) expect(hasReadableText(text)).toBe(false);
  });

  it("keeps letters, digits and emoji", () => {
    for (const text of ["a", "好", "1.", "👍", " ok."]) expect(hasReadableText(text)).toBe(true);
  });
});
