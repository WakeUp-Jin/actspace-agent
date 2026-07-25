/**
 * macOS Seatbelt profile 生成器（bash 沙盒 E5 第一期）
 *
 * 设计事实来源：docs/design-docs/execution-safety/agent-bash工具设计文档.md「附录：Seatbelt profile 模板与生成契约」。
 *
 * 基线采用 `(deny default)` 全拒 + essential allows。essential allows 清单
 * derived from anthropic-experimental/sandbox-runtime（Apache License 2.0，
 * https://github.com/anthropic-experimental/sandbox-runtime ，
 * src/sandbox/macos-sandbox-utils.ts，其上游依据是 Chrome 沙盒策略）。
 *
 * 硬规则：**路径一律走 `(param "X")` 由 sandbox-exec `-D` 注入**，profile 源码
 * 中禁止拼接任何路径字符串——特殊字符会破坏 Scheme 语法并构成注入面。
 *
 * 第一期裁剪（见 exec-plan 20260704-bash-sandbox）：
 * - 网络放行（`(allow network*)`）：域名过滤代理单独立项，本期沙盒只收文件系统。
 * - 不做 move-blocking 规则：写白名单外全拒，「移动文件绕过读限制」的旁路不成立。
 */

import { join } from "node:path";

export const SANDBOX_LOG_TAG = "actspace-bash-sandbox";

export interface SandboxProfileInput {
  /** 工作区根目录（绝对路径，调用方负责 realpath 解析符号链接）。 */
  workspaceRoot: string;
  /** 会话沙盒临时目录（绝对路径，已 realpath）；子进程 TMPDIR 指向这里。 */
  sessionTmp: string;
  /** 系统用户临时区（`os.tmpdir()` 的 realpath，/var/folders/…）。 */
  darwinTmp: string;
  /** 敏感路径定向禁读清单（绝对路径）。 */
  sensitiveReadDenyPaths: string[];
}

/**
 * workspace 根仓库内的「延迟执行点」：沙盒里写进去的内容会在**沙盒外**被
 * 执行（用户之后在真实环境 git commit 时 hook 就以全权限跑了；`.git/config`
 * 的 core.fsmonitor / core.pager 等配置项等价于 hook）。这是 workspace 可写
 * 区里的沙盒逃逸通道，必须在 profile 层定向禁写（机制拦截，不打扰审批）。
 *
 * 只保护 workspace 根仓库：嵌套子仓库的 `.git` 不拦，否则 `git clone` /
 * 子目录 `git init`（都会写 hooks 模板）在沙盒内会全部失败。根仓库自身的
 * `git init` / `git remote add` / `git push -u`（写 config）在沙盒内会被拦，
 * 走违规标注 + 升级审批路径。
 */
const WORKSPACE_GIT_WRITE_DENY = [
  { param: "WORKSPACE_GIT_HOOKS", relativePath: [".git", "hooks"], matcher: "subpath" },
  { param: "WORKSPACE_GIT_CONFIG", relativePath: [".git", "config"], matcher: "literal" },
] as const;

export interface SandboxProfileSpec {
  /** profile 源码（不含任何路径字面量）。 */
  profileSource: string;
  /** sandbox-exec `-D KEY=VALUE` 参数表（路径经此注入）。 */
  params: Record<string, string>;
}

/**
 * essential allows：`(deny default)` 全拒基线下，普通开发命令（编译器、node、
 * git 等）能正常运行所需的最小系统权限集。逐行审计过的静态文本，无动态拼接。
 */
const ESSENTIAL_ALLOWS = `
; ─── Essential permissions（derived from sandbox-runtime / Chrome sandbox policy） ───
; Process permissions
(allow process-exec)
(allow process-fork)
(allow process-info* (target same-sandbox))
(allow signal (target same-sandbox))
(allow mach-priv-task-port (target same-sandbox))

; User preferences
(allow user-preference-read)

; Mach IPC - specific services only (no wildcard)
(allow mach-lookup
  (global-name "com.apple.audio.systemsoundserver")
  (global-name "com.apple.distributed_notifications@Uv3")
  (global-name "com.apple.FontObjectsServer")
  (global-name "com.apple.fonts")
  (global-name "com.apple.logd")
  (global-name "com.apple.lsd.mapdb")
  (global-name "com.apple.PowerManagement.control")
  (global-name "com.apple.system.logger")
  (global-name "com.apple.system.notification_center")
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.system.opendirectoryd.membership")
  (global-name "com.apple.bsd.dirhelper")
  (global-name "com.apple.securityd.xpc")
  (global-name "com.apple.coreservices.launchservicesd")
  (global-name "com.apple.SecurityServer")
  (global-name "com.apple.trustd.agent")
)

; POSIX IPC - shared memory / semaphores (Python multiprocessing etc.)
(allow ipc-posix-shm)
(allow ipc-posix-sem)

; IOKit - specific operations only
(allow iokit-open
  (iokit-registry-entry-class "IOSurfaceRootUserClient")
  (iokit-registry-entry-class "RootDomainUserClient")
  (iokit-user-client-class "IOSurfaceSendRight")
)
(allow iokit-get-properties)

; Specific safe system-sockets, doesn't allow network access
(allow system-socket (require-all (socket-domain AF_SYSTEM) (socket-protocol 2)))

; sysctl - specific sysctls only
(allow sysctl-read
  (sysctl-name "hw.activecpu")
  (sysctl-name "hw.busfrequency_compat")
  (sysctl-name "hw.byteorder")
  (sysctl-name "hw.cacheconfig")
  (sysctl-name "hw.cachelinesize_compat")
  (sysctl-name "hw.cpufamily")
  (sysctl-name "hw.cpufrequency")
  (sysctl-name "hw.cpufrequency_compat")
  (sysctl-name "hw.cputype")
  (sysctl-name "hw.l1dcachesize_compat")
  (sysctl-name "hw.l1icachesize_compat")
  (sysctl-name "hw.l2cachesize_compat")
  (sysctl-name "hw.l3cachesize_compat")
  (sysctl-name "hw.logicalcpu")
  (sysctl-name "hw.logicalcpu_max")
  (sysctl-name "hw.machine")
  (sysctl-name "hw.memsize")
  (sysctl-name "hw.ncpu")
  (sysctl-name "hw.nperflevels")
  (sysctl-name "hw.packages")
  (sysctl-name "hw.pagesize_compat")
  (sysctl-name "hw.pagesize")
  (sysctl-name "hw.physicalcpu")
  (sysctl-name "hw.physicalcpu_max")
  (sysctl-name "hw.tbfrequency_compat")
  (sysctl-name "hw.vectorunit")
  (sysctl-name "kern.argmax")
  (sysctl-name "kern.bootargs")
  (sysctl-name "kern.hostname")
  (sysctl-name "kern.maxfiles")
  (sysctl-name "kern.maxfilesperproc")
  (sysctl-name "kern.maxproc")
  (sysctl-name "kern.ngroups")
  (sysctl-name "kern.osproductversion")
  (sysctl-name "kern.osrelease")
  (sysctl-name "kern.ostype")
  (sysctl-name "kern.osvariant_status")
  (sysctl-name "kern.osversion")
  (sysctl-name "kern.secure_kernel")
  (sysctl-name "kern.tcsm_available")
  (sysctl-name "kern.tcsm_enable")
  (sysctl-name "kern.usrstack64")
  (sysctl-name "kern.version")
  (sysctl-name "kern.willshutdown")
  (sysctl-name "machdep.cpu.brand_string")
  (sysctl-name "machdep.ptrauth_enabled")
  (sysctl-name "security.mac.lockdown_mode_state")
  (sysctl-name "sysctl.proc_cputype")
  (sysctl-name "vm.loadavg")
  (sysctl-name-prefix "hw.optional.arm")
  (sysctl-name-prefix "hw.optional.arm.")
  (sysctl-name-prefix "hw.optional.armv8_")
  (sysctl-name-prefix "hw.perflevel")
  (sysctl-name-prefix "kern.proc.all")
  (sysctl-name-prefix "kern.proc.pgrp.")
  (sysctl-name-prefix "kern.proc.pid.")
  (sysctl-name-prefix "machdep.cpu.")
  (sysctl-name-prefix "net.routetable.")
)

; V8 thread calculations
(allow sysctl-write
  (sysctl-name "kern.tcsm_enable")
)

; Distributed notifications
(allow distributed-notification-post)

; File I/O on device files
(allow file-ioctl (literal "/dev/null"))
(allow file-ioctl (literal "/dev/zero"))
(allow file-ioctl (literal "/dev/random"))
(allow file-ioctl (literal "/dev/urandom"))
(allow file-ioctl (literal "/dev/dtracehelper"))
(allow file-ioctl (literal "/dev/tty"))

(allow file-ioctl file-read-data file-write-data
  (require-all
    (literal "/dev/null")
    (vnode-type CHARACTER-DEVICE)
  )
)
`.trim();

/**
 * 生成 Seatbelt profile：`(deny default)` 基线 + essential allows +
 * 「读广域放行、敏感定向拒」+「写只放行三区」+ 网络放行（第一期）。
 *
 * Seatbelt 规则 last-match-wins：定向 deny 必须排在广域 allow 之后才生效。
 */
export function buildSandboxProfile(input: SandboxProfileInput): SandboxProfileSpec {
  const params: Record<string, string> = {
    WORKSPACE_ROOT: input.workspaceRoot,
    SESSION_TMP: input.sessionTmp,
    DARWIN_TMP: input.darwinTmp,
  };
  for (const entry of WORKSPACE_GIT_WRITE_DENY) {
    params[entry.param] = join(input.workspaceRoot, ...entry.relativePath);
  }

  const sensitiveParamNames = input.sensitiveReadDenyPaths.map((path, index) => {
    const name = `SENSITIVE_${index}`;
    params[name] = path;
    return name;
  });

  const sensitiveDenyBlock =
    sensitiveParamNames.length > 0
      ? [
          "; 敏感路径定向禁读（last-match-wins：置于广域 allow 之后才生效）",
          "(deny file-read*",
          ...sensitiveParamNames.map((name) => `  (subpath (param "${name}"))`),
          `  (with message "${SANDBOX_LOG_TAG}"))`,
        ].join("\n")
      : "";

  const profileSource = [
    "(version 1)",
    `(deny default (with message "${SANDBOX_LOG_TAG}"))`,
    "",
    ESSENTIAL_ALLOWS,
    "",
    "; ─── Network：第一期放行（域名过滤代理单独立项后收紧） ───",
    "(allow network*)",
    "",
    "; ─── File read：广域放行 + 敏感路径定向拒 ───",
    "(allow file-read*)",
    sensitiveDenyBlock,
    "",
    "; ─── File write：只放行 workspace / 会话 tmp / 系统用户临时区 + 设备文件 ───",
    "(allow file-write*",
    '  (subpath (param "WORKSPACE_ROOT"))',
    '  (subpath (param "SESSION_TMP"))',
    '  (subpath (param "DARWIN_TMP"))',
    '  (literal "/dev/null")',
    '  (literal "/dev/stdout")',
    '  (literal "/dev/stderr")',
    '  (literal "/dev/tty")',
    `  (with message "${SANDBOX_LOG_TAG}"))`,
    "",
    "; workspace 根仓库延迟执行点定向禁写（last-match-wins：置于写放行之后）：",
    "; 沙盒内写 hook / git config，之后会在沙盒外以用户全权限执行",
    ...WORKSPACE_GIT_WRITE_DENY.flatMap((entry) => [
      "(deny file-write*",
      `  (${entry.matcher} (param "${entry.param}"))`,
      `  (with message "${SANDBOX_LOG_TAG}"))`,
    ]),
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { profileSource, params };
}
