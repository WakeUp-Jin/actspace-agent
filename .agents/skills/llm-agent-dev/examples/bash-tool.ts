/**
 * Bash 工具示例
 * 展示 definition + executor + 多层安全检查的完整实现模式。
 */

import { InternalTool, ToolResult, PermissionResult } from './tool-definition';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ── 安全检查常量 ──

const CONTROL_CHAR_RE = /[\x00-\x08\x0b-\x1f\x7f]/;
const UNICODE_WHITESPACE_RE = /[\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]/;

const EVAL_LIKE_BUILTINS = new Set([
  'eval', 'source', '.', 'exec', 'command', 'builtin', 'fc', 'trap',
]);

const READONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find',
  'file', 'stat', 'du', 'df', 'which', 'echo', 'pwd', 'tree',
  'diff', 'sort', 'uniq', 'jq', 'curl',
]);

// ── 权限验证 ──

async function bashCheckPermissions(args: Record<string, unknown>): Promise<PermissionResult> {
  const command = (args.command as string || '').trim();

  if (!command) {
    return { passed: false, error: 'command 不能为空' };
  }
  if (CONTROL_CHAR_RE.test(command)) {
    return { passed: false, error: '命令包含控制字符，拒绝执行' };
  }
  if (UNICODE_WHITESPACE_RE.test(command)) {
    return { passed: false, error: '命令包含 Unicode 空白字符，拒绝执行' };
  }

  // 检查 eval-like 命令
  const firstCmd = command.split(/\s+/)[0];
  if (EVAL_LIKE_BUILTINS.has(firstCmd)) {
    return { passed: false, error: `${firstCmd} 会将参数作为代码执行，拒绝` };
  }

  // 清洗 timeout 参数
  let timeout = args.timeout as number | undefined;
  if (timeout !== undefined) {
    timeout = Math.max(1000, Math.min(timeout, 600000));
  }

  return { passed: true, sanitizedArgs: { ...args, timeout: timeout ?? 120000 } };
}

// ── 执行器 ──

async function bashHandler(args: Record<string, unknown>): Promise<ToolResult> {
  const command = args.command as string;
  const timeout = (args.timeout as number) ?? 120000;

  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', command], {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return { success: true, data: { stdout, stderr, exitCode: 0 } };
  } catch (err: any) {
    if (err.killed) {
      return { success: false, error: `命令超时（${timeout}ms）` };
    }
    return {
      success: true, // 非零退出码也算"执行成功"
      data: { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.code ?? 1 },
    };
  }
}

function renderBashResult(result: ToolResult): string {
  if (!result.success) return `Error: ${result.error}`;
  const { stdout, stderr, exitCode } = result.data as any;
  let output = '';
  if (stdout) output += stdout;
  if (stderr) output += `\n[stderr]\n${stderr}`;
  output += `\n[exit code: ${exitCode}]`;
  return output.trim();
}

// ── 工具定义 ──

export const BashTool: InternalTool = {
  name: 'Bash',
  description: `执行 bash 命令并返回输出。工作目录跨调用持久化。
避免使用此工具运行 find、grep、cat 命令，应使用专用工具。
始终对含空格路径使用双引号。可指定超时（毫秒，最大10分钟）。`,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的命令' },
      timeout: { type: 'string', description: '超时毫秒数，默认120000，最大600000' },
    },
    required: ['command'],
  },
  handler: bashHandler,
  checkPermissions: bashCheckPermissions,
  renderResult: renderBashResult,
  category: 'system',
  isReadOnly: false,
};
