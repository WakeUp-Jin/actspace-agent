// 首屏插件舞台：任务推进时点亮用到的插件，插件可悬停查看说明、点击开关。
// 只在舞台进入视口时播放；离开视口或切到后台就停表，回来从头播。
const SVG_NS = 'http://www.w3.org/2000/svg';
const NARROW = '(max-width: 1180px)';

type Side = 'l' | 'r' | 'b' | 't';

export interface PluginStage {
  draw(): void;
  off(name: string): boolean;
  light(names: string[]): void;
  settle(): void;
  all(names: string[]): void;
  clear(): void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createPluginStage(
  root: HTMLElement,
  target: HTMLElement,
  count: HTMLElement | null,
  onToggle?: (name: string, off: boolean, used: boolean) => void,
): PluginStage {
  const svg = root.querySelector<SVGSVGElement>('svg.stage-lines')!;
  const tip = root.querySelector<HTMLElement>('.tip')!;
  const mods = [...root.querySelectorAll<HTMLButtonElement>('.m')];
  const disabled = new Set<string>();
  const used = new Set<string>();
  const mod = (name: string) => mods.find((m) => m.dataset.m === name)!;

  const sync = () => {
    svg.querySelectorAll<SVGGElement>('g').forEach((g) => {
      const m = mod(g.dataset.m!);
      if (m.dataset.st) g.dataset.st = m.dataset.st; else delete g.dataset.st;
      if (disabled.has(g.dataset.m!)) g.dataset.off = ''; else delete g.dataset.off;
    });
    if (count) count.textContent = String(mods.filter((m) => m.dataset.st).length);
  };

  // 连线是折线：从模块边缘出发，落到窗口最近的一边。
  const draw = () => {
    svg.replaceChildren();
    if (matchMedia(NARROW).matches) return sync();
    const sr = root.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const x = (v: number) => v - sr.left;
    const y = (v: number) => v - sr.top;
    for (const m of mods) {
      const a = m.getBoundingClientRect();
      const side = m.dataset.side as Side;
      let d: string; let ex: number; let ey: number;
      if (side === 'l' || side === 'r') {
        const sx = x(side === 'l' ? a.right : a.left);
        const sy = y(a.top + a.height / 2);
        ex = x(side === 'l' ? b.left : b.right);
        ey = clamp(sy, y(b.top) + 16, y(b.bottom) - 16);
        d = Math.abs(sy - ey) < 1 ? `M${sx} ${sy}H${ex}` : `M${sx} ${sy}H${(sx + ex) / 2}V${ey}H${ex}`;
      } else {
        const sx = x(a.left + a.width / 2);
        const sy = y(side === 'b' ? a.top : a.bottom);
        ex = clamp(sx, x(b.left) + 16, x(b.right) - 16);
        ey = y(side === 'b' ? b.bottom : b.top);
        d = Math.abs(sx - ex) < 1 ? `M${sx} ${sy}V${ey}` : `M${sx} ${sy}V${(sy + ey) / 2}H${ex}V${ey}`;
      }
      const g = document.createElementNS(SVG_NS, 'g');
      g.dataset.m = m.dataset.m;
      for (const cls of ['base', 'flow']) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', cls);
        path.setAttribute('d', d);
        g.append(path);
      }
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(ex));
      dot.setAttribute('cy', String(ey));
      dot.setAttribute('r', '2.5');
      g.append(dot);
      svg.append(g);
    }
    sync();
  };

  const api: PluginStage = {
    draw,
    off: (name) => disabled.has(name),
    light(names) {
      api.settle();
      for (const name of names) { used.add(name); if (!disabled.has(name)) mod(name).dataset.st = 'on'; }
      sync();
    },
    settle() {
      for (const m of mods) if (m.dataset.st === 'on') m.dataset.st = 'done';
      sync();
    },
    all(names) {
      for (const name of names) { used.add(name); if (!disabled.has(name)) mod(name).dataset.st = 'done'; }
      sync();
    },
    clear() {
      for (const m of mods) delete m.dataset.st;
      used.clear();
      sync();
    },
  };

  const showTip = (m: HTMLButtonElement) => {
    const [name, text] = (m.dataset.tip ?? '').split('|');
    const sr = root.getBoundingClientRect();
    const a = m.getBoundingClientRect();
    const b = document.createElement('b');
    b.textContent = name;
    tip.replaceChildren(b, ` · ${text}${disabled.has(m.dataset.m!) ? '（已关闭）' : ''}`);
    tip.classList.add('on');
    const w = tip.offsetWidth; const h = tip.offsetHeight;
    const side = m.dataset.side as Side;
    let left: number; let top: number;
    if (side === 'l') { left = a.right - sr.left + 12; top = a.top - sr.top + (a.height - h) / 2; }
    else if (side === 'r') { left = a.left - sr.left - w - 12; top = a.top - sr.top + (a.height - h) / 2; }
    else if (side === 't') { left = a.left - sr.left + (a.width - w) / 2; top = a.bottom - sr.top + 10; }
    else { left = a.left - sr.left + (a.width - w) / 2; top = a.top - sr.top - h - 10; }
    tip.style.left = `${clamp(left, 8, sr.width - w - 8)}px`;
    tip.style.top = `${clamp(top, 8, sr.height - h - 8)}px`;
  };
  const hideTip = () => tip.classList.remove('on');

  for (const m of mods) {
    m.addEventListener('click', () => {
      const name = m.dataset.m!;
      const off = !disabled.has(name);
      if (off) { disabled.add(name); delete m.dataset.st; }
      else { disabled.delete(name); if (used.has(name)) m.dataset.st = 'done'; }
      m.classList.toggle('off', off);
      m.setAttribute('aria-pressed', String(!off));
      sync();
      if (tip.classList.contains('on')) showTip(m);
      onToggle?.(name, off, used.has(name));
    });
    m.addEventListener('mouseenter', () => showTip(m));
    m.addEventListener('mouseleave', hideTip);
    m.addEventListener('focus', () => { if (m.matches(':focus-visible')) showTip(m); });
    m.addEventListener('blur', hideTip);
  }
  return api;
}

export function createClock() {
  let timers: number[] = [];
  return {
    at(ms: number, fn: () => void) { timers.push(window.setTimeout(fn, ms)); },
    stop() { timers.forEach(clearTimeout); timers = []; },
  };
}

// 进入视口才播放；离开视口或页面隐藏就停止，下次从头开始。
export function playWhenVisible(root: HTMLElement, start: () => void, stop: () => void) {
  let visible = false;
  let running = false;
  const update = () => {
    const should = visible && !document.hidden;
    if (should && !running) { running = true; start(); }
    else if (!should && running) { running = false; stop(); }
  };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0.25 }).observe(root);
  document.addEventListener('visibilitychange', update);
}

// 首屏任务：窗口按桌面端真实界面重画，用到的插件各自对应窗口里一处看得见的变化。
// 关掉插件会按新配置重跑（Browser Use 这个任务用不到，开关不重跑）。
type Category = 'sys' | 'tools' | 'rules' | 'skills' | 'sum' | 'conv';
const CATEGORIES: Category[] = ['sys', 'tools', 'rules', 'skills', 'sum', 'conv'];
const LIMIT = 200;
const fmt = (k: number) => `${Math.round(k * 10) / 10}K`;
const icon = (d: string, size = 12) => `<svg class="i chev" viewBox="0 0 24 24" style="width:${size}px;height:${size}px"><path d="${d}"/></svg>`;
const CHEV = icon('m9 18 6-6-6-6');
const PREVIOUS = `<div class="prev"><div class="bubble">先把路由守卫修好，未登录跳回 /login。</div></div>
  <div class="prev say">已修复。改动 1 个文件，guard 测试 6 个通过。</div><div class="gap"></div>`;

export function initializeHeroStage() {
  const root = document.querySelector<HTMLElement>('[data-hero-stage]');
  if (!root) return;
  const app = root.querySelector<HTMLElement>('[data-hero-window]')!;
  const h = <T extends Element = HTMLElement>(name: string) => app.querySelector<T>(`[data-h="${name}"]`)!;
  const feed = h('feed');
  const scroll = h('scroll');
  const panel = h('panel');
  const panelBtn = h('panel-btn');
  const evs = h('evs');
  const send = h('send');
  const ph = h('ph');
  const ring = h('ring');
  const ringArc = h<SVGCircleElement>('ring-arc');
  const segments = new Map(CATEGORIES.map((c) => [c, h('bar').querySelector<HTMLElement>(`[data-c="${c}"]`)!]));
  const legend = new Map(CATEGORIES.map((c) => [c, app.querySelector<HTMLElement>(`[data-l="${c}"]`)!]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = createClock();
  let playing = false;
  let rerun = 0;
  const stage = createPluginStage(root, app, root.querySelector('[data-hero-count]'), (name) => {
    if (name === 'browser') return;
    clock.stop();
    clearTimeout(rerun);
    if (playing || reduced) rerun = window.setTimeout(run, 450);
  });
  const on = (name: string) => !stage.off(name);

  // 上下文：一轮里各类内容涨多少，面板和输入框下方的圆环一起更新。
  let ctx: Record<Category, number>;
  let compressed = false;
  let events = 0;
  const total = () => CATEGORIES.reduce((sum, c) => sum + ctx[c], 0);
  const renderContext = () => {
    const pct = Math.round((total() / LIMIT) * 100);
    h('tok').textContent = `≈${fmt(total())}`;
    h('pct').textContent = `${pct}%`;
    h('ring-txt').textContent = `${pct}%`;
    for (const c of CATEGORIES) {
      segments.get(c)!.style.width = `${(ctx[c] / LIMIT) * 100}%`;
      legend.get(c)!.textContent = fmt(ctx[c]);
    }
    ringArc.style.strokeDashoffset = String(37.7 * (1 - Math.min(1, total() / LIMIT)));
    ring.classList.toggle('hot', pct >= 85);
  };
  const event = (name: string, value: string, note: string, tone: Category | 'warn', highlight = false) => {
    if (!on('panel')) return;
    events += 1;
    const el = document.createElement('div');
    el.className = highlight ? 'ev hl' : 'ev';
    el.dataset.c = tone;
    el.innerHTML = `<b>${name}</b><span>${value}</span><small>${note}</small>`;
    evs.prepend(el);
    while (evs.children.length > 6) evs.lastElementChild!.remove();
    h('ev-count').textContent = `${events} 条`;
  };

  // 对话：过程行先写进 flow（收尾时塌缩成 Worked），其余直接进 feed。
  let flow: HTMLElement | null = null;
  const follow = () => requestAnimationFrame(() => scroll.scrollTo({ top: scroll.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }));
  const put = (html: string, cls = '') => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    if (cls) el.classList.add(...cls.split(' '));
    el.classList.add('in');
    (flow ?? feed).append(el);
    follow();
    return el;
  };
  const putOutside = (html: string) => { const inner = flow; flow = null; put(html); flow = inner; };
  const row = (verb: string, path: string, extra = '', cls = 'run') =>
    put(`<div class="row"><span class="v">${verb}</span><span class="p">${path}</span>${extra}${CHEV}</div>`, cls);
  const done = (el?: HTMLElement) => el?.classList.remove('run');

  // 压缩开着：越过阈值立刻压；关着：最多涨到 97%，不会超出上限。
  const compress = () => {
    compressed = true;
    const before = total();
    stage.light(['comp']);
    ctx.sum = 11.6;
    ctx.conv = 32.4;
    renderContext();
    putOutside(`<div class="cmp"><span>上下文已压缩 · <b>${fmt(before)} → ${fmt(total())}</b></span></div>`);
    event('自动压缩', `${fmt(before)} → ${fmt(total())}`, '目标、决策和没做完的事写进摘要', 'sum', true);
  };
  const add = (c: Category, k: number) => {
    ctx[c] += k;
    if (!on('comp')) ctx.conv -= Math.max(0, total() - 194);
    renderContext();
    if (on('comp') && !compressed && total() >= 160) compress();
  };

  const reset = () => {
    clock.stop();
    stage.clear();
    ctx = { sys: 4.2, tools: 12.8, rules: 3.1, skills: 0, sum: 5.4, conv: 118 };
    compressed = false;
    renderContext();
    events = 0;
    evs.replaceChildren();
    h('ev-count').textContent = '0 条';
    flow = null;
    feed.innerHTML = PREVIOUS;
    scroll.scrollTop = scroll.scrollHeight;
    panel.classList.remove('open');
    panelBtn.classList.remove('on');
    send.classList.remove('stop');
    ph.textContent = '继续追问…';
    h('perm').textContent = on('approve') ? '自动' : '完全权限';
    h('ses-spin').hidden = false;
    h('ses-time').hidden = true;
  };

  function run() {
    reset();
    let t = reduced ? 0 : 500;
    const step = (gap: number, fn: () => void) => { clock.at(t, fn); t += reduced ? 0 : gap; };
    let r: HTMLElement | undefined;
    let started = 0;

    step(900, () => {
      put('<div class="bubble">把登录页的表单校验补完，跑一下测试。</div>');
      send.classList.add('stop');
      ph.textContent = '继续追问，运行中发送会进入队列…';
      if (on('panel')) { panel.classList.add('open'); panelBtn.classList.add('on'); stage.light(['panel']); }
    });
    step(700, () => {
      flow = put('<div class="collapse"><div class="feed flow"></div></div>').firstElementChild as HTMLElement;
      started = performance.now();
    });

    // 读取 + 渐进披露
    if (on('read')) {
      if (on('prog')) {
        step(1100, () => { r = row('Read', 'src/pages/Login.tsx'); stage.light(['read', 'prog']); add('conv', 2.1); event('渐进披露', '+2.1K', '只载入 Login.tsx', 'conv'); });
      } else {
        step(1100, () => { r = row('Read', 'src/ · 38 个文件', ' <span class="tag">一次性载入</span>'); stage.light(['read']); add('conv', 31); event('一次性载入', '+31K', '渐进披露已关闭，整个 src 都进了上下文', 'warn', true); });
      }
      step(0, () => done(r));
    }
    // Skills
    if (on('skills')) {
      step(1100, () => { r = row('Loaded Skill', '表单校验约定'); stage.light(['skills']); add('skills', 1.8); event('Skill 注入', '+1.8K', '表单校验约定：错误文案、zod 写法', 'skills'); });
      step(0, () => done(r));
    }
    // 子 Agent：检索过程留在子 Agent，关掉后检索结果都进主会话
    if (on('sub')) {
      let card: HTMLElement;
      step(1700, () => {
        card = put(`<div class="card agent"><span class="av"></span><div class="who"><div class="nm">查找可复用的校验函数</div>
          <div class="meta"><span>Explore</span>·<b>正在搜索 src/lib …</b></div></div><span class="st">运行中</span></div>`);
        stage.light(['sub']);
      });
      step(900, () => {
        card.querySelector('.meta b')!.textContent = '找到 emailSchema、passwordRule';
        card.querySelector('.st')!.textContent = '已完成';
        add('conv', 0.9);
        event('子 Agent 摘要', '+0.9K', '检索过程留在子 Agent，主会话只收结论', 'conv');
      });
    } else {
      step(800, () => { r = row('Searched files', 'src/lib · 14 个结果'); add('conv', 6.4); });
      step(800, () => { done(r); r = row('Read', 'src/lib/schema.ts'); add('conv', 9.2); });
      step(800, () => { done(r); r = row('Read', 'src/lib/rules.ts'); add('conv', 8.1); event('检索结果', '+23.7K', '子 Agent 已关闭，检索内容都留在主会话', 'warn', true); });
      step(0, () => done(r));
    }
    // 编辑
    if (on('edit')) {
      step(1000, () => { r = row('Edit', 'src/lib/validate.ts', ' <u>+24</u> <s>-3</s>'); stage.light(['edit']); add('conv', 3.6); });
      step(900, () => { done(r); r = row('Edit', 'src/pages/Login.tsx', ' <u>+7</u>'); add('conv', 1.8); });
      step(0, () => done(r));
    }
    // 终端 + 审批：没改文件时测试照旧失败
    const testOk = on('edit');
    const runTest = () => {
      const lines = testOk
        ? ['<span class="c">$ pnpm test</span>', '<span class="g">✓</span> validate.test.ts (11)', '<span class="g">✓</span> Login.test.tsx (7)', '<span class="g">Tests 18 passed</span> · 2.4s']
        : ['<span class="c">$ pnpm test</span>', '<span class="r">✕</span> validate.test.ts (3 failed)', '<span class="g">✓</span> Login.test.tsx (7)', '<span class="r">Tests 3 failed</span> · 2.1s'];
      const out = put(`<div><div class="row run"><span class="v">Ran</span><span class="p">pnpm test</span>${CHEV}</div>
        <div class="out">${lines.map((line) => `<div>${line}</div>`).join('')}</div></div>`);
      stage.light(['term']);
      out.querySelectorAll('.out div').forEach((line, i) => clock.at(reduced ? 0 : 250 + i * 320, () => { line.classList.add('on'); follow(); }));
      clock.at(reduced ? 0 : 1700, () => {
        out.querySelector('.row')!.classList.remove('run');
        add('conv', 2.3);
        event('命令输出', '+2.3K', 'pnpm test · 只留摘要行', 'conv');
      });
    };
    if (on('term')) {
      if (on('approve')) {
        let card: HTMLElement;
        step(1500, () => {
          card = put(`<div class="card appr"><div class="hd">${icon('M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 8 2-2-2-2m4 6h4', 14)}运行项目测试 pnpm</div>
            <div class="cmd"><i>$</i> <em>pnpm</em> test</div>
            <div class="ft"><span>真实环境</span><b>拒绝</b><b class="al">本会话允许 pnpm</b><b class="go">运行</b></div></div>`);
          stage.light(['approve']);
        });
        step(400, () => card.querySelector('.go')!.classList.add('press'));
        step(2300, () => { card.remove(); runTest(); });
      } else {
        step(2300, runTest);
      }
    } else {
      step(900, () => row('终端已关闭', '没有运行测试', '', 'mute'));
    }
    // 压缩：任务里没越过阈值时，在收尾前补上一次
    step(900, () => {
      if (on('comp')) {
        if (!compressed) { ctx.conv += Math.max(0, 161 - total()); compress(); }
        return;
      }
      ctx.conv += Math.max(0, 182 - total());
      renderContext();
      putOutside(`<div class="cmp warn"><span>上下文已用 ${Math.round((total() / LIMIT) * 100)}% · 压缩已关闭</span></div>`);
      event('接近上限', fmt(total()), '压缩已关闭，再聊几轮就会超出上限', 'warn', true);
    });
    // 收尾：过程塌缩成 Worked，交付卡片出现
    step(1300, () => {
      stage.settle();
      const box = flow!.parentElement!;
      const secs = Math.max(12, Math.round((performance.now() - started) / 1000) * 2);
      box.style.height = `${box.scrollHeight}px`;
      requestAnimationFrame(() => { box.style.height = '0px'; box.style.opacity = '0'; });
      flow = null;
      feed.insertBefore(put(`<div class="worked">Worked for ${secs}s ${icon('m9 18 6-6-6-6', 13)}</div>`), box);
    });
    step(700, () => {
      const parts = [on('edit') ? '邮箱和密码校验补完了' : '「编辑」已关闭，我只给出了修改建议，没有改文件'];
      if (on('term')) parts.push(testOk ? '18 个测试全部通过' : '现有代码还有 3 个测试失败');
      put(`<div class="say">${parts.join('，')}。</div>`);
      if (on('edit')) {
        put(`<div class="card chg"><div class="h"><span class="fi"><b>&lt;/&gt;</b></span><div>已编辑 2 个文件<small><u>+31</u> <s>-3</s></small></div></div>
          <div class="f"><span>src/lib/validate.ts</span><span><u>+24</u> <s>-3</s></span></div>
          <div class="f"><span>src/pages/Login.tsx</span><span><u>+7</u> <s>-0</s></span></div></div>`);
      }
      put(`<div class="usage">${icon('M8 4h10a2 2 0 0 1 2 2v10M4 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 13)}
        <b>${icon('M3 5c0-1.7 4-3 9-3s9 1.3 9 3-4 3-9 3-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3', 13)}用量 ${on('sub') ? '18.4K' : '41.2K'} tok</b><span>09:41</span></div>`);
      send.classList.remove('stop');
      ph.textContent = '继续追问…';
      h('ses-spin').hidden = true;
      h('ses-time').hidden = false;
    });
    step(2400, () => stage.settle());
    if (!reduced) clock.at(t + 4200, run);
  }

  const redraw = () => stage.draw();
  addEventListener('resize', redraw);
  document.fonts?.ready.then(redraw);
  redraw();
  reset();
  // 减少动态效果：一次排完，停在最后一帧。
  if (reduced) { run(); return; }
  playWhenVisible(root, () => { playing = true; run(); }, () => { playing = false; clearTimeout(rerun); reset(); });
}
