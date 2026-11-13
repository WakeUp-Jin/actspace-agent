/**
 * 《诞生记》的分镜表：每个分镜占几个和弦。
 * 长度只在这里写一次，画面（scenes/）、测试和 ORIGIN_STORY.md 里的分镜表都以它为准；
 * 改了这里的数字，要对一遍 soundtrack.js 里曲子的分段，保证换章节仍然落在换段落的地方。
 */
import { ENTRY, LEAD_IN, slots } from "./soundtrack.js";

const sheet = [
  ["cold", 4],
  ["title", 2],
  ["night", 6],
  ["first", 2],
  ["grow", 6],
  ["rewrite", 6],
  ["again", 6],
  ["less", 4],
  ["crisis", 4],
  ["who", 4],
  ["tally", 4],
  ["closing", 3],
];

let chord = ENTRY;
let start = 0;

/** @type {Array<{ id: string, chord: number, start: number, duration: number, at: (slot: number) => number }>} */
export const cues = sheet.map(([id, count], index) => {
  const lead = index === 0 ? LEAD_IN : 0;
  const cue = {
    id,
    /** 这个分镜从曲子的第几个和弦开始。 */
    chord,
    /** 在成片里的开始时刻和时长（秒）。 */
    start,
    duration: lead + slots(count),
    /** 分镜内第 slot 个和弦落下的时刻（秒，以分镜开始为零点）。 */
    at: (slot) => lead + slots(slot),
  };
  chord += count;
  start += cue.duration;
  return cue;
});

export const cue = (id) => cues.find((entry) => entry.id === id);
