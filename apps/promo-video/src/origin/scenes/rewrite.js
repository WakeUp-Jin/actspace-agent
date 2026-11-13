import { rewrite as facts } from "../data.js";
import { at, axis, between, chapter, chart, counter, fall, journey, timing } from "../shared.js";

const CHART = 360;
const { duration, beat } = timing("rewrite");

const number = (value) => value.toLocaleString("en-US");

// 前两个和弦慢慢走过没有提交的日子；在第 94 天停一个和弦讲决定；第 4 个和弦落到第 102 天，曲线断崖。
const DROP = beat(4);
const trip = journey("rewrite", [[0, 83], [beat(2), 94], [beat(3), 94], [DROP, 101], [DROP + 0.45, 102], [duration, 102]]);

// 最后一次提交在第 83 天，下一次在第 102 天，中间主线上没有提交。
const quiet = `
  <i class="o-chart-band fade" style="${between(83, 101)}${at(0.6)}">
    <span>主线上没有提交</span>
  </i>`;

// 那一次提交让曲线掉下来的一段，单独描红。
const cliff = `<i class="o-chart-fall fade" style="${fall(102, facts.codeBefore, facts.codeAfter, CHART)}${at(DROP + 0.4)}"></i>`;

/** 三张卡片依次换，每张两个和弦：安静、决定、那一次提交。 */
const card = (from, to, body) => `<div class="o-rewrite-card rise" style="${at(from, to)}">${body}</div>`;

export const rewriting = {
  id: "rewrite",
  duration,
  enter: 0.9,
  html: `
    ${chapter("04", "推倒重来", { dark: true })}
    ${card(
      0.5,
      beat(2, -0.5),
      `<p class="eyebrow"><b>08-11 23:42</b><i></i>这次提交之后</p>
       <h2 class="display-m">仓库安静了。</h2>
       <p class="lead rise" style="${at(beat(1))}">10 天，没有提交，也没有开发记录。</p>`,
    )}
    ${card(
      beat(2),
      beat(4, -0.5),
      `<p class="eyebrow"><b>08-22 09:17</b><i></i>第 94 天</p>
       <h2 class="display-m">决定：后端，<em>重写</em>。</h2>
       <p class="lead rise" style="${at(beat(3))}">只做一次切换，不交付半成品。</p>`,
    )}
    ${card(
      DROP,
      undefined,
      `<p class="eyebrow"><b>08-30 14:54</b><i></i>${facts.quietDays} 天来的第一次提交</p>
       <h2 class="display-m">一次提交，${number(facts.files)} 个文件。</h2>
       <p class="o-rewrite-diff rise" style="${at(DROP + 0.5)}"><b class="is-plus">+${number(facts.added)}</b><b class="is-minus">−${number(facts.deleted)}</b>行</p>
       <p class="o-rewrite-lost rise" style="${at(beat(5))}">有些东西，没有带过来：<s>Kairos 自治模式</s><s>fs-watch</s></p>`,
    )}
    ${counter(`${facts.codeBefore}@${DROP + 0.1} ${facts.codeAfter}@${DROP + 1}`, { linear: false })}
    ${chart(trip, { height: CHART, extra: quiet + cliff })}
    ${axis(trip, { chartHeight: CHART })}`,
};
