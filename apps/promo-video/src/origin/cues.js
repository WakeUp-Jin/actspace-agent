/**
 * 《诞生记》的分镜表：每个分镜占几小节。
 * 长度只在这里写一次，画面（scenes/）、测试和 ORIGIN_STORY.md 里的分镜表都以它为准；
 * 改了这里的数字，要对一遍 soundtrack.js 里曲子的分段，保证换章节仍然落在换段落的地方。
 */
import { barAt } from "./soundtrack.js";

// 片尾多留半小节：曲子的最后一个音收完，画面再静一下才结束。
const sheet = [
  ["cold", 4],
  ["title", 2],
  ["night", 8],
  ["first", 2],
  ["grow", 8],
  ["rewrite", 8],
  ["again", 6],
  ["less", 4],
  ["crisis", 6],
  ["who", 4],
  ["tally", 4],
  ["closing", 3.5],
];

let next = 0;

/** @type {Array<{ id: string, bar: number, start: number, duration: number, at: (slot: number) => number }>} */
export const cues = sheet.map(([id, count]) => {
  const bar = next;
  const start = barAt(bar);
  next += count;
  return {
    id,
    /** 这个分镜从曲子的第几小节开始。 */
    bar,
    /** 在成片里的开始时刻和时长（秒）。 */
    start,
    duration: barAt(bar + count) - start,
    /** 分镜内第 slot 小节的重拍落下的时刻（秒，以分镜开始为零点）。 */
    at: (slot) => barAt(bar + slot) - start,
  };
});

export const cue = (id) => cues.find((entry) => entry.id === id);
