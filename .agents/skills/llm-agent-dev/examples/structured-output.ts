/**
 * 结构化输出示例
 * 通过"假工具"的 function calling 模式约束 LLM 输出格式。
 */

import { Tool, Context, AssistantMessage, getToolCalls } from './llm-service';

/**
 * 方法一：工具调用辅助结构化输出
 * 定义一个不执行任何操作的"假工具"，利用参数 schema 约束输出。
 */
function createOutputSchema(name: string, description: string, schema: Record<string, unknown>): Tool {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      ...schema,
    },
  };
}

const summarizeSchema = createOutputSchema(
  'output_summary',
  '将文本总结为结构化格式',
  {
    properties: {
      title: { type: 'string', description: '摘要标题' },
      keyPoints: { type: 'array', items: { type: 'string' }, description: '关键要点列表' },
      sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'], description: '情感倾向' },
    },
    required: ['title', 'keyPoints', 'sentiment'],
  }
);

/**
 * 使用结构化输出 schema 调用 LLM
 * 通过 tool_choice 强制模型使用指定工具输出
 */
async function getStructuredOutput<T>(
  llm: { complete(context: Context): Promise<AssistantMessage> },
  messages: Context['messages'],
  schema: Tool,
): Promise<T> {
  const context: Context = { messages, tools: [schema] };
  const message = await llm.complete(context);

  const toolCalls = getToolCalls(message);
  if (toolCalls.length === 0) {
    throw new Error('LLM did not produce structured output');
  }

  return toolCalls[0].arguments as T;
}

/**
 * 方法二：提示词控制 + JSON 解析（带容错）
 */
function parseJsonResponse<T>(text: string): T | null {
  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  }

  return null;
}

export { createOutputSchema, getStructuredOutput, parseJsonResponse, summarizeSchema };
