/**
 * bash 沙盒执行层入口（macOS Seatbelt，E5 第一期）
 *
 * - `probeSandbox()`：运行时探测 sandbox-exec 可用性（模块级缓存）。
 *   嵌套沙盒（本进程自身已被沙盒约束）时 sandbox_apply 会失败，探测用
 *   「真的跑一次空 profile」而不是只查文件存在。
 * - `buildSandboxSpawn()`：生成 profile 文件 + sandbox-exec 调用参数。
 *   路径全部经 `-D` 参数注入，profile 源码零路径拼接。
 */

import { spawn } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../../../../env";
import { buildSandboxProfile } from "./profile";

export { buildSandboxProfile, SANDBOX_LOG_TAG } from "./profile";
export type { SandboxProfileInput, SandboxProfileSpec } from "./profile";
export { findSandboxViolationEvidence, formatSandboxViolationHint } from "./violation";

const SANDBOX_EXEC_PATH = "/usr/bin/sandbox-exec";
const PROBE_TIMEOUT_MS = 3_000;

/** 默认敏感路径定向禁读清单（相对 home，运行时展开为绝对路径）。 */
const DEFAULT_SENSITIVE_HOME_PATHS = [".ssh", ".aws", ".gnupg", ".kube", ".docker", ".netrc"];

let probeCache: Promise<boolean> | undefined;

/** 真的用空 profile 跑一次 /usr/bin/true，验证本进程有权 sandbox_apply。 */
function runSandboxProbe(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const child = spawn(SANDBOX_EXEC_PATH, ["-p", "(version 1)(allow default)", "/usr/bin/true"], {
        stdio: "ignore",
      });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done(false);
      }, PROBE_TIMEOUT_MS);
      child.on("error", () => {
        clearTimeout(timer);
        done(false);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        done(code === 0);
      });
    } catch {
      done(false);
    }
  });
}

/**
 * 沙盒可用性：darwin + 逃生门未开 + sandbox-exec 实际可用（缓存）。
 * 逃生门检查在缓存外——测试和调试可通过 loadEnv 动态切换。
 */
export function probeSandbox(): Promise<boolean> {
  if (env.ACTSPACE_BASH_NO_SANDBOX) return Promise.resolve(false);
  if (process.platform !== "darwin") return Promise.resolve(false);
  if (!probeCache) {
    probeCache = runSandboxProbe();
  }
  return probeCache;
}

/** 测试用：清空探测缓存。 */
export function resetSandboxProbeCache(): void {
  probeCache = undefined;
}

export interface SandboxSpawnInput {
  /** 要执行的 shell 命令（作为 bash -lc 的参数原样传入，不做包装拼接）。 */
  command: string;
  /** 工作区根目录。 */
  workspaceRoot: string;
  /** profile 文件与会话沙盒 tmp 的落点根目录，缺省用系统 tmpdir。 */
  tmpRoot?: string;
  /** 会话 id，用于分目录。 */
  sessionId?: string;
  /** 敏感禁读清单覆盖（测试注入临时替身用）；缺省用 home 下默认清单。 */
  sensitiveReadDenyPaths?: string[];
}

export interface SandboxSpawnSpec {
  command: string;
  args: string[];
  /** 子进程环境（TMPDIR 指向会话沙盒 tmp）。 */
  env: NodeJS.ProcessEnv;
  profilePath: string;
  sessionTmp: string;
}

/** realpath 失败（路径不存在等）时原样返回，交给 Seatbelt 按字面匹配。 */
async function safeRealpath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

/**
 * 生成本次命令的沙盒 spawn 参数：
 * `sandbox-exec -f <profile> -D KEY=VALUE … bash -lc <command>`。
 *
 * Seatbelt 按解析后的真实路径匹配（/tmp → /private/tmp 等），所以所有
 * 注入路径先过 realpath。
 */
export async function buildSandboxSpawn(input: SandboxSpawnInput): Promise<SandboxSpawnSpec> {
  const sessionTmpRaw = join(input.tmpRoot ?? tmpdir(), "sandbox", input.sessionId ?? "default");
  await mkdir(sessionTmpRaw, { recursive: true });

  const [workspaceRoot, sessionTmp, darwinTmp, home] = await Promise.all([
    safeRealpath(input.workspaceRoot),
    safeRealpath(sessionTmpRaw),
    safeRealpath(tmpdir()),
    safeRealpath(homedir()),
  ]);

  // 敏感路径同样要 realpath：Seatbelt 按解析后的真实路径匹配，
  // /var/... 这类 symlink 不解析的话 deny 规则会失配（等于没拦）
  const sensitiveReadDenyPaths = await Promise.all(
    (input.sensitiveReadDenyPaths ?? DEFAULT_SENSITIVE_HOME_PATHS.map((name) => join(home, name))).map(
      safeRealpath,
    ),
  );

  const spec = buildSandboxProfile({
    workspaceRoot,
    sessionTmp,
    darwinTmp,
    sensitiveReadDenyPaths,
  });

  const profilePath = join(sessionTmpRaw, "sandbox.sb");
  await writeFile(profilePath, spec.profileSource, "utf8");

  const paramArgs = Object.entries(spec.params).flatMap(([key, value]) => ["-D", `${key}=${value}`]);

  return {
    command: SANDBOX_EXEC_PATH,
    args: ["-f", profilePath, ...paramArgs, "bash", "-lc", input.command],
    env: { ...process.env, TMPDIR: sessionTmp },
    profilePath,
    sessionTmp,
  };
}
