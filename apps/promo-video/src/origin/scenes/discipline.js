import { at, axis, between, chapter, journey, lines, timing } from "../shared.js";

const less = timing("less");
const crisis = timing("crisis");

// 做出来又删掉的功能：[名称, 出现在第几天, 删掉在第几天, 出现日期, 删掉日期, 第几小节上划掉]。起止都能在 docs/histories/ 里找到对应的记录。
// Kairos 八月重写时就没带过来，所以一出场就划掉；11 月 1 日那三个落在第 1 小节上；Lab 是四天后删的，留到最后一小节。
const removed = [
  ["Kairos 自治模式", 7, 95, "05-27", "08-23", 0],
  ["Lab 实验页", 8, 169, "05-28", "11-05", 3],
  ["可视化 HTML 回复", 10, 165, "05-30", "11-01", 1],
  ["工作区文件树", 10, 165, "05-30", "11-01", 1],
  ["内置终端", 71, 165, "07-30", "11-01", 1],
];

// 每一行是一条横在时间轴上方的线段：从出现那天画到删掉那天，再划掉。
const lives = removed
  .map(([name, from, to, since, until, slot], index) => {
    const grow = less.beat(0, 0.5 + index * 0.2);
    const cut = slot === 0 ? grow + 1.5 : less.beat(slot, slot === 1 ? 0.3 + (index - 2) * 0.4 : 0.35);
    return `
      <li class="o-life" style="${between(from, to)}--row:${index};${at(grow.toFixed(2))}--cut:${cut.toFixed(2)}s;">
        <i class="o-life-bar"></i>
        <p class="o-life-name"><b>${name}</b><span>${since} → ${until} · 存在了 ${to - from} 天</span></p>
      </li>`;
  })
  .join("");

const lessTrip = journey("less", [[0, 165], [less.beat(3, -0.1), 165], [less.beat(3, 0.5), 169], [less.duration, 169]]);

export const subtraction = {
  id: "less",
  duration: less.duration,
  enter: 0.6,
  html: `
    <div class="grain"></div>
    ${chapter("06", "做减法")}
    <div class="o-less-copy">
      <p class="eyebrow rise" style="${at(0.1)}"><b>2026-11-01</b><i></i>第 165 天</p>
      <h2 class="display-m">${lines(["做出来的，", "不一定<em>留下</em>。"], 0.2)}</h2>
    </div>
    <div class="o-less-side">
      <p class="o-less-day rise" style="${at(less.beat(1))}">这一天，删掉了三个功能。</p>
      <blockquote class="o-less-quote rise" style="${at(less.beat(1.5))}">
        终端只给人看，Agent 不需要读它；<br>每台电脑都自带终端。
        <cite>摘自《功能减法设计》里删除内置终端的理由</cite>
      </blockquote>
    </div>
    <ol class="o-lives">${lives}</ol>
    ${axis(lessTrip)}`,
};

// 三句话都摘自 docs/histories/2026-11/ 对应记录的「User Query」，省略处用省略号标出。
// 七小节。前三小节还在曲子最轻的间奏里，放前两句，一句一小节半；第 3 小节曲子进全曲最响的一句，第三句在这里进来。
// 之后一小节进来一样：第三句的后半句、回答、两条检查。
// 第一句晚一点：上一个分镜这时还没淡完，同一块位置叠两行字会糊。
const REST = crisis.beat(4);
const ANSWER = crisis.beat(5);
const CHECKS = crisis.beat(6);
const said = [
  ["11-05 00:03", "桌面端内存到 600 左右，用起来卡。"],
  ["11-07 06:00", "之前出现的 bug，为什么又出现了，没有写测试代码吗？"],
  ["11-07 19:00", "这次因为代码规范不到位，写出了近 3G 的内存占用……", "确保下次不再出现。"],
].map(([time, text, rest], index) => ({ time, text, rest, start: crisis.beat(index * 1.5, index === 0 ? 0.56 : 0) }));

const quotes = said
  .map(({ time, text, rest, start }, index) => {
    const dim = `--dim:${(said[index + 1]?.start ?? ANSWER).toFixed(3)}s;`;
    const later = rest ? `--more:${REST}s;` : "";
    const tail = rest ? `<br><span>${rest}</span>` : "";
    return `<li class="o-said" style="${at(start)}${dim}${later}"><time>${time}</time><q>${text}${tail}</q></li>`;
  })
  .join("");

const crisisTrip = journey("crisis", [[0, 169], [said[1].start - 0.2, 169], [said[1].start + 0.3, 171], [crisis.duration, 171]]);

export const pushback = {
  id: "crisis",
  duration: crisis.duration,
  enter: 0.6,
  html: `
    ${chapter("07", "较真", { dark: true })}
    <div class="o-crisis">
      <p class="eyebrow rise" style="${at(0.1)}"><b>摘自开发记录</b><i></i>开发者当时对 Agent 说的话</p>
      <ol class="o-saids">${quotes}</ol>
      <div class="o-crisis-answer rise" style="${at(ANSWER)}">
        <p>于是，多了一份规范，和两条每次提交都要跑的检查。</p>
        <code class="rise" style="${at(CHECKS)}">pnpm check:hot-path-reads</code><code class="rise" style="${at(CHECKS + 0.18)}">pnpm check:scale-tests</code>
      </div>
    </div>
    ${axis(crisisTrip)}`,
};
