// Markdown 渲染管线（marked + highlight.js）：图→figure、emoji 段落→提示块、标题编号拆分、代码块顶栏与行号槽、中英空格。md-render.html 与 blog-final.html 共用。
const LANG = { javascript: "JavaScript", typescript: "TypeScript", go: "Go", json: "JSON", plaintext: "Text", bash: "Bash", python: "Python", xml: "XML" };

// 中英文之间补空格（只动正文文字，不碰代码）
const CJK = "⺀-⻿⼀-⿟぀-ゟ゠-ヿ㄀-ㄯ㈀-㋿㐀-䶿一-鿿豈-﫿";
const spaceText = (s) => s.replace(new RegExp(`([${CJK}])([A-Za-z0-9@#$%^&*\\-+=\\\\|/(\\[{<])`, "g"), "$1 $2").replace(new RegExp(`([A-Za-z0-9!%&*\\-+=\\\\|/)\\]}>])([${CJK}])`, "g"), "$1 $2");
function autoSpace(root) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest("pre, code") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
  nodes.forEach((n) => (n.nodeValue = spaceText(n.nodeValue)));
  // 行内代码两侧紧贴中文时也留空
  root.querySelectorAll(":not(pre) > code").forEach((c) => {
    const p = c.previousSibling, nx = c.nextSibling, re = new RegExp(`[${CJK}]`);
    if (p && p.nodeType === 3 && re.test(p.nodeValue.slice(-1))) p.nodeValue += " ";
    if (nx && nx.nodeType === 3 && re.test(nx.nodeValue[0])) nx.nodeValue = " " + nx.nodeValue;
  });
}

window.renderMarkdown = function (md, src, { spacing = true } = {}) {
  md.innerHTML = marked.parse(src, { gfm: true });
  // 单独一张图的段落 → figure，alt 做图注
  md.querySelectorAll("p > img:only-child").forEach((img) => {
    const p = img.parentElement; if (p.textContent.trim()) return;
    const f = document.createElement("figure"); f.innerHTML = `<img src="${img.getAttribute("src")}" alt="${img.alt}" loading="lazy"><figcaption>${img.alt}</figcaption>`; p.replaceWith(f);
  });
  // 引用里的空段落去掉
  md.querySelectorAll("blockquote p").forEach((p) => { if (!p.textContent.trim()) p.remove(); });
  // emoji 开头的段落 → 提示块
  md.querySelectorAll(":scope > p").forEach((p) => {
    const m = p.innerHTML.match(/^\s*(\p{Extended_Pictographic}️?)\s*/u);
    if (m) p.outerHTML = `<div class="callout"><span class="ico">${m[1]}</span><div>${p.innerHTML.slice(m[0].length)}</div></div>`;
  });
  // 标题里手写的「2、」「3.1、」编号单独拆出来，给需要统一编号的风格用
  md.querySelectorAll("h2, h3").forEach((h, i) => {
    h.id = `s-${i}`;
    const m = h.textContent.match(/^\s*(\d+(?:\.\d+)*)[、.．]\s*/);
    h.innerHTML = m ? `<span class="hn">${m[1]}</span><span class="ht">${h.textContent.slice(m[0].length)}</span>` : `<span class="ht">${h.textContent}</span>`;
  });
  // 代码块：高亮 + 顶栏（语言 / 行数 / 复制）+ 行号槽
  md.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    let lang = ((code.className.match(/language-(\S+)/) || [])[1] || "").toLowerCase();
    if (lang === "plain" || !hljs.getLanguage(lang)) lang = "plaintext";
    const src = code.textContent.replace(/\n$/, "");
    code.innerHTML = hljs.highlight(src, { language: lang }).value;
    code.classList.add("hljs");
    const lines = src.split("\n").length;
    const wrap = document.createElement("div"); wrap.className = "code"; wrap.dataset.lang = lang;
    wrap.innerHTML = `<div class="code-bar"><span class="code-lang">${LANG[lang] || lang}</span><span class="code-lines">${lines} 行</span><button type="button" class="code-copy">复制</button></div><div class="code-body"><div class="code-gutter" aria-hidden="true">${Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</div></div>`;
    pre.replaceWith(wrap); wrap.querySelector(".code-body").append(pre);
    wrap.querySelector(".code-copy").addEventListener("click", (e) => { navigator.clipboard?.writeText(src); e.target.textContent = "已复制"; setTimeout(() => (e.target.textContent = "复制"), 1500); });
  });
  if (spacing) autoSpace(md);
};
window.spaceText = spaceText;

