import type screenshots from './screenshots.json';
interface Feature { id: string; label: string; title: string; description: string; points: string[]; href: string; image: keyof typeof screenshots; imageTitle: string; }
export const homeFeatures: Feature[] = [
  { id:'context', label:'上下文', title:'看清模型正在使用的上下文', description:'让每一次回答都有可检查的依据。打开当前请求，了解模型看到了什么，以及哪些信息占用了空间。', points:['按系统、工具与消息查看内容','区分当前上下文和累计 Token','长任务中按需压缩，保留原始记录'], href:'/docs/context/', image:'context-detail.png', imageTitle:'当前请求的上下文与内容分组' },
  { id:'execution', label:'工具执行', title:'从读取项目，到修改与验证', description:'把目标交给 Agent，在同一个会话里跟进文件读取、修改和命令执行，直到拿到可检查的结果。', points:['读取与检索工作区文件','查看文件生成进度与实际改动','检查命令输出，在需要时批准操作'], href:'/docs/files-and-search/', image:'tool-execution.png', imageTitle:'文件修改与测试的执行过程' },
  { id:'review', label:'Review', title:'每一处改动，都可以审阅', description:'对话旁就是实际的文件差异。先看清 Agent 做了什么，再决定哪些改动值得保留。', points:['切换本轮、未提交与分支等范围','逐文件检查增加和删除','在工作台中完成后续 Git 操作'], href:'/docs/review/', image:'review-diff.png', imageTitle:'对话旁的 Review 文件差异' },
  { id:'skills', label:'Skills', title:'把常用方法带进下一项任务', description:'把可复用的工作方法放进 Skill。选好项目、任务和 Skill，让熟悉的流程继续发挥作用。', points:['在扩展页安装与管理 Skills','在输入框选用适合任务的方法','结合项目规则，保持工作约定一致'], href:'/docs/skills/', image:'skill-invocation.png', imageTitle:'选择 Skill 并准备任务' },
  { id:'subagents', label:'子 Agent', title:'把资料检索交给子 Agent', description:'把需要独立探索的问题拆出去。主会话保留任务全貌，右侧随时查看子任务的活动与发现。', points:['只读地读取文件与搜索项目','跟进正在读取、搜索和整理的状态','打开独立详情，检查结果和失败原因'], href:'/docs/subagents/', image:'subagent-running.png', imageTitle:'只读子任务与实时活动详情' },
  { id:'trajectory', label:'会话轨迹', title:'回到每一次请求与工具调用', description:'从聊天切换到 Trajectory，沿时间线检查执行记录。遇到问题时，找到对应的请求、参数与结果。', points:['搜索并定位会话中的执行记录','检查工具参数和返回结果','保留聊天草稿，随时切回任务'], href:'/docs/agent-turn/', image:'trajectory-inspector.png', imageTitle:'会话时间线与工具结果详情' },
];
export const moreCapabilities = [
  ['多模型与推理设置','连接服务商，按任务选择模型与思考强度。','model-selection'],
  ['工作区与 Worktree','把任务绑定到项目目录与合适的分支。','workspaces'],
  ['文件预览','在对话旁查看 Markdown、HTML 与图片。','file-preview'],
  ['交互式终端','在当前工作区运行命令、构建与测试。','terminal'],
  ['联网与 Browser Use','搜索资料、读取网页，接入浏览器能力。','browser'],
  ['图片理解与生成','把图片带入任务，查看生成的实际产物。','images'],
  ['使用统计','查看请求、Token、缓存与费用记录。','usage'],
  ['英语辅助学习','在选定会话中练习英中阅读与英文听力。','english-learning'],
];
