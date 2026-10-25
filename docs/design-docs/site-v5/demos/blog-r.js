// 博客第三轮共用：列表沿用 Q2 排印封面的排版，封面换回现网角色插画；文章页 R1–R4 各自一种渲染。
// 必须在 blog-shared.js 之后、各版脚本之前加载。
window.BLOG_ROUND = "第三轮";
window.BLOG_VARIANTS = [
  { id: "R1", name: "封面横幅", file: "blog-R1-banner.html" },
  { id: "R2", name: "侧栏目录", file: "blog-R2-toc.html" },
  { id: "R3", name: "封面色贯穿", file: "blog-R3-tint.html" },
  { id: "R4", name: "大字杂志", file: "blog-R4-magazine.html" },
];

// 每张角色封面：底色（PNG 自带）、压在上面的字色、取自角色本身的强调色
window.CV = {
  "01": { bg: "#fddfcf", ink: "#3a2a22", accent: "#7b5fb8" },
  "02": { bg: "#6d91cd", ink: "#fbfaf7", accent: "#3d61a8" },
  "03": { bg: "#4a775d", ink: "#f6f2e6", accent: "#3b6a4f" },
  "04": { bg: "#516889", ink: "#f2f5f0", accent: "#455d80" },
  "05": { bg: "#fdf5b7", ink: "#1f2a6b", accent: "#1f45d8" },
  "06": { bg: "#fbfaf7", ink: "#3d2a1e", accent: "#b06a3f" },
  "07": { bg: "#faf8f2", ink: "#24233a", accent: "#3a3866" },
  "08": { bg: "#fefaf0", ink: "#1f2347", accent: "#5a4fb5" },
};
const cvVars = (n) => `--bg:${CV[n].bg};--ink:${CV[n].ink}`;

function renderRList(el) {
  const tile = (p) => `<div class="tile${["06", "07", "08"].includes(p.cover) ? " is-light" : ""}" style="${cvVars(p.cover)}"><img class="ch" src="${coverSrc(p.cover)}" alt=""><div class="t-top"><span>${p.cat}</span><span>${p.date.slice(5)}</span></div><div class="key">${besc(p.key)}</div></div>`;
  el.innerHTML = `<div class="head"><h1>博客</h1><div class="filters">${["全部", ...CATS].map((c, i) => `<button aria-pressed="${i === 0}">${c}</button>`).join("")}</div></div>
  <div class="grid">${POSTS.map((p, i) => `<a class="item${i === 0 ? " wide" : ""}" href="#post">${tile(p)}<div><h3>${besc(p.title)}</h3><p>${besc(p.desc)}</p></div></a>`).join("")}</div>`;
  el.querySelectorAll(".filters button").forEach((b) => b.addEventListener("click", () => el.querySelectorAll(".filters button").forEach((x) => x.setAttribute("aria-pressed", x === b))));
}

// 资料列表：「《标题》：https://…」拆成标题 + 域名，整行可点
function decorateRefs(root) {
  root.querySelectorAll(".refs li").forEach((li) => {
    const a = li.querySelector("a");
    if (!a) return;
    const url = a.textContent.trim();
    let host = url;
    try { const u = new URL(url); host = u.hostname.replace(/^www\./, ""); } catch {}
    const title = li.textContent.replace(url, "").replace(/[：:]\s*$/, "").trim();
    li.innerHTML = `<a class="ref" href="${url}" title="${url}"><span class="ref-t">${besc(title)}</span><span class="ref-h">${besc(host)} ↗</span></a>`;
  });
}

// emoji 开头的段落 → 提示块：emoji 进左侧槽位
function decorateCallouts(root) {
  root.querySelectorAll("p.emoji").forEach((p) => {
    const m = p.innerHTML.match(/^\s*(\p{Extended_Pictographic}️?)\s*/u);
    if (!m) return;
    p.outerHTML = `<div class="callout"><span class="ico">${m[1]}</span><div>${p.innerHTML.slice(m[0].length)}</div></div>`;
  });
}

// 文章页封面：可在底部切换条里轮换，看不同底色下的效果
let coverNo = POST.cover;
try { coverNo = localStorage.getItem("blogR.cover") || POST.cover; } catch {}
function paintCover() {
  const c = CV[coverNo], r = document.documentElement.style;
  r.setProperty("--cv-bg", c.bg); r.setProperty("--cv-ink", c.ink); r.setProperty("--cv-accent", c.accent);
  document.documentElement.classList.toggle("cv-light", ["06", "07", "08"].includes(coverNo));
  document.querySelectorAll("[data-cover-img]").forEach((img) => (img.src = coverSrc(coverNo)));
  document.querySelectorAll("[data-cover-key]").forEach((el) => (el.textContent = POST.key));
  document.querySelectorAll("[data-cover-btn]").forEach((b) => (b.innerHTML = `<b>封面</b>${coverNo} ↻`));
}

// 文章尾部：上一篇 / 下一篇
function renderNext(el) {
  const i = POSTS.indexOf(POST), prev = POSTS[i + 1], next = POSTS[i - 1];
  const card = (p, label) => p ? `<a class="r-next-card" href="#post"><span class="r-next-cv" style="background:${CV[p.cover].bg}"><img src="${coverSrc(p.cover)}" alt=""></span><span><small>${label}</small><b>${besc(p.title)}</b></span></a>` : "<span></span>";
  el.innerHTML = card(prev, "上一篇") + card(next, "下一篇");
}

window.bootR = function (current) {
  document.querySelectorAll("[data-r-list]").forEach(renderRList);
  bootBlog(current);
  document.querySelectorAll("[data-post-body]").forEach((el) => { decorateRefs(el); decorateCallouts(el); });
  document.querySelectorAll("[data-post-next]").forEach(renderNext);
  document.addEventListener("click", (e) => { if (e.target.closest(".back")) { e.preventDefault(); history.pushState(null, "", location.pathname); syncBlogView(); scrollTo(0, 0); } });

  const bar = document.querySelector(".demo-switcher");
  const sep = document.createElement("i"); sep.className = "demo-sep";
  const cv = document.createElement("a"); cv.href = "#"; cv.dataset.coverBtn = "";
  cv.addEventListener("click", (e) => {
    e.preventDefault();
    const keys = Object.keys(CV);
    coverNo = keys[(keys.indexOf(coverNo) + 1) % keys.length];
    try { localStorage.setItem("blogR.cover", coverNo); } catch {}
    paintCover();
  });
  const key = document.createElement("a"); key.href = "#"; key.innerHTML = "<b>列表</b>大字";
  key.toggleAttribute("aria-current", true);
  key.addEventListener("click", (e) => { e.preventDefault(); key.toggleAttribute("aria-current", document.body.classList.toggle("no-key") === false); });
  bar.append(sep, key, cv);
  paintCover();
};
