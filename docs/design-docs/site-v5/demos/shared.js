// 文档页抽卡 demo 共用数据：真实目录 + 《上下文与压缩》正文（补了表格、代码块、提示块，用来看排版）。
window.DOCS_NAV = [
  { label: "开始使用", items: ["ActSpace 是什么", "快速开始", "完成第一个任务"] },
  { label: "工作区与会话", items: ["工作区与 Git Worktree", "会话管理与分支", "模式与输入"] },
  { label: "模型与上下文", items: ["配置模型", "模型选择与思考设置", "上下文与压缩", "Token、缓存与费用"] },
  { label: "工具与执行", items: ["文件读写与检索", "Bash 与后台任务", "权限与审批", "联网搜索与网页读取", "Browser Use", "图片理解与生成"] },
  { label: "工作台", items: ["文件预览", "代码审阅与 Git 操作", "交互式终端"] },
  { label: "扩展", items: ["Skills", "子 Agent 与 Explore", "让 Agent 新增工具", "英语辅助学习"] },
  { label: "设置与开发", items: ["设置与本地数据", "常见问题", "命令行使用", "一次 Agent 执行", "开发与贡献"] },
];
window.DOCS_CURRENT = "上下文与压缩";

window.DOC = {
  group: "模型与上下文",
  title: "上下文与压缩",
  lead: "查看模型本轮能看到的内容，并在长任务中整理上下文。",
  updated: "2026-10-17",
  minutes: 4,
  toc: [
    { id: "view", text: "查看当前上下文" },
    { id: "panel", text: "上下文面板" },
    { id: "disclosure", text: "渐进披露" },
    { id: "tokens", text: "上下文占用与累计 Token" },
    { id: "compact", text: "何时压缩" },
    { id: "summary", text: "摘要里有什么", nested: true },
  ],
  prev: "模型选择与思考设置",
  next: "Token、缓存与费用",
  body: `
<p>模型每次请求看到的上下文包括系统说明、工具定义、规则、Skill 提示、历史消息以及必要的摘要。聊天窗口显示的全部历史，与这次实际发送给模型的内容并不总是相同。</p>

<h2 id="view">查看当前上下文</h2>
<p>点击输入框底部的上下文状态，可以看到这次占用了多少、按分类怎么分布。需要深入检查时，在弹层里展开，或者从右侧工作台的「+」打开「上下文」，进入上下文面板。</p>
<figure class="shot"><div class="shot-frame"><img src="assets/context-popup.png" alt="输入框上方的上下文占用与分类" width="2684" height="2050"></div><figcaption>输入框上方的上下文占用与分类。</figcaption></figure>
<p>排查“模型为什么不知道这个信息”时，先确认文件或工具结果是否进入该次请求，再看是否经过摘要。附上一个路径并不等于完整文件已经被读取。</p>

<h2 id="panel">上下文面板</h2>
<p>上下文面板只看占用，从上到下分五块：</p>
<ul>
  <li><strong>当前上下文</strong>：已用多少、上限多少，分段条按系统提示词、工具、规则、Skills、会话摘要和会话内容着色；条上的刻度是自动压缩的阈值。</li>
  <li><strong>会话统计</strong>：轮次、步数、压缩次数、缓存命中率、累计 Token 和费用。</li>
  <li><strong>上下文明细</strong>：选一次请求（默认是最近一次），按分类展开到每一项。和上一次请求比，增加和减少的项数与 Token 会标出来。</li>
  <li><strong>上下文趋势</strong>：每根柱是一次请求，能看出上下文怎样增长、在哪一次被压缩下来。</li>
  <li><strong>上下文事件</strong>：Skill 和规则什么时候被注入、工具集何时变化、何时自动压缩、何时切换模型，按时间倒序列出。</li>
</ul>
<blockquote class="note"><p><strong>关于「≈」</strong>带「≈」的数字是本地估算；“实际”是服务商返回的用量。两者有差异时，以实际值为准。会话的原文不在这里，要逐条回看，用<a href="#">执行轨迹</a>。</p></blockquote>
<figure class="shot"><div class="shot-frame"><img src="assets/context-panel.png" alt="上下文面板" width="1821" height="915"></div><figcaption>上下文面板。左栏是当前上下文、会话统计和上下文明细，右栏是趋势与事件。（示例数据）</figcaption></figure>

<h2 id="disclosure">渐进披露</h2>
<p>Skill、规则和文件不会一开始全部放进上下文，用到时才注入。每一次注入都会出现在上下文事件里，所以可以对照着看：某一轮多出的 Token 来自哪个 Skill 或哪份规则。</p>

<h2 id="tokens">上下文占用与累计 Token</h2>
<p>上下文占用描述单次请求的内容规模；会话累计 Token 包括多次请求的消耗。两个数字不能互相替代。</p>
<table>
  <thead><tr><th>数字</th><th>描述的是</th><th>用来判断</th></tr></thead>
  <tbody>
    <tr><td>上下文占用</td><td>单次请求的内容规模</td><td>离模型容量还有多远</td></tr>
    <tr><td>会话累计 Token</td><td>多次请求的总消耗</td><td>这次工作花了多少</td></tr>
  </tbody>
</table>
<p>容量依据实际请求对应的模型事实。旧会话缺少容量记录时，可能显示 0，不能据此认定请求没有使用 Token。请求的输入、输出和缓存用量见<a href="#">使用统计</a>。</p>

<h2 id="compact">何时压缩</h2>
<p>长任务积累大量消息和工具结果时，可以在输入框执行 <code>/compact</code>，把较早内容整理为摘要；运行时也会依据压缩策略处理上下文压力。压缩依赖可用的摘要模型，请先检查相关模型用途配置。</p>
<h3 id="summary">摘要里有什么</h3>
<p>摘要是结构化的，固定分成几节。文件路径、命令和报错原文会照原样保留。</p>
<pre data-lang="markdown"><code>## 目标
## 重要细节      约束、决策与原因
## 工作状态      已完成 / 进行中 / 受阻
## 下一步
## 相关文件      以及它们为什么重要</code></pre>
<p>压缩减少后续请求需要携带的历史，但不会删除原始会话日志。摘要仍可能遗漏细节，关键约束最好写入项目文档；压缩后继续任务时，可以补充明确目标，并让 Agent 重新读取需要精确依据的文件。</p>
`,
};

// 第三轮：A4 为底、一页一色；A4 留作对照。前两轮文件保留，不再放进切换条。
window.VARIANTS = [
  { id: "A4", name: "小舞台", file: "docs-A4-mini-stage.html" },
  { id: "B1", name: "薄荷", file: "docs-B1-mint.html" },
  { id: "B2", name: "品牌紫", file: "docs-B2-violet.html" },
  { id: "B3", name: "首页桃", file: "docs-B3-peach.html" },
  { id: "B4", name: "细节", file: "docs-B4-detail.html" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

window.renderHeader = function (el) {
  el.innerHTML = `
  <div class="sh-inner">
    <a class="sh-brand" href="#"><img src="assets/actspace-mark.png" alt="" width="44" height="30">ActSpace</a>
    <nav class="sh-nav"><a href="#">产品</a><a href="#" aria-current="page">文档</a><a href="#">博客</a><a href="#">更新日志</a></nav>
    <div class="sh-right">
      <a class="sh-gh" href="#" aria-label="GitHub"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg></a>
      <span class="sh-sep"></span>
      <a class="sh-cta" href="#">快速开始</a>
    </div>
  </div>`;
};

// 侧栏：opts.numbered 给分组加 01/02，opts.groupClass 自定义类名
window.renderNav = function (el, opts = {}) {
  el.innerHTML = window.DOCS_NAV.map((g, gi) => `
    <div class="nav-group${g.items.includes(window.DOCS_CURRENT) ? " is-open" : ""}">
      <p class="nav-label">${opts.numbered ? `<span class="nav-num">${String(gi + 1).padStart(2, "0")}</span>` : ""}${opts.icons ? `<span class="nav-ico">${opts.icons[gi] || ""}</span>` : ""}${esc(g.label)}</p>
      <div class="nav-items">${g.items.map((t) => `<a href="#"${t === window.DOCS_CURRENT ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("")}</div>
    </div>`).join("");
};

window.renderToc = function (el, opts = {}) {
  el.innerHTML = window.DOC.toc.map((t, i) => `<a href="#${t.id}" data-toc="${t.id}" class="${t.nested ? "nested" : ""}">${opts.numbered && !t.nested ? `<span class="toc-num">${String(i + 1).padStart(2, "0")}</span>` : ""}${esc(t.text)}</a>`).join("");
};

window.renderPager = function (el) {
  el.innerHTML = `
    <a href="#" class="pager-prev"><span class="pager-dir">← 上一篇</span><span class="pager-title">${esc(window.DOC.prev)}</span></a>
    <a href="#" class="pager-next"><span class="pager-dir">下一篇 →</span><span class="pager-title">${esc(window.DOC.next)}</span></a>`;
};

// 代码块：语言标签 + 复制按钮
window.decorateCode = function (root) {
  root.querySelectorAll("pre").forEach((pre) => {
    const bar = document.createElement("div");
    bar.className = "code-bar";
    bar.innerHTML = `<span class="code-lang">${pre.dataset.lang || ""}</span><button type="button" class="code-copy">复制</button>`;
    pre.parentNode.insertBefore(bar, pre);
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    bar.parentNode.insertBefore(wrap, bar);
    wrap.append(bar, pre);
    bar.querySelector("button").addEventListener("click", (e) => {
      navigator.clipboard?.writeText(pre.innerText);
      e.target.textContent = "已复制";
      setTimeout(() => (e.target.textContent = "复制"), 1600);
    });
  });
};

// 滚动高亮当前目录项
window.watchToc = function () {
  const links = [...document.querySelectorAll("[data-toc]")];
  const heads = links.map((a) => document.getElementById(a.dataset.toc)).filter(Boolean);
  const update = () => {
    let cur = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top < 140) cur = h;
    links.forEach((a) => a.classList.toggle("is-active", a.dataset.toc === cur?.id));
  };
  addEventListener("scroll", update, { passive: true });
  update();
};

// 底部抽卡切换条
window.renderSwitcher = function (current) {
  const bar = document.createElement("div");
  bar.className = "demo-switcher";
  bar.innerHTML = `<span>文档 · 第三轮</span>${window.VARIANTS.map((v) => `<a href="${v.file}"${v.id === current ? ' aria-current="true"' : ""}><b>${v.id}</b>${v.name}</a>`).join("")}`;
  document.body.append(bar);
};

window.bootDoc = function (current, opts = {}) {
  document.querySelectorAll("[data-header]").forEach(renderHeader);
  document.querySelectorAll("[data-nav]").forEach((el) => renderNav(el, opts.nav));
  document.querySelectorAll("[data-toc-list]").forEach((el) => renderToc(el, opts.toc));
  document.querySelectorAll("[data-pager]").forEach(renderPager);
  document.querySelectorAll("[data-fill]").forEach((el) => {
    const v = window.DOC[el.dataset.fill];
    el.textContent = typeof v === "number" ? String(v) : v;
  });
  document.querySelectorAll("[data-body]").forEach((el) => {
    el.innerHTML = window.DOC.body;
    decorateCode(el);
  });
  renderSwitcher(current);
  watchToc();
};
