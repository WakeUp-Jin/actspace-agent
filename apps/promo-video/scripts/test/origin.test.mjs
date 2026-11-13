import assert from "node:assert/strict";
import { test } from "node:test";
import { films } from "../../src/films.js";
import { cue, cues } from "../../src/origin/cues.js";
import { curve, cutoff, totals, writers } from "../../src/origin/data.js";
import { ENTRY, LEAD_IN, sections, slots, soundtrack } from "../../src/origin/soundtrack.js";

test("《诞生记》从第 28 个和弦取到曲终，中间不剪接", () => {
  const last = cues.at(-1);
  const total = last.start + last.duration;
  assert.equal(cues[0].chord, ENTRY);
  // 片尾卡占满最后几个和弦，结束时曲子正好没有声音。
  assert.ok(Math.abs(last.chord + last.duration / slots(1) - sections.silence) < 1e-9);
  assert.ok(Math.abs(total - (LEAD_IN + slots(sections.silence - ENTRY))) < 1e-9);
  assert.equal(Number(total.toFixed(4)), 172.6875);
});

test("换章节落在曲子换段落的那个和弦上", () => {
  const expected = {
    title: sections.chorus,
    first: sections.peak,
    rewrite: sections.breakdown,
    again: sections.pickup,
    less: sections.climb,
    who: sections.crest,
    tally: sections.outro,
  };
  for (const [id, chord] of Object.entries(expected)) assert.equal(cue(id).chord, chord, id);
  // 主题回来的那一下在「再长一遍」的第 2 个和弦；最后一个和弦在片尾卡的第 1 个和弦，留给链接入场。
  assert.equal(cue("again").chord + 2, sections.theme);
  assert.equal(cue("closing").chord + 1, sections.lastChord);
});

test("成片第 0 秒在切入的和弦之前一拍，再早一帧", () => {
  const entryInTrack = soundtrack.start + LEAD_IN + 1 / 30;
  assert.ok(Math.abs(entryInTrack - (0.7 + slots(ENTRY))) < 1e-9);
  assert.equal(soundtrack.fadeIn, LEAD_IN);
  assert.equal(films.origin.soundtrack, soundtrack);
});

test("画面上的数字彼此对得上", () => {
  const days = (Date.parse(cutoff.date) - Date.parse("2026-05-21")) / 86_400_000 + 1;
  assert.equal(totals.days, days);
  assert.equal(writers.reduce((sum, [, count]) => sum + count, 0), totals.records);
  assert.equal(curve.at(-1)[0], totals.days);
  assert.equal(curve.at(-1)[1], totals.code);
  assert.equal(curve.length, totals.commitDays);
  for (let index = 1; index < curve.length; index += 1) assert.ok(curve[index][0] > curve[index - 1][0]);
});
