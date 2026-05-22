/**
 * 评估器架构模式
 *
 * 展示如何构建一个结构化的 Agent 评估器：
 * 类型体系 → EventBus 事件驱动采集 → evaluate 对比函数 → 运行器串联
 *
 * 将类型定义、事件系统、评估函数、Agent 采集器合并为一个完整骨架
 */

import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════
// 第一部分：类型体系
// ═══════════════════════════════════════════════════════

interface TestCase {
  id: string;
  description: string;
  input: string;
  expected: ExpectedBehavior;
}

interface ExpectedBehavior {
  agents: string[];
  tools: Record<string, string[]>;
}

interface CollectedData {
  agents: string[];
  tools: Record<string, string[]>;
}

interface EvaluateResult {
  passed: boolean;
  agentMatch: boolean;
  toolMatch: boolean;
  details: {
    agents: { expected: string[]; actual: string[]; missed: string[]; extra: string[] };
    tools: {
      expected: Record<string, string[]>;
      actual: Record<string, string[]>;
      missed: Array<{ agent: string; tool: string }>;
      extra: Array<{ agent: string; tool: string }>;
    };
  };
}

// ═══════════════════════════════════════════════════════
// 第二部分：EventBus — 事件驱动的行为采集
// ═══════════════════════════════════════════════════════

type EventType = 'agent:call' | 'tool:call';

class EventBus {
  private emitter = new EventEmitter();
  private static instance: EventBus;

  private agentList: string[] = [];
  private toolMap: Map<string, string[]> = new Map();

  static getInstance(): EventBus {
    if (!this.instance) this.instance = new EventBus();
    return this.instance;
  }

  constructor() {
    this.emitter.on('agent:call', (data: { agentName: string }) => {
      this.agentList.push(data.agentName);
      if (!this.toolMap.has(data.agentName)) {
        this.toolMap.set(data.agentName, []);
      }
    });

    this.emitter.on('tool:call', (data: { agentName: string; toolName: string }) => {
      const tools = this.toolMap.get(data.agentName) || [];
      if (!tools.includes(data.toolName)) {
        tools.push(data.toolName);
        this.toolMap.set(data.agentName, tools);
      }
    });
  }

  emit(event: EventType, data: Record<string, any>) {
    this.emitter.emit(event, data);
  }

  getData(): CollectedData {
    return {
      agents: [...new Set(this.agentList)],
      tools: Object.fromEntries(this.toolMap),
    };
  }

  reset() {
    this.agentList = [];
    this.toolMap = new Map();
  }
}

const eventBus = EventBus.getInstance();

// ═══════════════════════════════════════════════════════
// 第三部分：Agent 中嵌入事件采集（示意）
// ═══════════════════════════════════════════════════════

async function agentWithCollection(input: string): Promise<string> {
  const AGENT_NAME = 'simple_agent';

  eventBus.emit('agent:call', { agentName: AGENT_NAME });

  // ... Agent 执行逻辑 ...
  // 每次工具调用前触发事件：
  // eventBus.emit('tool:call', { agentName: AGENT_NAME, toolName: 'get_weather' });

  return '模拟的 Agent 响应';
}

// ═══════════════════════════════════════════════════════
// 第四部分：评估函数
// ═══════════════════════════════════════════════════════

function evaluate(testCase: TestCase, actual: CollectedData): EvaluateResult {
  const expected = testCase.expected;

  const missedAgents = expected.agents.filter((a) => !actual.agents.includes(a));
  const extraAgents = actual.agents.filter((a) => !expected.agents.includes(a));
  const agentMatch = missedAgents.length === 0 && extraAgents.length === 0;

  const missedTools: Array<{ agent: string; tool: string }> = [];
  const extraTools: Array<{ agent: string; tool: string }> = [];

  for (const [agent, tools] of Object.entries(expected.tools)) {
    const actualTools = actual.tools[agent] || [];
    for (const tool of tools) {
      if (!actualTools.includes(tool)) missedTools.push({ agent, tool });
    }
  }

  for (const [agent, tools] of Object.entries(actual.tools)) {
    const expectedTools = expected.tools[agent] || [];
    for (const tool of tools) {
      if (!expectedTools.includes(tool)) extraTools.push({ agent, tool });
    }
  }

  const toolMatch = missedTools.length === 0 && extraTools.length === 0;

  return {
    passed: agentMatch && toolMatch,
    agentMatch,
    toolMatch,
    details: {
      agents: { expected: expected.agents, actual: actual.agents, missed: missedAgents, extra: extraAgents },
      tools: { expected: expected.tools, actual: actual.tools, missed: missedTools, extra: extraTools },
    },
  };
}

// ═══════════════════════════════════════════════════════
// 第五部分：运行器 — 串联完整评估流程
// ═══════════════════════════════════════════════════════

const TEST_CASES: TestCase[] = [
  {
    id: 'T1',
    description: '单工具调用 - 天气查询',
    input: '北京今天天气怎么样？',
    expected: {
      agents: ['simple_agent'],
      tools: { simple_agent: ['get_weather'] },
    },
  },
  {
    id: 'T2',
    description: '单工具调用 - 翻译',
    input: '把"你好世界"翻译成英文',
    expected: {
      agents: ['simple_agent'],
      tools: { simple_agent: ['translate'] },
    },
  },
];

async function runEvaluation() {
  let passed = 0;

  for (const testCase of TEST_CASES) {
    eventBus.reset();

    await agentWithCollection(testCase.input);

    const collected = eventBus.getData();
    const result = evaluate(testCase, collected);

    if (result.passed) {
      passed++;
      console.log(`[PASS] ${testCase.id}: ${testCase.description}`);
    } else {
      console.log(`[FAIL] ${testCase.id}: ${testCase.description}`);
      if (!result.agentMatch) {
        console.log(`  Agent 遗漏: ${result.details.agents.missed.join(', ') || '无'}`);
        console.log(`  Agent 多余: ${result.details.agents.extra.join(', ') || '无'}`);
      }
      if (!result.toolMatch) {
        const missed = result.details.tools.missed.map((t) => `${t.agent}.${t.tool}`);
        const extra = result.details.tools.extra.map((t) => `${t.agent}.${t.tool}`);
        console.log(`  工具遗漏: ${missed.join(', ') || '无'}`);
        console.log(`  工具多余: ${extra.join(', ') || '无'}`);
      }
    }
  }

  console.log(`\n通过率: ${passed}/${TEST_CASES.length}`);
}
