import assert from "node:assert/strict";
import test from "node:test";
import { composeMusic, encodeWav, scoreFor } from "../lib/music.mjs";

const film = {
  duration: 12,
  scenes: [
    { id: "hook", start: 0 },
    { id: "feature-context", start: 4 },
    { id: "closing", start: 8 },
  ],
};

test("分镜映射成配乐强度：特点分镜最满，开头和收尾最轻", () => {
  assert.deepEqual(
    scoreFor(film).sections.map(({ at, level }) => [at, level]),
    [
      [0, 0],
      [4, 3],
      [8, 1],
    ],
  );
});

test("配乐长度等于成片长度，不削波，结尾淡出到无声", () => {
  const music = composeMusic(scoreFor(film));
  assert.equal(music.left.length, film.duration * music.sampleRate);
  let peak = 0;
  for (const value of music.left) peak = Math.max(peak, Math.abs(value));
  assert.ok(peak > 0.2 && peak <= 0.64, `峰值 ${peak}`);
  assert.ok(Math.abs(music.left.at(-1)) < 1e-3);
});

test("同样的输入得到逐字节相同的 WAV", () => {
  const first = encodeWav(composeMusic(scoreFor(film)));
  const second = encodeWav(composeMusic(scoreFor(film)));
  assert.ok(first.equals(second));
  assert.equal(first.toString("ascii", 0, 4), "RIFF");
  assert.equal(first.readUInt32LE(40), film.duration * 44_100 * 4);
});
