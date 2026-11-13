import assert from "node:assert/strict";
import { test } from "node:test";
import { beats, soundtrack } from "../../src/soundtrack.js";
import { audioArgs } from "../lib/soundtrack.mjs";

test("拍数换成秒：一小节四拍，成片从曲子的小节线上开始", () => {
  const bar = beats(4);
  assert.ok(Math.abs(bar - 240 / soundtrack.bpm) < 1e-3);
  assert.ok(Math.abs(beats(12) - 3 * bar) < 1e-3);
  const barsSkipped = soundtrack.start / bar;
  assert.ok(Math.abs(barsSkipped - Math.round(barsSkipped)) < 1e-3, `start 落在第 ${barsSkipped} 小节`);
});

test("混音参数：从指定位置取够时长，调到 -16 LUFS，结尾淡出到片尾", () => {
  const { input, output } = audioArgs({ file: "a.mp3", offset: 2.667, seconds: 70, loudness: -11.5 });
  assert.deepEqual(input, ["-ss", "2.667", "-t", "70.000", "-i", "a.mp3"]);
  const filter = output[output.indexOf("-af") + 1];
  assert.match(filter, /^volume=-4\.50dB,/);
  assert.match(filter, /afade=t=out:st=67\.000:d=3\.000$/);
});

test("淡入默认 0.3 秒，从曲子中段切入的片子可以指定得长一点", () => {
  const filterOf = (options) => {
    const { output } = audioArgs({ file: "a.mp3", offset: 0, seconds: 60, loudness: -16, ...options });
    return output[output.indexOf("-af") + 1];
  };
  assert.match(filterOf({}), /afade=t=in:d=0\.3,/);
  assert.match(filterOf({ fadeIn: 0.5625 }), /afade=t=in:d=0\.5625,/);
});

test("只渲染很短的一段时，淡出不会比这一段还长", () => {
  const { output } = audioArgs({ file: "a.mp3", offset: 0, seconds: 2, loudness: -16 });
  assert.match(output[output.indexOf("-af") + 1], /afade=t=out:st=1\.000:d=1\.000$/);
});
