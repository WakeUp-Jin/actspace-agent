import assert from "node:assert/strict";
import { test } from "node:test";
import { films } from "../../src/films.js";
import { cue, cues } from "../../src/origin/cues.js";
import { curve, cutoff, totals, writers } from "../../src/origin/data.js";
import { barAt, phrases, sections, soundtrack } from "../../src/origin/soundtrack.js";

/** 第一下扫弦在音频文件里的时刻（秒）。 */
const FIRST_STRUM = 0.09;

test("《诞生记》把曲子从第一下扫弦用到余音收完，中间不剪接", () => {
  // 成片比第一下扫弦早一帧开始放，不淡入。
  assert.ok(Math.abs(soundtrack.start + 1 / 30 - FIRST_STRUM) < 1e-9);
  assert.equal(soundtrack.fadeIn, 0);
  assert.equal(cues[0].bar, 0);
  assert.equal(cues[0].start, 0);
  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    assert.ok(Math.abs(previous.start + previous.duration - cues[index].start) < 1e-9, cues[index].id);
  }
  // 最后一个和弦落在片尾卡上；余音收完，画面再多留一小节。
  const last = cues.at(-1);
  const total = last.start + last.duration;
  assert.ok(last.bar < sections.lastChord);
  assert.ok(Math.abs(total - barAt(sections.silence + 1)) < 1e-9);
  assert.equal(Number(total.toFixed(2)), 151.91);
});

test("换章节落在曲子起新一句的地方", () => {
  // 例外四个：「第一夜」一小节一行，从第 6 小节排到第 13 小节，「第一句话」接在它后面；「回头看」和片尾卡各占尾奏的一半。
  const midPhrase = ["night", "first", "tally", "closing"];
  for (const { id, bar } of cues) assert.equal(phrases.includes(bar), !midPhrase.includes(id), id);
  // 「做减法」在全曲最轻的间奏里，「谁在写」在最响那一句落下来之后。
  assert.equal(cue("less").bar, sections.quiet);
  assert.equal(cue("who").bar, sections.calm);
  // 「越长越多」的第 4.5 小节，曲子换到第二段。
  assert.equal(cue("grow").bar + 4.5, sections.second);
  // 「推倒重来」里曲线断崖的那一下，是曲子新一句的开头。
  assert.ok(phrases.includes(cue("rewrite").bar + 4));
  // 全曲最响的那一句开始的那一小节，是「较真」里第三句话进来的那一下。
  assert.equal(cue("crisis").bar + 3, sections.loud);
});

test("一小节 2.553 秒，画面比小节线早一帧", () => {
  const bar = 240 / 94;
  assert.equal(barAt(0), 0);
  assert.ok(Math.abs(barAt(1) - bar) < 1e-9);
  assert.ok(Math.abs(cue("title").at(1) - bar) < 1e-9);
  // 曲子第 8 小节的小节线在音频文件的 FIRST_STRUM + 8 小节处；成片的 barAt(8) 换算回文件里的时刻，比它早一帧。
  assert.ok(Math.abs(soundtrack.start + barAt(8) - (FIRST_STRUM + 8 * bar - 1 / 30)) < 1e-9);
  assert.equal(films.origin.soundtrack, soundtrack);
});

test("片尾卡的配乐署名要用的四样都有值", () => {
  // CC BY 要求署名；作者要求里面留着曲名、他的名字和他的网站。换曲子时这四样要一起换。
  for (const key of ["title", "artist", "site", "license"]) {
    assert.equal(typeof soundtrack[key], "string", key);
    assert.ok(soundtrack[key].trim().length > 0, key);
  }
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
