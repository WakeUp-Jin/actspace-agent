/*
 * 模型与供应商 Demo · 共用数据与交互逻辑
 *
 * index.html 只负责「长什么样」：定义 window.View，返回 HTML 字符串。
 * 所有状态变更都走这里的 ACT / INPUT，用 data-act / data-in 属性触发（事件委托）。
 *
 * ── View 契约 ─────────────────────────────────────────────
 *   View.page(S)      设置页右侧内容（不含侧栏），按 S.route.name 分派：
 *                     'list' | 'catalog' | 'setup' | 'select' | 'detail'
 *   View.composer(S)  对话页里输入框那一块（含模型按钮和选择器浮层），外层聊天区由这里提供
 *   View.overlay(S)   全局浮层（手动添加弹窗等），没有返回 ''
 *
 * ── 触发方式 ─────────────────────────────────────────────
 *   <button data-act="名字" data-xxx="…">   点击 → ACT[名字](dataset)
 *   <input data-in="名字" data-f="唯一焦点id">  输入 → INPUT[名字](value, dataset)；data-f 用于重绘后恢复焦点
 *   select 也用 data-in（input 事件）。
 *   弹窗容器写 data-act="noop"，防止点到内部空白时触发外层遮罩的关闭。
 *   浮层（选择器）容器加 class="js-picker"，点它外面会自动关闭。
 *
 * ── 常用 ACT（dataset 字段） ─────────────────────────────
 *   go{r}  openConn{c}  pickTpl{t}  draftProto{p}  draftAdv  testFetch  backSetup
 *   draftPick{id}  draftAll  draftNone  saveConn
 *   toggleModel{c,m}  expand{c,m}  lvToggle{c,m,l}  lvDef{c,m,l}  imgToggle{c,m}
 *   priceManual{c,m}  useCanon{c,m,k}  dropCanon{c,m}  resetModel{c,m}  removeModel{c,m}
 *   keyEdit{c}  keySave{c}  connTest{c}  connProto{c,p}  refetch{c}  delConn{c}
 *   openManual{target}  ('draft' 或连接 id)   manualClose  manualCanon{k}  manualLevel{l}
 *   manualDef{l}  manualImage  manualMore  manualTest  manualSave
 *   openPicker{ctx}  ('composer' 或用途 id)   pkModel{k}  pkLevel{l}  pkFollow  setDefault  gotoModel{k}
 *   ui{k,v}  把 S.ui[k] 设为 v（v 与当前相同则清空）——版本自用的展开/切换状态
 *   view{v}  theme{v}  reset  notes
 * ── 常用 INPUT ───────────────────────────────────────────
 *   catQ  draftKey  draftURL  draftProxy  draftMult  stepQ  pkQ
 *   connName{c}  connURL{c}  connMult{c}  connProtoSel{c}（select）  keyVal{c}
 *   mName{c,m}  mCtx{c,m}  mOut{c,m}  mPrice{c,m,k}  mCanon{c,m}（select：沿用某个目录模型）
 *   manualId  manualName  manualCtx  manualOut  manualPrice{k}
 */
(function () {
  const LEVELS = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];
  const LV = { off: '关', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
  const PROTO = { anthropic: 'Anthropic Messages', 'openai-chat': 'OpenAI Chat', 'openai-responses': 'OpenAI Responses' };
  const MARKS = '../../../../apps/desktop/src/renderer/assets/provider-marks/';

  /* ── 供应商模板：代码维护的一张表 ── */
  const TEMPLATES = [
    { id: 'anthropic', name: 'Anthropic', group: '官方', protocol: 'anthropic', baseURL: 'https://api.anthropic.com', mark: 'anthropic', color: true, models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
    { id: 'openai', name: 'OpenAI', group: '官方', protocol: 'openai-responses', baseURL: 'https://api.openai.com/v1', mark: 'openai', models: ['gpt-5.5', 'gpt-5.5-mini', 'gpt-4.1'] },
    { id: 'deepseek', name: 'DeepSeek', group: '官方', protocol: 'openai-chat', baseURL: 'https://api.deepseek.com', mark: 'deepseek', color: true, models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
    { id: 'moonshot', name: 'Kimi', group: '官方', protocol: 'openai-chat', baseURL: 'https://api.moonshot.cn/v1', mark: 'moonshot', models: ['kimi-k2.6'] },
    { id: 'zai', name: '智谱 Z.AI', group: '官方', protocol: 'openai-chat', baseURL: 'https://open.bigmodel.cn/api/paas/v4', mark: 'zai', models: ['glm-5'] },
    { id: 'minimax', name: 'MiniMax', group: '官方', protocol: 'anthropic', baseURL: 'https://api.minimaxi.com/anthropic', mark: 'minimax', models: ['minimax-m3'] },
    { id: 'volc', name: '火山方舟', group: '官方', protocol: 'openai-chat', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', mark: 'volcengine', color: true, models: ['deepseek-v4-flash', 'kimi-k2.6', 'doubao-seed-2-0-pro'] },
    { id: 'xiaomi', name: '小米 MiMo', group: '官方', protocol: 'openai-chat', baseURL: 'https://api.xiaomimimo.com/v1', mark: 'xiaomi', models: ['mimo-v2-pro'] },
    { id: 'openrouter', name: 'OpenRouter', group: '聚合平台', protocol: 'openai-chat', baseURL: 'https://openrouter.ai/api/v1', mark: 'openrouter', models: ['anthropic/claude-sonnet-5-5', 'openai/gpt-5.5', 'deepseek/deepseek-v4-flash', 'qwen/qwen3-coder-plus', 'z-ai/glm-5'] },
    { id: 'custom', name: '自定义中转', group: '自定义', protocol: null, baseURL: '', mark: null, desc: '任意兼容 Anthropic / OpenAI 协议的服务', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'glm-5', 'kimi-k2.6', 'claude-sonnet-5-5-20261001', 'relay-coder-v2'] },
  ];
  const tplOf = (id) => TEMPLATES.find((t) => t.id === id);

  /* ── 模型目录：models.dev 快照（示意数据） ── */
  const CATALOG = {
    'claude-opus-5-5': { name: 'Claude Opus 5.5', ctx: 200000, out: 64000, input: ['text', 'image'], think: { levels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'], def: 'high' }, price: { in: 15, out: 75, cr: 1.5, cw: 18.75 }, rec: true },
    'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', ctx: 200000, out: 64000, input: ['text', 'image'], think: { levels: ['off', 'low', 'medium', 'high'], def: 'medium' }, price: { in: 3, out: 15, cr: 0.3, cw: 3.75 }, rec: true },
    'claude-haiku-5-5': { name: 'Claude Haiku 5.5', ctx: 200000, out: 32000, input: ['text', 'image'], think: { levels: ['off', 'low', 'high'], def: 'off' }, price: { in: 1, out: 5, cr: 0.1, cw: 1.25 }, rec: true },
    'gpt-5.5': { name: 'GPT-5.5', ctx: 400000, out: 128000, input: ['text', 'image'], think: { levels: ['low', 'medium', 'high', 'xhigh'], def: 'medium' }, price: { in: 1.25, out: 10, cr: 0.125, cw: null }, rec: true },
    'gpt-5.5-mini': { name: 'GPT-5.5 mini', ctx: 400000, out: 128000, input: ['text', 'image'], think: { levels: ['low', 'medium', 'high'], def: 'low' }, price: { in: 0.25, out: 2, cr: 0.025, cw: null }, rec: true },
    'gpt-4.1': { name: 'GPT-4.1', ctx: 1000000, out: 32000, input: ['text', 'image'], think: { levels: [] }, price: { in: 2, out: 8, cr: 0.5, cw: null } },
    'deepseek-v4-flash': { name: 'DeepSeek V4 Flash', ctx: 128000, out: 32000, input: ['text'], think: { levels: ['off', 'high', 'max'], def: 'off' }, price: { in: 0.28, out: 0.42, cr: 0.028, cw: null }, rec: true },
    'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', ctx: 128000, out: 64000, input: ['text'], think: { levels: ['off', 'high', 'max'], def: 'high' }, price: { in: 0.55, out: 2.19, cr: 0.14, cw: null }, rec: true },
    'kimi-k2.6': { name: 'Kimi K2.6', ctx: 256000, out: 32000, input: ['text', 'image'], think: { levels: ['off', 'high'], def: 'high' }, price: { in: 0.6, out: 2.5, cr: 0.15, cw: null }, rec: true },
    'glm-5': { name: 'GLM-5', ctx: 200000, out: 128000, input: ['text'], think: { levels: ['off', 'high'], def: 'high' }, price: { in: 0.6, out: 2.2, cr: 0.11, cw: null }, rec: true },
    'minimax-m3': { name: 'MiniMax M3', ctx: 1000000, out: 80000, input: ['text'], think: { levels: ['high'], def: 'high' }, price: { in: 0.3, out: 1.2, cr: 0.03, cw: null }, rec: true },
    'qwen3-coder-plus': { name: 'Qwen3 Coder Plus', ctx: 1000000, out: 64000, input: ['text'], think: { levels: [] }, price: { in: 1, out: 5, cr: 0.1, cw: null } },
    'mimo-v2-pro': { name: 'MiMo V2 Pro', ctx: 256000, out: 32000, input: ['text'], think: { levels: ['off', 'high'], def: 'high' }, price: { in: 0.8, out: 3, cr: 0.08, cw: null }, rec: true },
  };

  /** id → 目录：精确命中 / 去 vendor/ 前缀命中 / 日期后缀近似（只建议）。 */
  function matchCatalog(id) {
    if (!id) return null;
    if (CATALOG[id]) return { key: id, exact: true };
    const s = id.includes('/') ? id.split('/').pop() : id;
    if (CATALOG[s]) return { key: s, exact: true };
    const near = Object.keys(CATALOG).find((k) => s.startsWith(k + '-'));
    return near ? { key: near, exact: false } : null;
  }
  function modelRecord(id, enabled) {
    const m = matchCatalog(id);
    return { id, canonical: m && m.exact ? m.key : null, suggest: m && !m.exact ? m.key : null, enabled, ov: {} };
  }

  /* ── 状态 ── */
  const PURPOSES = [
    { id: 'chat', label: '会话默认', desc: '新会话一开始用的模型' },
    { id: 'utility', label: '轻量任务', desc: '起标题、写摘要、压缩上下文', follow: 'chat' },
    { id: 'review', label: '自动审批', desc: '判断工具调用能否自动放行', follow: 'utility' },
    { id: 'explore', label: '子 Agent 探索', desc: '读代码、搜资料的子 Agent', follow: 'chat' },
    { id: 'vision', label: '看图', desc: '当前模型看不了图时，由它代看', follow: 'chat', needImage: true },
  ];
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('mpd.' + k); localStorage.setItem('mpd.' + k, v); } catch (_) { return null; } }
  function initialState() {
    return {
      view: 'settings', // 这次只改设置页，对话框不动
      theme: store('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
      notes: store('notes') === '1',
      route: { name: 'list' },
      conns: [
        { id: 'c1', tpl: 'anthropic', name: 'Anthropic', protocol: 'anthropic', baseURL: 'https://api.anthropic.com', key: 'sk-ant-…a91c', mult: 1,
          models: [modelRecord('claude-opus-5-5', true), modelRecord('claude-sonnet-5-5', true), modelRecord('claude-haiku-5-5', true)] },
        { id: 'c2', tpl: 'deepseek', name: 'DeepSeek', protocol: 'openai-chat', baseURL: 'https://api.deepseek.com', key: 'sk-…3f2a', mult: 1,
          models: [modelRecord('deepseek-v4-flash', true), modelRecord('deepseek-v4-pro', true)] },
        { id: 'c3', tpl: 'custom', name: 'code.relay-demo.com', protocol: 'anthropic', baseURL: 'https://code.relay-demo.com', key: 'sk-…77de', mult: 0.6,
          models: [modelRecord('claude-sonnet-5-5', true), modelRecord('glm-5', true), modelRecord('relay-coder-v2', true), modelRecord('claude-sonnet-5-5-20261001', false)] },
      ],
      purposes: {
        chat: { key: 'c1/claude-sonnet-5-5', effort: 'medium' },
        utility: { key: 'c2/deepseek-v4-flash', effort: 'off' },
        review: { key: null, effort: null },
        explore: { key: 'c1/claude-haiku-5-5', effort: 'low' },
        vision: { key: null, effort: null },
      },
      session: { key: 'c1/claude-sonnet-5-5', effort: 'medium', memory: {} },
      draft: null, expanded: null, pk: null, armed: null, keyEdit: null, keyVal: '', testing: null, tested: null,
      manual: null, catQ: '', stepQ: '', ui: {}, flash: null,
    };
  }
  let S = initialState();
  let seq = 4;

  /* ── 生效能力 = 用户覆盖 > 目录 > 未知 ── */
  function scale(p, k) { const r = (x) => (x == null ? null : Math.round(x * k * 1000) / 1000); return { in: r(p.in), out: r(p.out), cr: r(p.cr), cw: r(p.cw) }; }
  function eff(conn, m) {
    const cat = CATALOG[m.canonical] || null;
    const o = m.ov;
    const pick = (k) => (o[k] !== undefined ? { v: o[k], src: 'user' } : cat ? { v: cat[k], src: 'catalog' } : { v: null, src: 'unknown' });
    const price = pick('price');
    const mult = +conn.mult || 1;
    const priceFinal = price.v == null ? null : price.src === 'user' ? price.v : scale(price.v, mult);
    const think = pick('think');
    const input = pick('input');
    return {
      conn, m, id: m.id, key: conn.id + '/' + m.id, name: o.name || (cat ? cat.name : m.id), known: !!cat,
      aliased: !!cat && m.canonical !== m.id && !m.id.endsWith('/' + m.canonical),
      ctx: pick('ctx'), out: pick('out'), input, think, price, priceFinal, mult,
      image: !!(input.v && input.v.includes('image')),
      kind: thinkKind(think.v),
    };
  }
  /** 'unknown' | 'none' | 'toggle'(关+一档) | 'always'(仅一档无关) | 'levels'(可关多档) | 'mandatory'(不可关多档) */
  function thinkKind(t) {
    if (!t) return 'unknown';
    const lv = t.levels || [];
    if (!lv.length) return 'none';
    const hasOff = lv.includes('off'); const on = lv.filter((l) => l !== 'off');
    if (!on.length) return 'none';
    if (hasOff && on.length === 1) return 'toggle';
    if (!hasOff && on.length === 1) return 'always';
    return hasOff ? 'levels' : 'mandatory';
  }
  /** 某个档位在选择器 / 按钮上的叫法。 */
  function levelLabel(e, l) {
    if (l == null) return '';
    if (e.kind === 'toggle') return l === 'off' ? '思考关' : '思考开';
    if (e.kind === 'always' || e.kind === 'none' || e.kind === 'unknown') return '';
    return l === 'off' ? '思考关' : LV[l];
  }
  /** 一句话概括思考能力，例如「低 / 中 / 高，可关闭」。 */
  function thinkSummary(e) {
    switch (e.kind) {
      case 'unknown': return '思考能力未知';
      case 'none': return '不支持思考';
      case 'toggle': return '思考可开关';
      case 'always': return '始终思考';
      default: {
        const on = e.think.v.levels.filter((l) => l !== 'off').map((l) => LV[l]);
        return on.join(' / ') + (e.kind === 'mandatory' ? '，不可关闭' : '，可关闭');
      }
    }
  }
  function findModel(key) {
    if (!key) return null;
    const i = key.indexOf('/'); const cid = key.slice(0, i); const mid = key.slice(i + 1);
    const c = S.conns.find((x) => x.id === cid); if (!c) return null;
    const m = c.models.find((x) => x.id === mid); if (!m || !m.enabled) return null;
    return eff(c, m);
  }
  /** 选择器用：所有启用模型按连接分组，可按用途过滤。 */
  function pickerGroups(ctx, q) {
    const purpose = PURPOSES.find((p) => p.id === ctx);
    q = (q || '').toLowerCase();
    return S.conns.map((c) => ({
      conn: c,
      items: c.models.filter((m) => m.enabled).map((m) => eff(c, m))
        .filter((e) => !(purpose && purpose.needImage) || e.image)
        .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
    })).filter((g) => g.items.length);
  }
  function selOf(ctx) { return ctx === 'composer' ? S.session : S.purposes[ctx]; }
  /** 添加流程第 2 步：把拿到的 id 列表变成 eff 对象（连接还没建，用临时连接算倍率）。 */
  function draftRows() {
    const d = S.draft; const fake = { id: 'draft', mult: +d.mult || 1, tpl: d.tpl, name: '' };
    return d.fetched.map((id) => { const r = modelRecord(id, true); if (d.extra && d.extra[id]) Object.assign(r, d.extra[id]); const e = eff(fake, r); e.picked = d.picked.includes(id); return e; });
  }

  /* ── 格式化 ── */
  const fmtK = (n) => (n == null || n === '' ? '—' : n >= 1000000 ? +(n / 1000000).toFixed(1) + 'M' : Math.round(n / 1000) + 'K');
  const fmt$ = (x) => (x == null || x === '' ? '—' : '$' + +(+x).toFixed(3));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function logo(tplId, size) {
    const t = tplOf(tplId); const s = size || 36;
    const box = `style="width:${s}px;height:${s}px;border-radius:${s >= 30 ? 8 : 6}px"`;
    if (!t || !t.mark) return `<span class="logo" ${box}>${ICON.relay}</span>`;
    if (t.color) return `<span class="logo" ${box}><img src="${MARKS + t.mark}.svg" alt=""></span>`;
    // 单色 mark 用 <img> 而非 CSS mask：file:// 打开时 mask 会被跨域拦掉；深色主题靠 filter 反色
    return `<span class="logo" ${box}><img class="mono" src="${MARKS + t.mark}.svg" alt=""></span>`;
  }
  const ICON = {
    chevR: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
    chevL: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3.5 5.5 8 10 12.5"/></svg>',
    chevD: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 6 8 10.5 12.5 6"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>',
    plus: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M3 8h10"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m3.5 8.5 3 3 6-7"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
    img: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="6" cy="7" r="1.2"/><path d="m3 12 3.5-3 2.5 2 2-1.5L13 12"/></svg>',
    think: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2.5 9.3 6l3.7.4-2.8 2.4.9 3.7L8 10.6l-3.1 1.9.9-3.7L3 6.4 6.7 6z"/></svg>',
    spark: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 2v3M6 9v3M2 7h3M9 7h3M3.5 4.5l1.5 1.5M8.5 9.5 10 11M3.5 9.5 5 8M8.5 4.5 10 3"/><path d="M12.5 10v4M10.5 12h4"/></svg>',
    refresh: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5"/></svg>',
    relay: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1"/></svg>',
    key: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="5.5" cy="10.5" r="2.5"/><path d="m7.3 8.7 5.2-5.2M10.5 5.5l1.5 1.5"/></svg>',
    send: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>',
    more: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>',
  };

  /* ── 交互 ── */
  const conn = (id) => S.conns.find((c) => c.id === id);
  const mdl = (d) => { const c = conn(d.c); return { c, m: c && c.models.find((m) => m.id === d.m) }; };
  function curThink(c, m) { const t = eff(c, m).think.v; return t ? { levels: [...t.levels], def: t.def } : { levels: [], def: null }; }
  function defaultEffort(key) { const e = findModel(key); if (!e || ['unknown', 'none', 'always'].includes(e.kind)) return null; return e.think.v.def || e.think.v.levels[0]; }
  function setSel(ctx, key, effort) {
    if (ctx === 'composer') { S.session.key = key; S.session.effort = effort; if (key) S.session.memory[key] = effort; }
    else S.purposes[ctx] = { key, effort };
  }
  function emptyManualFields() { return { name: '', ctx: '', out: '', image: false, levels: [], def: null, price: { in: '', out: '', cr: '', cw: '' } }; }
  function fieldsFromCatalog(k) {
    const c = CATALOG[k];
    return { name: c.name, ctx: c.ctx, out: c.out, image: c.input.includes('image'), levels: [...c.think.levels], def: c.think.def || null, price: { ...c.price } };
  }
  function host(url) { try { return new URL(url).host; } catch (_) { return url; } }

  const ACT = {
    noop: () => {},
    view: (d) => { S.view = d.v; S.pk = null; store('view', d.v); },
    theme: (d) => { S.theme = d.v; store('theme', d.v); },
    notes: () => { S.notes = !S.notes; store('notes', S.notes ? '1' : '0'); },
    reset: () => { const keep = { theme: S.theme, view: S.view, notes: S.notes }; S = Object.assign(initialState(), keep); toast('已重置'); },
    ui: (d) => { S.ui[d.k] = S.ui[d.k] === d.v ? null : d.v; },
    go: (d) => { S.route = { name: d.r }; S.expanded = null; S.armed = null; S.catQ = ''; S.pk = null; },
    openConn: (d) => { S.route = { name: 'detail', c: d.c }; S.expanded = null; S.armed = null; S.tested = null; S.keyEdit = null; },
    pickTpl: (d) => {
      const t = tplOf(d.t);
      const exists = t.id !== 'custom' && S.conns.find((c) => c.tpl === t.id);
      if (exists) { ACT.openConn({ c: exists.id }); return; }
      S.draft = { tpl: t.id, protocol: t.protocol || 'anthropic', baseURL: t.baseURL, key: '', proxy: '', adv: false, busy: false, err: null, fetched: [], picked: [], mult: t.id === 'custom' ? '0.6' : '1', fallback: false };
      S.route = { name: 'setup' };
    },
    draftProto: (d) => { S.draft.protocol = d.p; },
    draftAdv: () => { S.draft.adv = !S.draft.adv; },
    testFetch: () => {
      const d = S.draft; const t = tplOf(d.tpl); d.err = null;
      if (t.id === 'custom' && !d.baseURL.trim()) { d.err = '先填服务地址'; return; }
      if (!d.key.trim()) { d.err = '先填 API Key'; return; }
      d.busy = true;
      setTimeout(() => {
        d.busy = false;
        if (d.key.trim() === 'bad') { d.err = '鉴权失败：服务返回 401，检查一下 Key 是否正确'; render(); return; }
        d.fallback = d.key.includes('nolist');
        d.fetched = d.fallback ? (t.id === 'custom' ? [] : t.models.filter((id) => matchCatalog(id))) : [...t.models];
        d.picked = d.fetched.filter((id) => { const m = matchCatalog(id); return m && m.exact && CATALOG[m.key].rec; });
        S.stepQ = ''; S.route = { name: 'select' }; render();
      }, 800);
    },
    backSetup: () => { S.route = { name: 'setup' }; },
    draftPick: (d) => { const p = S.draft.picked; const i = p.indexOf(d.id); i >= 0 ? p.splice(i, 1) : p.push(d.id); },
    draftAll: () => { S.draft.picked = [...S.draft.fetched]; },
    draftNone: () => { S.draft.picked = []; },
    saveConn: () => {
      const d = S.draft; const t = tplOf(d.tpl);
      const c = { id: 'c' + seq++, tpl: t.id, name: t.id === 'custom' ? host(d.baseURL) : t.name, protocol: d.protocol, baseURL: d.baseURL,
        key: d.key.length > 6 ? d.key.slice(0, 3) + '…' + d.key.slice(-4) : '••••', mult: +d.mult || 1,
        models: d.fetched.map((id) => { const r = modelRecord(id, d.picked.includes(id)); if (d.extra && d.extra[id]) Object.assign(r, d.extra[id]); return r; }) };
      S.conns.push(c); S.draft = null; S.route = { name: 'detail', c: c.id };
      toast(`已添加 ${esc(c.name)}，启用 ${c.models.filter((m) => m.enabled).length} 个模型`);
    },
    toggleModel: (d) => { const { m } = mdl(d); m.enabled = !m.enabled; },
    expand: (d) => { const k = d.c + '/' + d.m; S.expanded = S.expanded === k ? null : k; },
    lvToggle: (d) => {
      const { c, m } = mdl(d); const t = curThink(c, m);
      t.levels = t.levels.includes(d.l) ? t.levels.filter((l) => l !== d.l) : LEVELS.filter((l) => l === d.l || t.levels.includes(l));
      if (!t.levels.includes(t.def)) t.def = t.levels.find((l) => l !== 'off') || t.levels[0] || null;
      m.ov.think = t;
    },
    lvDef: (d) => { const { c, m } = mdl(d); const t = curThink(c, m); t.def = d.l; m.ov.think = t; },
    imgToggle: (d) => { const { c, m } = mdl(d); m.ov.input = eff(c, m).image ? ['text'] : ['text', 'image']; },
    priceManual: (d) => { const { c, m } = mdl(d); if (m.ov.price) delete m.ov.price; else m.ov.price = { ...(eff(c, m).priceFinal || { in: null, out: null, cr: null, cw: null }) }; },
    useCanon: (d) => { const { m } = mdl(d); m.canonical = d.k; m.suggest = null; m.ov = {}; toast(`已沿用 ${CATALOG[d.k].name} 的能力和价格`); },
    dropCanon: (d) => { const { m } = mdl(d); m.suggest = m.canonical; m.canonical = null; },
    resetModel: (d) => { const { m } = mdl(d); m.ov = {}; },
    removeModel: (d) => { const { c } = mdl(d); c.models = c.models.filter((m) => m.id !== d.m); S.expanded = null; },
    keyEdit: (d) => { S.keyEdit = S.keyEdit === d.c ? null : d.c; S.keyVal = ''; },
    keySave: (d) => { const v = S.keyVal.trim(); if (v) conn(d.c).key = v.length > 6 ? v.slice(0, 3) + '…' + v.slice(-4) : '••••'; S.keyEdit = null; toast('Key 已更换'); },
    connTest: (d) => { S.testing = d.c; S.tested = null; setTimeout(() => { S.testing = null; S.tested = d.c; render(); }, 700); },
    connProto: (d) => { conn(d.c).protocol = d.p; },
    refetch: () => toast('已重新获取：没有新模型'),
    delConn: (d) => {
      if (S.armed !== d.c) { S.armed = d.c; return; }
      const c = conn(d.c); S.conns = S.conns.filter((x) => x.id !== d.c); S.armed = null; S.route = { name: 'list' };
      if (S.session.key && S.session.key.startsWith(d.c + '/')) S.session.key = null;
      toast(`已删除 ${esc(c.name)}`);
    },

    /* 手动添加：先填 ID，命中目录就把其他项自动带出来 */
    openManual: (d) => { S.manual = { target: d.target, id: '', matched: null, near: null, canon: null, f: emptyManualFields(), src: null, more: false, test: null, err: null }; },
    manualClose: () => { S.manual = null; },
    manualCanon: (d) => { const M = S.manual; if (!d.k) { M.canon = null; M.f = emptyManualFields(); M.src = null; return; } M.canon = d.k; M.f = fieldsFromCatalog(d.k); M.src = 'canon'; S.flash = Date.now(); },
    manualLevel: (d) => { const f = S.manual.f; f.levels = f.levels.includes(d.l) ? f.levels.filter((l) => l !== d.l) : LEVELS.filter((l) => l === d.l || f.levels.includes(l)); if (!f.levels.includes(f.def)) f.def = f.levels.find((l) => l !== 'off') || f.levels[0] || null; },
    manualDef: (d) => { S.manual.f.def = d.l; },
    manualImage: () => { S.manual.f.image = !S.manual.f.image; },
    manualMore: () => { S.manual.more = !S.manual.more; },
    manualTest: () => {
      const M = S.manual; if (!M.id.trim()) { M.err = '先填模型 ID'; return; }
      M.test = 'busy'; M.err = null;
      setTimeout(() => { if (!S.manual) return; const bad = /typo|xx/.test(M.id); M.test = bad ? 'err' : 'ok'; M.err = bad ? '服务返回 404：模型不存在，检查一下 ID' : null; render(); }, 700);
    },
    manualSave: () => {
      const M = S.manual; const id = M.id.trim(); if (!id) { M.err = '先填模型 ID'; return; }
      const canonical = M.matched || M.canon || null;
      const base = canonical ? fieldsFromCatalog(canonical) : null; const f = M.f; const ov = {};
      const num = (v) => (v === '' || v == null ? undefined : +v);
      if (!base || f.name !== base.name) { if (f.name && f.name !== id) ov.name = f.name; }
      if (num(f.ctx) !== undefined && (!base || +f.ctx !== base.ctx)) ov.ctx = +f.ctx;
      if (num(f.out) !== undefined && (!base || +f.out !== base.out)) ov.out = +f.out;
      if (!base ? f.image : f.image !== base.image) ov.input = f.image ? ['text', 'image'] : ['text'];
      if (!base ? f.levels.length : (f.levels.join() !== base.levels.join() || f.def !== base.def)) ov.think = { levels: [...f.levels], def: f.def };
      const p = f.price; const hasP = ['in', 'out', 'cr', 'cw'].some((k) => p[k] !== '' && p[k] != null);
      if (hasP && (!base || ['in', 'out', 'cr', 'cw'].some((k) => num(p[k]) !== (base.price[k] ?? undefined)))) ov.price = { in: num(p.in) ?? null, out: num(p.out) ?? null, cr: num(p.cr) ?? null, cw: num(p.cw) ?? null };
      const rec = { id, canonical, suggest: null, enabled: true, ov };
      if (M.target === 'draft') {
        const d = S.draft; if (!d.fetched.includes(id)) d.fetched.push(id); if (!d.picked.includes(id)) d.picked.push(id);
        d.extra = d.extra || {}; d.extra[id] = { canonical, ov };
      } else {
        const c = conn(M.target); c.models = c.models.filter((m) => m.id !== id); c.models.unshift(rec);
      }
      S.manual = null; toast(`已添加 ${esc(ov.name || (canonical ? CATALOG[canonical].name : id))}`);
    },

    /* 选择器 */
    openPicker: (d) => {
      if (S.pk && S.pk.ctx === d.ctx) { S.pk = null; return; }
      const sel = selOf(d.ctx); const g = pickerGroups(d.ctx, '');
      S.pk = { ctx: d.ctx, q: '', focus: findModel(sel.key) ? sel.key : g[0] && g[0].items[0].key };
    },
    pkModel: (d) => {
      const ctx = S.pk.ctx; S.pk.focus = d.k; const sel = selOf(ctx);
      if (sel.key === d.k) return;
      const mem = ctx === 'composer' ? S.session.memory[d.k] : undefined;
      const lv = mem !== undefined ? mem : defaultEffort(d.k);
      setSel(ctx, d.k, lv);
      if (S.pk.closeOnModel) S.pk = null;
    },
    pkLevel: (d) => { setSel(S.pk.ctx, S.pk.focus, d.l); S.pk = null; },
    pkFollow: () => { setSel(S.pk.ctx, null, null); S.pk = null; },
    setDefault: () => { S.purposes.chat = { key: S.session.key, effort: S.session.effort }; toast('已设为新会话默认'); },
    gotoModel: (d) => { const i = d.k.indexOf('/'); const cid = d.k.slice(0, i); S.pk = null; S.view = 'settings'; store('view', 'settings'); S.route = { name: 'detail', c: cid }; S.expanded = d.k; },
  };

  const numSkip = (v, n) => (String(n) === v.trim() ? undefined : 'skip');
  const INPUT = {
    catQ: (v) => { S.catQ = v; },
    draftKey: (v) => { S.draft.key = v; S.draft.err = null; },
    draftURL: (v) => { S.draft.baseURL = v; },
    draftProxy: (v) => { S.draft.proxy = v; },
    draftMult: (v) => { S.draft.mult = v; },
    stepQ: (v) => { S.stepQ = v; },
    pkQ: (v) => { S.pk.q = v; },
    connName: (v, d) => { conn(d.c).name = v; },
    connURL: (v, d) => { conn(d.c).baseURL = v; },
    mDefSel: (v, d) => { ACT.lvDef({ c: d.c, m: d.m, l: v }); },
    manualDefSel: (v) => { ACT.manualDef({ l: v }); },
    connProtoSel: (v, d) => { ACT.connProto({ c: d.c, p: v }); },
    connMult: (v, d) => { const n = parseFloat(v); if (n > 0) conn(d.c).mult = n; return numSkip(v, n); },
    keyVal: (v) => { S.keyVal = v; return 'skip'; },
    mName: (v, d) => { const { m } = mdl(d); if (v.trim()) m.ov.name = v; else delete m.ov.name; },
    mCtx: (v, d) => { const { m } = mdl(d); const n = parseInt(v, 10); if (n > 0) m.ov.ctx = n; else delete m.ov.ctx; return numSkip(v, n); },
    mOut: (v, d) => { const { m } = mdl(d); const n = parseInt(v, 10); if (n > 0) m.ov.out = n; else delete m.ov.out; return numSkip(v, n); },
    mPrice: (v, d) => { const { c, m } = mdl(d); if (!m.ov.price) m.ov.price = { ...(eff(c, m).priceFinal || { in: null, out: null, cr: null, cw: null }) }; const n = parseFloat(v); m.ov.price[d.k] = isNaN(n) ? null : n; return numSkip(v, n); },
    manualId: (v) => {
      const M = S.manual; M.id = v; M.test = null; M.err = null;
      const hit = matchCatalog(v.trim());
      const prev = M.matched;
      if (hit && hit.exact) { M.matched = hit.key; M.near = null; M.canon = null; if (prev !== hit.key) { M.f = fieldsFromCatalog(hit.key); M.src = 'catalog'; S.flash = Date.now(); } }
      else { M.matched = null; M.near = hit ? hit.key : null; if (prev || M.src === 'catalog') { M.f = emptyManualFields(); M.src = null; } }
    },
    manualCanon: (v) => { ACT.manualCanon({ k: v }); },
    mCanon: (v, d) => { if (v) ACT.useCanon({ c: d.c, m: d.m, k: v }); },
    manualName: (v) => { S.manual.f.name = v; return 'skip'; },
    manualCtx: (v) => { S.manual.f.ctx = v; return 'skip'; },
    manualOut: (v) => { S.manual.f.out = v; return 'skip'; },
    manualPrice: (v, d) => { S.manual.f.price[d.k] = v; return 'skip'; },
  };

  /* ── 渲染 ── */
  const NAV = [
    ['偏好', [['通用', 'M3 5h10M3 11h10M6 3v4M10 9v4'], ['外观', 'M8 3v1M8 12v1M3 8h1M12 8h1M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z']]],
    ['能力', [['远端 Host', 'M3 4h10v3H3zM3 9h10v3H3z'], ['模型', 'M5 5h6v6H5zM7 2v2M9 2v2M7 12v2M9 12v2M2 7h2M2 9h2M12 7h2M12 9h2', true], ['搜索', 'M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l3 3'], ['工具', 'M10 3a3 3 0 0 0-2.8 4L3 11.2 4.8 13 9 8.8A3 3 0 0 0 13 6l-2 .5-1.5-1.5z'], ['子 Agent', 'M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 13a3.5 3.5 0 0 1 7 0M11 7a1.7 1.7 0 1 0 0-3.4M12 13a3 3 0 0 0-1.5-2.6']]],
    ['活动', [['使用统计', 'M4 12V8M8 12V4M12 12V7'], ['归档会话', 'M3 4h10v3H3zM4 7v6h8V7M6.5 9.5h3']]],
    ['系统', [['更新', 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5']]],
  ];
  function settingsSide() {
    return `<aside class="shell-side"><div class="shell-back">${ICON.chevL} 返回应用</div>` + NAV.map(([sec, items]) => `<div class="shell-sec">${sec}</div>` + items.map(([n, d, on]) =>
      `<button class="shell-item ${on ? 'on' : ''}" ${on ? 'data-act="go" data-r="list"' : ''}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">${d.split('M').filter(Boolean).map((p) => `<path d="M${p}"/>`).join('')}</svg>${n}</button>`).join('')).join('') + '</aside>';
  }
  function chatSide() {
    const rows = ['模型配置梳理', '侧栏改版：拖拽排序', 'Composer 队列边界', '上下文压缩时间线'];
    return `<aside class="shell-side" style="padding-top:20px"><button class="shell-item">${ICON.plus} 新建会话</button><div class="shell-sec" style="margin-top:12px">actspace-demo</div>` +
      rows.map((r, i) => `<button class="shell-item ${i === 0 ? 'on' : ''}" style="padding-left:26px">${r}</button>`).join('') +
      `<span class="grow"></span><button class="shell-item" data-act="view" data-v="settings" style="margin-top:auto"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4"/></svg>设置</button></aside>`;
  }
  function chatView() {
    const e = findModel(S.session.key);
    return chatSide() + `<main class="chat"><div class="chat-scroll"><div class="chat-col">
        <div class="msg-u">帮我看下设置页的模型配置为什么这么乱</div>
        <div class="msg-a">主要是三套「服务商」概念并存：内置的三个 ProviderId、展示用的目录、用户自建的连接，互相打补丁……<span class="faint">（示意对话 · ${e ? esc(e.name) : '未选模型'}）</span></div>
      </div></div><div class="composer-wrap">${window.View.composer(S)}</div></main>`;
  }

  const NOTES = {
    list: ['模型页 = 用途 + 连接', ['「用途」一张表收齐：会话默认、轻量任务、自动审批、子 Agent 探索、看图。没设的跟随上一级。', '所有连接同一种卡片，DeepSeek / Kimi / OpenRouter 不再特殊。', '试试：点一个用途换模型和档位；点「添加连接」走一遍。']],
    catalog: ['选供应商', ['官方的地址固定，只要 Key；已添加的官方点进去是详情页。', '「自定义中转」放最后，进去选协议。']],
    setup: ['第 1 步', ['Key 随便填（比如 <code>1</code>）就能过。', '想看失败：Key 填 <code>bad</code>。想看没有 /models：Key 里带 <code>nolist</code>。']],
    select: ['第 2 步：/models ∩ 模型目录', ['拿到的每个 id 去目录里匹配，命中的自动带上下文、思考档位、价格；没命中的标「能力未知」，照样能启用。', '「添加模型」就地展开：先填 ID，命中目录就只给一句概括，不用再填别的。']],
    detail: ['连接详情', ['所有连接同一个页面：连接 / 模型 / 计费 / 删除。', '模型只列名称和开关。点开：目录命中的只给一句概括 + 默认思考档位，要改再点「调整能力和价格」；没命中的直接展开字段。', '添加模型：试试 <code>glm-5</code>（命中，自动填好）、<code>my-claude</code>（未命中，可沿用）、<code>typo-model</code>（测试失败）。']],
  };
  function demoCtl() {
    const n = NOTES[S.route.name];
    return `<div class="demo-ctl"><span class="seg"><button data-act="theme" data-v="light" aria-pressed="${S.theme === 'light'}">浅</button><button data-act="theme" data-v="dark" aria-pressed="${S.theme === 'dark'}">深</button></span>
      <button class="btn ghost sm" data-act="notes">${S.notes ? '收起说明' : '说明'}</button><button class="btn ghost sm" data-act="reset">重置</button></div>` +
      (S.notes && n ? `<div class="demo-notes"><h3>${window.View.name || ''} · ${n[0]}</h3><ul>${n[1].map((x) => `<li>${x}</li>`).join('')}</ul>${window.View.about ? `<p style="margin:10px 0 0">${window.View.about}</p>` : ''}</div>` : '');
  }

  const $app = document.getElementById('app');
  const $ctl = document.getElementById('ctl');
  let lastFlash = 0;
  function render() {
    const a = document.activeElement; const f = a && a.dataset ? a.dataset.f : null;
    let sel = null; try { sel = f ? [a.selectionStart, a.selectionEnd] : null; } catch (_) {}
    const scroller = document.querySelector('.shell-main'); const top = scroller ? scroller.scrollTop : 0;
    document.documentElement.dataset.theme = S.theme;
    $app.innerHTML = S.view === 'composer' ? chatView()
      : settingsSide() + `<main class="shell-main">${window.View.page(S)}</main>`;
    $app.insertAdjacentHTML('beforeend', window.View.overlay ? window.View.overlay(S) : '');
    $ctl.innerHTML = demoCtl();
    const sc = document.querySelector('.shell-main'); if (sc && sameRoute) sc.scrollTop = top;
    if (f) { const el = document.querySelector(`[data-f="${f}"]`); if (el) { el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch (_) {} } }
    if (S.flash && S.flash !== lastFlash) { lastFlash = S.flash; document.querySelectorAll('.js-fill').forEach((el) => { el.classList.remove('fill-flash'); void el.offsetWidth; el.classList.add('fill-flash'); }); }
  }
  let sameRoute = true; let lastRouteKey = '';
  function routeKey() { return S.view + ':' + S.route.name + ':' + (S.route.c || ''); }
  let toastTimer;
  function toast(msg) { const el = document.getElementById('toast'); el.innerHTML = `<div class="toast">${msg}</div>`; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.innerHTML = ''), 2400); }
  function rerender() { const k = routeKey(); sameRoute = k === lastRouteKey; render(); lastRouteKey = k; }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (S.pk && !ev.target.closest('.js-picker') && !(t && t.dataset.act === 'openPicker')) { S.pk = null; if (!t) { rerender(); return; } }
    if (!t) return;
    const fn = ACT[t.dataset.act]; if (!fn) return;
    ev.preventDefault();
    fn(t.dataset, t, ev); rerender();
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!t.dataset || !t.dataset.in || !INPUT[t.dataset.in]) return;
    if (INPUT[t.dataset.in](t.value, t.dataset) !== 'skip') rerender();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && (S.pk || S.manual)) { S.pk = null; S.manual = null; rerender(); } });

  window.Demo = {
    get S() { return S; }, LEVELS, LV, PROTO, TEMPLATES, CATALOG, PURPOSES, ICON,
    tplOf, matchCatalog, eff, findModel, thinkKind, levelLabel, thinkSummary, pickerGroups, selOf, draftRows,
    fmtK, fmt$, esc, logo, host, render: rerender, toast,
  };
  /* 截图回放：#play=openConn:c=c3|expand:c=c3&m=glm-5|in.manualId:glm-5|wait:900|ui:k=tab&v=x
   * 步骤用 | 分隔；in.xxx 走 INPUT，wait 等待毫秒（配合 --virtual-time-budget），其余走 ACT。 */
  async function play(spec) {
    for (const step of spec.split('|')) {
      const i = step.indexOf(':'); const name = i < 0 ? step : step.slice(0, i); const arg = i < 0 ? '' : decodeURIComponent(step.slice(i + 1));
      if (name === 'wait') { await new Promise((r) => setTimeout(r, +arg || 300)); continue; }
      if (name.startsWith('in.')) INPUT[name.slice(3)](arg, {});
      else if (ACT[name]) ACT[name](Object.fromEntries(new URLSearchParams(arg)));
      rerender();
    }
  }
  window.addEventListener('DOMContentLoaded', () => {
    rerender();
    const m = location.hash.match(/^#play=(.*)$/); if (m) play(m[1]);
  });
})();
