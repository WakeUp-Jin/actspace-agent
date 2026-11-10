import { problemRow, problems } from "./intro.js";
import { at, lines } from "./shared.js";

// 品牌短片的开头：一拍一个问题，整屏换色；六拍之后六个问题排成一排，各自落进自己的空间。
// 配乐 120 BPM，一拍 0.5 秒，所有切换都踩在拍点上。
const BEAT = 0.5;
const ROW_AT = problems.length * BEAT;

const flashes = problems
  .map(
    ({ shape, tile, word }, index) => `
      <div class="flash tile-${tile}" style="${at(index * BEAT)}">
        <i class="flash-glyph glyph-${shape}" style="${at(index * BEAT)}"></i>
        <b class="flash-word" style="${at(index * BEAT + 0.04)}">${word}</b>
      </div>`,
  )
  .join("");

export const pulse = {
  id: "pulse",
  duration: 6,
  music: 3,
  html: `
    <div class="stage stage-paper pulse">
      ${flashes}
      <div class="pulse-rest" style="${at(ROW_AT)}">
        <div class="pulse-row">${problemRow({ glyphAt: ROW_AT + 0.05, spaceAt: ROW_AT + 0.5, step: 0.125 })}</div>
        <h1 class="pulse-line">${lines(["每个问题，都有它的<em>空间</em>。"], ROW_AT + 1)}</h1>
      </div>
    </div>`,
};
