/**
 * Grep 工具示例
 * 使用 ripgrep 实现的文件内容检索工具，输出量可控。
 */

import { InternalTool, ToolResult } from './tool-definition';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_RESULTS = 50;
const IGNORE_DIRS = ['node_modules', '.git', 'dist', '__pycache__', '.venv'];

async function grepHandler(args: Record<string, unknown>): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const path = (args.path as string) || '.';
  const glob = args.glob as string | undefined;
  const maxResults = (args.maxResults as number) || DEFAULT_MAX_RESULTS;
  const contextLines = (args.contextLines as number) || 0;

  const rgArgs = [
    '--line-number',
    '--no-heading',
    '--color', 'never',
    `--max-count=${maxResults}`,
  ];

  // 忽略目录
  for (const dir of IGNORE_DIRS) {
    rgArgs.push('--glob', `!${dir}`);
  }

  // 文件类型过滤
  if (glob) {
    rgArgs.push('--glob', glob);
  }

  // 上下文行数
  if (contextLines > 0) {
    rgArgs.push(`-C`, String(contextLines));
  }

  rgArgs.push(pattern, path);

  try {
    const { stdout } = await execFileAsync('rg', rgArgs, {
      timeout: 30000,
      maxBuffer: 512 * 1024,
    });
    const lines = stdout.trim().split('\n').filter(Boolean);
    return ToolResult.ok({
      matches: lines.slice(0, maxResults),
      totalFound: lines.length,
      truncated: lines.length >= maxResults,
    });
  } catch (err: any) {
    if (err.code === 1) {
      return ToolResult.ok({ matches: [], totalFound: 0, truncated: false });
    }
    return ToolResult.fail(err.message);
  }
}

function renderGrepResult(result: ToolResult): string {
  if (!result.success) return `Error: ${result.error}`;
  const { matches, totalFound, truncated } = result.data as any;
  if (matches.length === 0) return 'No matches found.';
  let output = matches.join('\n');
  if (truncated) {
    output += `\n\n[Results capped at ${matches.length}. At least ${totalFound} matches exist.]`;
  }
  return output;
}

export const GrepTool: InternalTool = {
  name: 'Grep',
  description: `在文件内容中搜索匹配正则表达式的行。
使用 ripgrep 实现，自动忽略 .gitignore 文件。
适合在代码库中搜索特定字符串、函数名、导入语句等。`,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式搜索模式' },
      path: { type: 'string', description: '搜索路径（文件或目录），默认当前目录' },
      glob: { type: 'string', description: '文件名过滤，如 "*.ts"' },
      maxResults: { type: 'string', description: '最大结果数，默认50' },
      contextLines: { type: 'string', description: '匹配行前后的上下文行数' },
    },
    required: ['pattern'],
  },
  handler: grepHandler,
  renderResult: renderGrepResult,
  category: 'search',
  isReadOnly: true,
};
