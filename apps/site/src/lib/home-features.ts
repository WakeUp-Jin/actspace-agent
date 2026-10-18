// 首页 V4 文案数据。首屏插件与任务演示在 components/home/Hero.astro 里，这里只放可复用的列表。
export interface Capability { title: string; description: string; slug: string; }
export interface Direction { id: string; status: 'live' | 'wip'; name: string; summary: string; done: string; next: string; }

export const statusLabel = { live: '已上线', wip: '进行中' } as const;

// 「现状」：今天就能用的 Coding Agent 能力，每项链到对应文档。
export const todayCapabilities: Capability[] = [
  { title: '读取与检索', description: '按需读取文件、搜索代码，先弄清项目再动手。', slug: 'files-and-search' },
  { title: '编辑与 Review', description: '改动直接写进文件，逐个检查差异再决定保留。', slug: 'review' },
  { title: '终端', description: '在当前项目里运行命令、构建与测试，输出回到对话。', slug: 'terminal' },
  { title: '审批策略', description: '决定哪些操作直接执行，哪些先问你。', slug: 'tools-and-approvals' },
  { title: 'Skills', description: '把常用的工作方法装进 Skill，带进下一项任务。', slug: 'skills' },
  { title: '子 Agent', description: '把独立的检索拆给子 Agent，主会话保留全貌。', slug: 'subagents' },
  { title: '模型与推理', description: '连接自己的服务商，按任务选模型与思考强度。', slug: 'model-selection' },
  { title: 'Browser Use', description: '需要浏览器的任务，打开网页、点击与截图。', slug: 'browser' },
];

// 「方向」：三段路线图，状态以产品概念文档和用户确认为准。首页方向条和开发计划页共用；
// done / next 只在开发计划页展示，须与 docs/roadmap.md 的条目对得上。
export const directions: Direction[] = [
  { id: 'context', status: 'live', name: '上下文管理引擎', summary: '长任务压缩与可检查的上下文。', done: '插件化上下文、结构化压缩、渐进披露与上下文面板', next: 'Agent 记忆模块' },
  { id: 'harness', status: 'wip', name: 'Harness 自进化', summary: '工具、上下文与行为都是插件，可以按问题派生新版本。', done: 'V1：在会话里让 Agent 新增或修改工具', next: 'V2：失败触发派生新版本，沙箱评估后由你决定' },
  { id: 'space', status: 'wip', name: 'Actor 与 Space', summary: '在场景里长成的 Actor，在 Space 里一起解决专业问题。', done: '前端演示：Space、Actor 名册与协调 Agent', next: '多 Actor 协作运行时' },
];

// 真实界面功能块（components/home/FeatureShot.astro）：左边说明，右边截图。
// 每个要点对应截图里的一块区域，rect 是相对整张图的 [左, 上, 宽, 高]（0–1）。
export interface FocusPoint { title: string; detail: string; rect: [number, number, number, number]; }

export const deliverablePoints: FocusPoint[] = [
  { title: '本轮改动', detail: '改了哪些文件、各加减几行，点开看差异。', rect: [0.065, 0.18, 0.87, 0.285] },
  { title: '交付文件', detail: '报告、表格、幻灯片单独列出，可预览或用本机应用打开。', rect: [0.065, 0.462, 0.87, 0.135] },
  { title: '本轮用量', detail: '每轮花了多少 token、多少钱。', rect: [0.065, 0.95, 0.34, 0.042] },
];

export const trajectoryPoints: FocusPoint[] = [
  { title: '时间线', detail: '输入、模型、工具按轮次排开，慢在哪一步一眼看出。', rect: [0, 0.05, 0.55, 0.115] },
  { title: '调用与结果', detail: '参数和返回并排列出，不用逐个展开。', rect: [0, 0.2, 0.72, 0.4] },
  { title: '失败与停止', detail: '报错、重试、停止和压缩，都按发生顺序记着。', rect: [0, 0.595, 0.62, 0.36] },
];

export const approvalPoints: FocusPoint[] = [
  { title: '确认后才执行', detail: '命令原样列出，标明在沙盒还是真实环境里跑。', rect: [0.05, 0.255, 0.89, 0.26] },
  { title: '按命令放行', detail: '同类命令可在本会话放行，换个会话重新问。', rect: [0.645, 0.425, 0.29, 0.08] },
  { title: '权限模式', detail: '「完全权限」不再逐条确认，硬性安全检查照旧生效。', rect: [0.125, 0.72, 0.205, 0.245] },
];

export const contextPoints: FocusPoint[] = [
  { title: '每次请求带了什么', detail: '按系统提示词、工具、规则、Skills 和会话拆开。', rect: [0.02, 0.325, 0.96, 0.27] },
  { title: '结构化压缩', detail: '快到上限时，旧历史收成摘要，目标和没做完的事都留下。', rect: [0.02, 0.6, 0.96, 0.165] },
  { title: '渐进披露', detail: 'Skill、规则和文件用到时才放进来。', rect: [0.02, 0.77, 0.96, 0.19] },
];

export const spacePoints: FocusPoint[] = [
  { title: 'Actor 名册', detail: '谁在工作、谁等你拍板、谁交了结果。', rect: [0.7, 0.055, 0.3, 0.48] },
  { title: '协调 Agent 分派', detail: '你说要什么，它交给合适的 Actor，没有就新起一位。', rect: [0.022, 0.15, 0.655, 0.355] },
  { title: '留下有用的', detail: '临时 Actor 做完问你要不要留下，约定记进记忆。', rect: [0.022, 0.52, 0.655, 0.16] },
];

export const harnessPoints = [
  '工具、上下文与行为都是插件',
  '现在：在会话里新增或修改工具，下一条消息生效',
  '接下来：失败时派生新版本，沙箱评估后由你决定',
];
