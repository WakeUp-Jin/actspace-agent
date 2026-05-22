/**
 * 评估工作流模式
 *
 * 展示评估的核心闭环：定义测试集 → 批量运行 → 代码评分 → 失败分析 → 迭代优化
 * 此骨架不绑定具体业务领域，替换 promptFn 和 testCases 即可用于任何评估场景
 */

// ─── 测试用例定义 ─────────────────────────────────────

interface ScoringTestCase {
  id: number;
  input: string;
  expected: string;
  description: string;
}

const testCases: ScoringTestCase[] = [
  { id: 1, input: '...', expected: '积极', description: '明确的正面表达' },
  { id: 2, input: '...', expected: '消极', description: '反讽陷阱' },
  // 覆盖正常路径、边缘情况、陷阱场景
];

// ─── 评估运行器 ─────────────────────────────────────

interface EvalResult {
  successCount: number;
  failCount: number;
  totalCount: number;
  failedCases: FailedCase[];
}

interface FailedCase {
  id: number;
  expected: string;
  actual: string;
  description: string;
}

type PromptFn = (input: string) => string;

async function evaluatePrompt(
  llmService: { generate: (prompt: string) => Promise<string> },
  promptFn: PromptFn,
  version: string,
): Promise<EvalResult> {
  let successCount = 0;
  const failedCases: FailedCase[] = [];

  for (const test of testCases) {
    const prompt = promptFn(test.input);
    const response = await llmService.generate(prompt);
    const actual = response.trim();

    if (actual === test.expected) {
      successCount++;
    } else {
      failedCases.push({
        id: test.id,
        expected: test.expected,
        actual,
        description: test.description,
      });
    }
  }

  const result: EvalResult = {
    successCount,
    failCount: failedCases.length,
    totalCount: testCases.length,
    failedCases,
  };

  console.log(`${version}: ${successCount}/${testCases.length} 通过`);
  console.log(`准确率: ${((successCount / testCases.length) * 100).toFixed(2)}%`);

  if (failedCases.length > 0) {
    console.log('失败用例:');
    for (const fc of failedCases) {
      console.log(`  #${fc.id}: 期望 ${fc.expected}, 实际 ${fc.actual} — ${fc.description}`);
    }
  }

  return result;
}

// ─── 提示词迭代对比 ─────────────────────────────────────

const promptV1: PromptFn = (input) => `
判断以下文本的情感倾向，回答"积极"、"消极"或"中性"。
文本：${input}
只回答一个词。
`;

const promptV2: PromptFn = (input) => `
你是一个情感分析专家，判断以下文本的情感倾向。

分类标准：
- 积极：表达满意、赞赏、推荐等正面情感
- 消极：表达不满、失望、批评等负面情感
- 中性：客观陈述事实，无明显情感倾向

注意事项：
- "虽然...但是..."转折句以后半句为准
- 带引号的词可能是反讽

文本：${input}
只回答一个词：积极、消极或中性。
`;

async function runComparison() {
  const llmService = {} as any; // 替换为实际的 LLM 服务实例

  const v1 = await evaluatePrompt(llmService, promptV1, '提示词 V1');
  const v2 = await evaluatePrompt(llmService, promptV2, '提示词 V2');

  const v1Rate = (v1.successCount / v1.totalCount) * 100;
  const v2Rate = (v2.successCount / v2.totalCount) * 100;

  console.log(`\nV1 准确率: ${v1Rate.toFixed(2)}%`);
  console.log(`V2 准确率: ${v2Rate.toFixed(2)}%`);
  console.log(`提升: ${(v2Rate - v1Rate).toFixed(2)}%`);
}
