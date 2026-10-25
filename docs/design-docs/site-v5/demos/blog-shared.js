// 博客抽卡 demo 共用数据：真实的 11 篇文章 + 《多智能体的协作方式》正文节选（含图片、链接列表、代码、引用、emoji 段落）。
window.POSTS = [
  { slug: "context-is-an-interface", key: "Context", img: "assets/blog/real/context-is-an-interface.png", title: "为什么我们把 Context 当成界面，而不是隐藏的 Prompt", desc: "一个 Agent 真正看到什么，决定了它能做什么。ActSpace 如何让 Context 可观察、可干预并保持可缓存。", date: "2026-07-27", cat: "上下文工程", cover: "01", min: 4 },
  { slug: "actspace-agent-evaluation", key: "Eval", img: "assets/blog/real/actspace-agent-evaluation.png", title: "ActSpace 评估模块的设计思路", desc: "在构建 Agent 的时候，我们首先会更多从感觉出发，或者说从经验出发。", date: "2026-07-19", cat: "评估与质量", cover: "02", min: 6 },
  { slug: "agent-team-and-agent-room", key: "Team & Room", img: "assets/blog/real/agent-team-and-agent-room.png", title: "多智能体的协作方式：Agent Team 和 Agent Room", desc: "多智能体如果设计得当，可以在提高效果的同时节省成本。记录我在多智能体协作上的部分探索与思考。", date: "2026-07-15", cat: "多智能体", cover: "07", min: 9 },
  { slug: "browser-use-integration", key: "Browser Use", img: "assets/blog/real/browser-use-integration.png", title: "给 Agent 接入 Browser Use 的设计思路", desc: "让 Agent 控制浏览器有很多实现方式，内嵌浏览器无法继承用户完整的浏览器权限。", date: "2026-07-11", cat: "工具与扩展", cover: "04", min: 8 },
  { slug: "bash-background-and-sandbox", key: "Bash 后台", img: "assets/blog/real/bash-background-and-sandbox.png", title: "Agent Bash 工具工程化：后台运行与沙盒权限设计", desc: "要追求线上级的稳定运行，Bash 工具最重要的两环必不可少：后台运行和沙盒设计。", date: "2026-07-05", cat: "工具与扩展", cover: "05", min: 5 },
  { slug: "write-and-edit", key: "Write / Edit", img: "assets/blog/real/write-and-edit.png", title: "Write 和 Edit 工具的实现细节", desc: "文件写入和编辑中的 TOCTOU 防护、原子写入与内容匹配。", date: "2026-06-16", cat: "工具与扩展", cover: "01", min: 14 },
  { slug: "pi-llm-runtime-design", key: "Pi · LLM", img: "assets/blog/real/pi-llm-runtime-design.png", title: "学习和整理 Pi 的 LLM 模块设计", desc: "Pi 对 LLM 模块的设计，尤其是多供应商、模型配置字段和对上下文的理解都很出色。", date: "2026-06-02", cat: "模型与运行时", cover: "03", min: 12 },
  { slug: "grep-and-glob", key: "Grep / Glob", img: "assets/blog/real/grep-and-glob.png", title: "Agent 文件系统检索核心：Grep 和 Glob 工具", desc: "Glob、Grep 与 ripgrep 的实现取舍、降级策略和检索流程。", date: "2026-04-19", cat: "工具与扩展", cover: "04", min: 10 },
  { slug: "bash-tool-design", key: "Bash", img: "assets/blog/real/bash-tool-design.png", title: "Bash 工具实现和安全权限设计细节", desc: "从 Bash 工具定义到沙盒执行与权限检查，记录实现细节。", date: "2026-04-17", cat: "工具与扩展", cover: "06", min: 22 },
  { slug: "agent-skill-system", key: "Skills", img: "assets/blog/real/agent-skill-system.png", title: "为你的 Agent 集成 Skill 系统", desc: "为自己开发的 Agent 添加 Skill 支持时的核心步骤：发现、解析、使用、管理。", date: "2026-04-02", cat: "工具与扩展", cover: "08", min: 11 },
  { slug: "tool-scheduling-and-permissions", key: "调度与权限", img: "assets/blog/real/tool-scheduling-and-permissions.png", title: "工具调度与权限模块的开发", desc: "记录工具调度、权限检查与 allowList 机制的早期设计。", date: "2026-04-01", cat: "工具与扩展", cover: "03", min: 6 },
];
// 封面插画自带的底色（取自 PNG 角落像素），给需要同色衬底的版本用
window.COVER_BG = { "01": "#fddfcf", "02": "#6d91cd", "03": "#4a775d", "04": "#516889", "05": "#fdf5b7", "06": "#fbfaf7", "07": "#faf8f2", "08": "#fefaf0" };
window.CATS = ["上下文工程", "评估与质量", "多智能体", "工具与扩展", "模型与运行时"];
window.POST = window.POSTS[2];
window.POST_TOC = [
  { id: "post-team", text: "一、Agent Team 的设计思路" },
  { id: "post-room", text: "二、Agent Room 的设计思路" },
  { id: "post-task", text: "三、Agent Task 的设计思路" },
  { id: "post-member", text: "四、Agent Member 的设计思路" },
];
window.POST_BODY = `
<p>最近在实践多智能体的设计方式，也准备考虑给 ActSpace 添加多智能体的功能，主要是多智能体如果设计得当的话，是可以在提高效果的同时节省成本的，这对于很多做应用的团队来说，成本的控制是可以带来极好的用户体验的，我觉得这也是 Harness Engineering 的概念之一。</p>
<p>在不断探索的过程中，我有一种新的感觉，多智能体的设计，尤其是协作方面非常有意思，而且很有挑战性，我也感觉这个是目前很多成熟 Agent 在突破的主要方向之一，从 Claude Code 推出来的 Agent Team 和 Dynamic Workflows 可以感受到一些。</p>
<p>下面记录了我在多智能体协作上的部分探索与思考，谨小认知，仅供参考。</p>
<p>调研资料：</p>
<ul class="refs">
  <li>《Is Having Agents in the Room Meant to Be Chaotic?》：<a href="#">https://raft.build/resources/blog/is-having-agents-in-the-room-meant-to-be-chaotic/</a></li>
  <li>《multica 开源项目》：<a href="#">https://github.com/multica-ai/multica</a></li>
  <li>《Model and effort in Claude Code: knowing more vs. trying harder》：<a href="#">https://x.com/ClaudeDevs/status/2074900291062034618</a></li>
</ul>

<h2 id="post-team">一、Agent Team 的设计思路</h2>
<p>Agent Team 是多智能体的协作方式之一，类似于一个组“临时团队”一起攻坚一个复杂的任务，里面会有负责人的角色（Lead），同时也会存在团队的成员（Teammate），交流关系不仅仅是负责人和成员之间的交流，成员和成员之间同样可以交流。</p>
<figure class="pimg"><img src="assets/blog/AR-AT-1.png" alt="Agent Team 的核心实现设计" width="900" height="546"><figcaption>Agent Team 的核心实现设计</figcaption></figure>
<p><strong>一个 Agent Team 最核心的四个组件：团队负责人、任务清单、团队成员、消息收件箱</strong></p>
<p>核心的运行步骤如下：</p>
<ol>
  <li>Team Lead 根据任务的复杂性生成任务清单，同时开始创建团队的基本信息</li>
  <li>Lead 可以直接分配任务给团队成员做，同时在空闲的时候团队成员也可以主动领取任务</li>
  <li>Lead 和 Teammate 不是直接交流的，是通过 inbox（消息收件箱）发送消息，类似于人类协作中发送邮件的操作</li>
</ol>
<p>Team Lead 创建任务和团队基本信息的时候，依靠两个工具：<code>TaskCreate</code> 和 <code>TeamCreate</code>，这两个工具会创建两个关键的文件夹。假设团队名叫做 jink-team，创建的文件夹结构如下：</p>
<pre data-lang="text"><code>~/.claude/teams/jink-team/
~/.claude/tasks/jink-team/</code></pre>
<p class="emoji">🌵 那么任务清单创建好之后，如何分配任务呢？</p>
<p>Agent Team 是通过 <strong>Lead 分配和团队成员主动领取</strong> 这两个方式，Lead 分配任务使用的是 TaskUpdate 方法，团队成员主动领取任务使用的是 TaskList 先获取任务的状态，然后根据状态来领取任务，这是程序中循环调度器实现的，每 500ms 循环执行一次。</p>
<p>例如：任务清单很可能会出现两个 Agent 同时读取同一个任务，这个时候状态会变得不稳定，所以我们要设置文件锁，同一个时刻，只有一个 Agent 读取并且执行修改。</p>
<blockquote><p>当某一个 Agent 抢到文件锁的时候，该文件的所有权就交给这个 Agent 来控制啦，其他的 Agent 只能在旁边先等待。</p></blockquote>
<p>Claude Code 团队的实现非常有灵性，简单使用一个 <code>mkdir</code> 方法就实现啦，<code>mkdir</code> 在文件系统上是原子的：同一时刻只有一个人能建成这个目录。</p>
<pre data-lang="text"><code>tasks/jink-team/
  3.json          ← 真正的任务内容
  3.json.lock/    ← 「有人正在改 3.json」（锁的物理形态）</code></pre>

<h2 id="post-room">二、Agent Room 的设计思路</h2>
<p>Agent Room 同样也是多智能体的协作方式之一，这个里面没有“Lead”，是一次平等的交流，互相讨论，发表意见，在一个房间里面多智能体进行思想碰撞。</p>
<figure class="pimg"><img src="assets/blog/AR-AT-2.png" alt="Agent Room" width="900" height="562"><figcaption>Agent Room：收件箱与草稿板</figcaption></figure>
<p>对于 Agent Room，核心是两点概念：<strong>收件箱和草稿板</strong></p>
<ul>
  <li>收件箱：聊天室的每一次消息都会放入 Agent 的收件箱中，但是要推入什么信息到上下文中，完全由 Agent 自己来决定。</li>
  <li>草稿板：Agent 每一次真正输出到聊天室之前，先判断消息列表是否更新；如果更新了，消息被暂存并附加信息再次注入上下文，这次 Agent 有四种选择：修改、原样发送、放弃、强制发送。</li>
</ul>
<p class="emoji">🎃 <strong>当然这个只是一种猜想，我还没有具体实践过，感兴趣的朋友可以自行尝试梳理！！！</strong></p>

<h2 id="post-task">三、Agent Task 的设计思路</h2>
<p>Task 是 Agent 执行的最小单元，一个 Task 只能被一个 Agent 执行，但是一个 Agent 可以同时执行多个 Task。产生 Task 的方式可以结合上面两种设计来看：</p>
<ol>
  <li>Agent Team 产生的 Task，更像是一个复杂任务被拆分为一个一个的小任务，可以定义为临时任务</li>
  <li>Agent Room 产生的 Task，偏向于用户手动指定某一个成员执行一个任务，可以定义为完整的任务</li>
  <li>用户或者 Agent Room 可以产生一种有时间属性的任务，是定时任务，到时间就执行</li>
</ol>

<h2 id="post-member">四、Agent Member 的设计思路</h2>
<p>Member 是需要一个完整定义的，它不是临时的，有身份，有头像，有名字，有设定，有工具，有范围，有记忆。一个 Member 可以进入多个房间，Room 会话互相不干扰。</p>
<blockquote><p>在 Agent Team 中，Member 的定位设计不是最重要的，重要的是可以为相应的复杂任务拉起正确的团队成员。</p></blockquote>
<p>这样在多智能体的设计中，Member 就在 Team 和 Room 中统一起来了，就可以统一维护和设计啦。</p>
`;

// 第二轮：第一轮 P1–P4 用户全部否决（都是暖纸 + 宋体 + 角色封面的变体），这轮方向拉开，封面不再用角色插画。
window.BLOG_VARIANTS = [
  { id: "Q1", name: "工程手记", file: "blog-Q1-engineering.html" },
  { id: "Q2", name: "排印封面", file: "blog-Q2-type-cover.html" },
  { id: "Q3", name: "黑白报刊", file: "blog-Q3-broadsheet.html" },
  { id: "Q4", name: "开发者笔记", file: "blog-Q4-dev-notes.html" },
];

const besc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
window.besc = besc;
window.coverSrc = (n) => `assets/blog/character-${n}.png`;
window.fmtDate = (d) => { const [y, m, dd] = d.split("-"); return `${y}年${+m}月${+dd}日`; };

// 代码块：顶部细条放语言与复制，不再给按钮预留 56px 空白
window.decorateBlogCode = function (root) {
  root.querySelectorAll("pre").forEach((pre) => {
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.innerHTML = `<div class="code-bar"><span class="code-lang">${pre.dataset.lang || ""}</span><button type="button" class="code-copy">复制</button></div>`;
    wrap.append(pre);
    wrap.querySelector("button").addEventListener("click", (e) => {
      navigator.clipboard?.writeText(pre.innerText);
      e.target.textContent = "已复制";
      setTimeout(() => (e.target.textContent = "复制"), 1600);
    });
  });
};

// 视图：#post 显示文章页，否则列表页
window.syncBlogView = function () {
  const post = location.hash === "#post" || location.hash.startsWith("#post-");
  document.querySelectorAll("[data-view]").forEach((el) => (el.hidden = el.dataset.view !== (post ? "post" : "list")));
  document.querySelectorAll(".demo-switcher [data-to]").forEach((a) => a.toggleAttribute("aria-current", (a.dataset.to === "post") === post));
  if (location.hash === "#post") scrollTo(0, 0);
};

window.renderBlogSwitcher = function (current) {
  const bar = document.createElement("div");
  bar.className = "demo-switcher";
  bar.innerHTML = `<span>博客 · ${window.BLOG_ROUND || "第二轮"}</span>${window.BLOG_VARIANTS.map((v) => `<a href="${v.file}${location.hash === "#post" ? "#post" : ""}" data-v="${v.file}"${v.id === current ? ' aria-current="true"' : ""}><b>${v.id}</b>${v.name}</a>`).join("")}<i class="demo-sep"></i><a href="#" data-to="list">列表</a><a href="#post" data-to="post">文章</a>`;
  document.body.append(bar);
  bar.querySelector('[data-to="list"]').addEventListener("click", (e) => { e.preventDefault(); history.pushState(null, "", location.pathname); syncBlogView(); scrollTo(0, 0); refreshVariantLinks(); });
  bar.querySelector('[data-to="post"]').addEventListener("click", () => setTimeout(refreshVariantLinks));
  addEventListener("hashchange", () => { syncBlogView(); refreshVariantLinks(); });
  function refreshVariantLinks() { bar.querySelectorAll("[data-v]").forEach((a) => (a.href = a.dataset.v + (location.hash === "#post" ? "#post" : ""))); }
};

window.watchBlogToc = function () {
  const links = [...document.querySelectorAll("[data-toc]")];
  if (!links.length) return;
  const update = () => {
    let cur = links[0].dataset.toc;
    for (const a of links) { const h = document.getElementById(a.dataset.toc); if (h && h.getBoundingClientRect().top < 140) cur = a.dataset.toc; }
    links.forEach((a) => a.classList.toggle("is-active", a.dataset.toc === cur));
  };
  addEventListener("scroll", update, { passive: true });
  update();
};

window.bootBlog = function (current) {
  document.querySelectorAll("[data-header]").forEach((el) => { renderHeader(el); el.querySelectorAll(".sh-nav a").forEach((a) => a.toggleAttribute("aria-current", a.textContent === "博客")); });
  document.querySelectorAll("[data-post-body]").forEach((el) => { el.innerHTML = window.POST_BODY; decorateBlogCode(el); });
  document.querySelectorAll("[data-post-fill]").forEach((el) => { const k = el.dataset.postFill; el.textContent = k === "date" ? fmtDate(POST.date) : POST[k]; });
  document.querySelectorAll("[data-post-toc]").forEach((el) => (el.innerHTML = POST_TOC.map((t) => `<a href="#${t.id}" data-toc="${t.id}">${besc(t.text)}</a>`).join("")));
  renderBlogSwitcher(current);
  syncBlogView();
  watchBlogToc();
};
