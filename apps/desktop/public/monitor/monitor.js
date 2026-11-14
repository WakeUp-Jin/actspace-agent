// 资源监控悬浮窗。数据由主进程推送（events.resourceSample / resourceFloatState），这里只负责显示：
// 收起时每 2 秒改三段文字；展开时再画两条曲线和分组表。规范见 docs/design-docs/frontend/front-资源监控规范.md §2。
"use strict";

(function () {
  const bridge = window.actspace;
  const HISTORY = 150;
  // 正常每 2 秒一条；超过 4 秒没收到才算主进程无响应，避免偶尔的抖动闪红条。
  const FROZEN_AFTER_MS = 4000;
  const GROUP_LABELS = {
    main: "主进程",
    renderer: "界面",
    gpu: "GPU",
    utility: "其他工具进程",
    agent: "Agent 子进程",
    monitor: "监控自身",
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    float: $("float"),
    alert: $("alert"),
    summary: $("summary"),
    cpu: $("cpu"),
    mem: $("mem"),
    delay: $("delay"),
    toggle: $("toggle"),
    togglePath: $("toggle-path"),
    close: $("close"),
    body: $("body"),
    cpuChart: $("cpu-chart"),
    memChart: $("mem-chart"),
    cpuRange: $("cpu-range"),
    memRange: $("mem-range"),
    rows: $("rows"),
  };

  let history = [];
  let latest = null;
  let lastReceivedAt = 0;
  let expanded = false;
  let frozen = false;
  let lastHeight = 0;

  const fCpu = (v) => (v === null || v === undefined ? "—" : v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);
  const fMem = (kib) => (kib >= 1024 * 1024 ? `${(kib / 1024 / 1024).toFixed(2)} GB` : `${Math.round(kib / 1024)} MB`);
  const fDelay = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
  const delayClass = (ms) => (ms >= 1000 ? "bad" : ms >= 200 ? "warn" : "");

  function setText(node, text, className) {
    if (node.textContent !== text) node.textContent = text;
    const next = `num${className ? ` ${className}` : ""}`;
    if (node.className !== next) node.className = next;
  }

  function renderSummary() {
    if (!latest) return;
    setText(el.cpu, fCpu(latest.cpuPercent), "");
    setText(el.mem, fMem(latest.rssKiB), "");
    if (frozen) setText(el.delay, `≥ ${Math.floor((Date.now() - lastReceivedAt) / 1000)} s`, "bad");
    else setText(el.delay, fDelay(latest.mainThreadDelayMs), delayClass(latest.mainThreadDelayMs));
  }

  function svgPath(values, max, height) {
    const width = 300;
    const offset = HISTORY - values.length;
    const points = values.map((value, index) => {
      const x = ((offset + index) / (HISTORY - 1)) * width;
      const y = height - 1 - (Math.min(value, max) / max) * (height - 4);
      return [x.toFixed(1), y.toFixed(1)];
    });
    if (points.length === 0) return { line: "", area: "" };
    const line = `M${points.map((p) => p.join(",")).join("L")}`;
    const area = `${line}L${points[points.length - 1][0]},${height}L${points[0][0]},${height}Z`;
    return { line, area };
  }

  function renderChart(svg, values, max) {
    const { line, area } = svgPath(values, max, 44);
    svg.innerHTML = `<line class="base" x1="0" x2="300" y1="43.5" y2="43.5"/><path class="area" d="${area}"/><path class="line" d="${line}"/>`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function renderTable() {
    if (!latest) return;
    let html = "";
    for (const group of latest.groups) {
      const isAgent = group.id === "agent";
      const isSelf = group.id === "monitor";
      const count = isAgent ? group.processes.reduce((total, row) => total + row.count, 0) : 0;
      const unavailable = isAgent && !latest.agentProcessesAvailable;
      const cpuClass = group.id === "main" && group.cpuPercent >= 90 ? " warn" : "";
      html +=
        `<tr class="${isSelf ? "self" : ""}"><td>${GROUP_LABELS[group.id]}${isAgent && !unavailable ? `<span class="sub">${count} 个</span>` : ""}</td>` +
        `<td class="cpu num${cpuClass}">${unavailable ? "—" : fCpu(group.cpuPercent)}</td><td class="mem num">${unavailable ? "—" : group.rssKiB ? fMem(group.rssKiB) : "—"}</td></tr>`;
      if (isAgent) {
        for (const row of group.processes.slice(0, 6)) {
          const name = row.count > 1 ? `${row.label} ×${row.count}` : row.label;
          html += `<tr><td title="${escapeHtml(name)}"><span class="sub">${escapeHtml(name)}</span></td><td class="cpu num sub">${fCpu(row.cpuPercent)}</td><td class="mem num sub">${fMem(row.rssKiB)}</td></tr>`;
        }
      }
    }
    html += `<tr class="total"><td>合计</td><td class="cpu num">${fCpu(latest.cpuPercent)}</td><td class="mem num">${fMem(latest.rssKiB)}</td></tr>`;
    el.rows.innerHTML = html;
  }

  function renderBody() {
    if (!expanded) return;
    const cpu = history.map((p) => p.cpuPercent);
    const mem = history.map((p) => p.rssKiB);
    const cpuMax = Math.max(100, Math.ceil(Math.max(0, ...cpu) / 100) * 100);
    const memMax = Math.max(1, ...mem) * 1.15;
    renderChart(el.cpuChart, cpu, cpuMax);
    renderChart(el.memChart, mem, memMax);
    el.cpuRange.textContent = `最近 5 分钟 · 上限 ${cpuMax}%`;
    el.memRange.textContent = mem.length ? `${fMem(Math.min(...mem))} – ${fMem(Math.max(...mem))}` : "";
    renderTable();
    el.body.classList.toggle("stale", frozen);
  }

  function reportLayout() {
    const height = el.float.offsetHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    bridge.resourceMonitor.setFloatLayout({ expanded, height });
  }

  function setExpanded(next) {
    expanded = next;
    el.body.hidden = !expanded;
    el.toggle.setAttribute("aria-label", expanded ? "收起" : "展开");
    el.toggle.title = expanded ? "收起" : "展开";
    el.togglePath.setAttribute("d", expanded ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6");
    renderBody();
    lastHeight = 0;
    reportLayout();
  }

  function setFrozen(next) {
    if (frozen === next) return;
    frozen = next;
    el.alert.hidden = !frozen;
    el.summary.classList.toggle("stale", frozen);
    el.body.classList.toggle("stale", frozen);
    reportLayout();
  }

  bridge.events.resourceFloatState((state) => {
    history = state.history.slice(-HISTORY);
    latest = state.latest;
    lastReceivedAt = Date.now();
    renderSummary();
    setExpanded(state.expanded);
  });

  bridge.events.resourceSample(({ sample, point }) => {
    latest = sample;
    history.push(point);
    if (history.length > HISTORY) history.shift();
    lastReceivedAt = Date.now();
    setFrozen(false);
    renderSummary();
    renderBody();
    reportLayout();
  });

  // 主进程卡住时推送会停；这个计时器只做「多久没收到」的判断，平时不改 DOM。
  setInterval(() => {
    if (!lastReceivedAt) return;
    const silentMs = Date.now() - lastReceivedAt;
    if (silentMs < FROZEN_AFTER_MS) return;
    setFrozen(true);
    el.alert.textContent = `主进程无响应 ${Math.floor(silentMs / 1000)} 秒`;
    renderSummary();
  }, 1000);

  el.toggle.addEventListener("click", () => setExpanded(!expanded));
  el.close.addEventListener("click", () => bridge.resourceMonitor.closeFloat());
})();
