import { commitsByHour, totals, writers } from "../data.js";
import { at, axis, chapter, journey, lines, markUrl, timing } from "../shared.js";
import { soundtrack } from "../soundtrack.js";

const who = timing("who");
const tally = timing("tally");
const closing = timing("closing");

const most = Math.max(...writers.map(([, count]) => count));
const writerRows = writers
  .map(([name, count], index) => {
    const start = who.beat(0, 0.5 + index * 0.16);
    return `
      <li class="o-writer rise" style="${at(start)}">
        <span>${name}</span>
        <i style="--share:${(count / most).toFixed(4)};${at(start)}"></i>
        <b data-count="0@${start} ${count}@${(start + 1.1).toFixed(2)}"></b>
      </li>`;
  })
  .join("");

// 柱状图从早上 6 点排到第二天早上 5 点，晚上 8 点以后的柱子连成一片。
const isNight = (hour) => hour >= 20 || hour < 6;
const busiest = Math.max(...commitsByHour);
const nightCommits = commitsByHour.reduce((sum, count, hour) => sum + (isNight(hour) ? count : 0), 0);
const ownerCommits = commitsByHour.reduce((sum, count) => sum + count, 0);
const hourLabels = { 6: "早 6 点", 12: "中午", 20: "晚 8 点", 0: "零点" };
const hours = Array.from({ length: 24 }, (_, index) => (index + 6) % 24)
  .map((hour, index) => {
    const label = hourLabels[hour] ? `<span>${hourLabels[hour]}</span>` : "";
    const height = ((commitsByHour[hour] / busiest) * 100).toFixed(1);
    return `<i class="o-hour${isNight(hour) ? " is-night" : ""}" style="--tall:${height}%;${at((who.beat(1, 0.3) + index * 0.035).toFixed(2))}">${label}</i>`;
  })
  .join("");

// 右栏的柱子在第 1 小节排开，半小节后排完，出夜里那一句；最后一句再晚一小节，后面留一小节半给它。
const NIGHT = who.beat(1.5);
const OUTSIDE = who.beat(2.5);
const whoTrip = journey("who", [[0, 171], [OUTSIDE - 0.2, 171], [OUTSIDE + 0.3, 173], [who.duration, 173]]);

export const authors = {
  id: "who",
  duration: who.duration,
  enter: 0.6,
  html: `
    <div class="grain"></div>
    ${chapter("08", "谁在写")}
    <div class="o-who-agents">
      <h2 class="display-s">${lines([`这 ${totals.days} 天，是谁在写？`], 0.2)}</h2>
      <p class="o-who-note rise" style="${at(who.beat(0, 0.4))}">${totals.records} 篇开发记录的「Runtime」一栏</p>
      <ol class="o-writers">${writerRows}</ol>
    </div>
    <div class="o-who-human">
      <h2 class="display-s">${lines(["开发者，只有一个。"], who.beat(1))}</h2>
      <p class="o-who-note rise" style="${at(who.beat(1, 0.2))}">本人的 ${ownerCommits} 次提交，按小时排开</p>
      <div class="o-hours fade" style="${at(who.beat(1, 0.2))}">${hours}</div>
      <p class="o-who-night rise" style="${at(NIGHT)}">其中 <b>${nightCommits}</b> 次，在晚上 8 点到早上 6 点之间。</p>
    </div>
    <p class="o-who-last rise" style="${at(OUTSIDE)}"><time>11-09 · 第 173 天</time>第一个外部贡献者的 PR 合入。</p>
    ${axis(whoTrip)}`,
};

const stats = [
  [totals.days, "天"],
  [totals.commitDays, "天有提交"],
  [totals.commits, "次提交"],
  [totals.records, "篇开发记录"],
  [totals.learnings, "篇踩坑教训"],
  [totals.code, "行代码"],
  [totals.tests, "行测试"],
  [totals.packages, "个包"],
]
  .map(([value, unit], index) => {
    const start = Number((0.35 + index * 0.2).toFixed(2));
    return `<li class="rise" style="${at(start)}"><b data-count="0@${start} ${value}@${start + 1.3}" data-group></b><span>${unit}</span></li>`;
  })
  .join("");

// 状态与官网首页「方向」一致：只有上下文管理引擎标「已上线」，其余如实标「进行中」。
// 三个方向比「它还在长。」晚半小节，一拍进来一个（一小节四拍）。
const directions = [
  ["live", "已上线", "上下文管理引擎"],
  ["wip", "进行中", "Harness 自进化"],
  ["wip", "进行中", "Actor 与 Space"],
]
  .map(
    ([status, label, name], index) =>
      `<li class="rise" style="${at(tally.beat(2.5 + index / 4))}"><em class="status status-${status}">${label}</em>${name}</li>`,
  )
  .join("");

const tallyTrip = journey("tally", [[0, 173], [tally.beat(2), 176], [tally.duration, 176]]);

export const lookingBack = {
  id: "tally",
  duration: tally.duration,
  enter: 0.6,
  html: `
    <div class="grain"></div>
    ${chapter("09", "回头看")}
    <p class="eyebrow o-tally-date rise" style="${at(0.15)}"><b>2026-11-12</b><i></i>第 ${totals.days} 天，这部片子截稿的日子</p>
    <ol class="o-stats">${stats}</ol>
    <div class="o-tally-next fade" style="${at(tally.beat(2, -0.2))}">
      <h2 class="display-s">${lines(["它还在长。"], tally.beat(2))}</h2>
      <ol class="o-directions">${directions}</ol>
    </div>
    ${axis(tallyTrip)}`,
};

// 曲子最后几下扫弦渐慢，不在小节线上，位置是按波形量的（从这张卡开始算）：第 0.33、0.76、0.9 小节各一下，
// 第 1.2 小节是最后一个和弦，之后只剩余音。那句话对第一下，两行链接对后两下，最后一个和弦落下时出那句古话，配乐署名等余音里再出。
const LINE = closing.beat(0.33);
const LINKS = [closing.beat(0.76), closing.beat(0.9)];
const MOTTO = closing.beat(1.2);
const CREDIT = closing.beat(1.6);

export const closingCard = {
  id: "closing",
  duration: closing.duration,
  enter: 0.9,
  transition: "lift",
  html: `
    <div class="stage stage-peach stage-full"></div>
    <div class="o-closing">
      <img class="o-closing-mark pop" style="${at(0.4)}" src="${markUrl}" alt="">
      <h1 class="display o-closing-line">${lines(["它不是一次做对的，", "是一遍一遍<em>改</em>出来的。"], LINE, { step: 0.22 })}</h1>
      <div class="o-closing-links">
        <p class="rise" style="${at(LINKS[0])}"><span>开源</span><b>github.com/WakeUp-Jin/actspace-agent</b></p>
        <p class="rise" style="${at(LINKS[1])}"><span>官网</span><b>actspace.top</b></p>
      </div>
      <p class="o-closing-motto fade" style="${at(MOTTO)}">「不诱于誉，不恐于诽，率道而行，端然正己。」</p>
      <p class="o-closing-credit fade" style="${at(CREDIT)}">配乐：《${soundtrack.title}》 ${soundtrack.artist} · ${soundtrack.site} · ${soundtrack.license}</p>
    </div>`,
};
