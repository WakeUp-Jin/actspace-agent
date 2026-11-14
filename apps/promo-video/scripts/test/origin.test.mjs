import assert from "node:assert/strict";
import { test } from "node:test";
import { films } from "../../src/films.js";
import { cue, cues } from "../../src/origin/cues.js";
import { curve, cutoff, totals, writers } from "../../src/origin/data.js";
import { barAt, sections, soundtrack } from "../../src/origin/soundtrack.js";

test("《诞生记》把曲子从第 0 秒用到最后一个音，中间不剪接", () => {
  assert.equal(soundtrack.start, 0);
  assert.equal(soundtrack.fadeIn, 0);
  assert.equal(cues[0].bar, 0);
  assert.equal(cues[0].start, 0);
  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    assert.ok(Math.abs(previous.start + previous.duration - cues[index].start) < 1e-9, cues[index].id);
  }
  // 片尾卡比曲子没声音的地方多留半小节。
  const last = cues.at(-1);
  const total = last.start + last.duration;
  assert.ok(Math.abs(total - barAt(sections.silence + 0.5)) < 1e-9);
  assert.equal(Number(total.toFixed(2)), 174.11);
});

test("换章节落在曲子换段落的那一小节上", () => {
  const expected = {
    title: sections.drums,
    grow: sections.high,
    again: sections.back,
    closing: sections.outro,
  };
  for (const [id, bar] of Object.entries(expected)) assert.equal(cue(id).bar, bar, id);
  // 鼓和贝斯停下的那一小节，是「推倒重来」里曲线断崖的那一下。
  assert.equal(cue("rewrite").bar + 4, sections.pause);
  // 那层高音回来的那一小节，是「较真」里第三句话进来的那一下。
  assert.equal(cue("crisis").bar + 2, sections.highBack);
  // 两小节换一次和弦，所以每个分镜都从双数小节开始。
  for (const { id, bar } of cues) assert.equal(bar % 2, 0, id);
});

test("一小节 2.927 秒，画面比小节线早一帧", () => {
  const bar = 240 / 82;
  assert.equal(barAt(0), 0);
  assert.ok(Math.abs(barAt(1) - (bar - 1 / 30)) < 1e-9);
  assert.ok(Math.abs(cue("title").at(1) - bar) < 1e-9);
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
