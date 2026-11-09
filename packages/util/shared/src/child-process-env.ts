/**
 * 子进程环境变量的两档构造。Desktop main 进程的 `process.env` 继承自用户登录环境，子进程不该原样拿到。
 *
 * - `toolChildEnv`：Agent 工具和用户工具链（bash、rg、源码编译、本地更新脚本）。继承全部变量，
 *   只剥掉名字像凭据的；这样用户装的 node / go / pnpm 还能找到，但 Key 不跟着进去。
 * - `hostChildEnv`：main 自己拼 argv 的子进程（git、ssh）。只放行运行所需的少量变量。
 */
export type ChildEnvSource = Readonly<Record<string, string | undefined>>;

/** 名字里出现这些片段就视为凭据。`KEY` 单独不算（`XDG_SESSION_KEY` 之类太多误伤）。 */
const CREDENTIAL_NAME_PATTERN = /API_?KEY|ACCESS_KEY|PRIVATE_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/i;

export function isCredentialEnvName(name: string): boolean {
  return CREDENTIAL_NAME_PATTERN.test(name);
}

export function toolChildEnv(source: ChildEnvSource): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || isCredentialEnvName(name)) continue;
    env[name] = value;
  }
  return env;
}

const HOST_ENV_NAMES = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "TERM", "TZ", "LANG",
  // git 走 ssh 远端时要找 agent；代理变量让 git / ssh 在公司网络里也能出去。
  "SSH_AUTH_SOCK", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  // Windows 上没有这些 git 起不来。
  "SYSTEMROOT", "SystemRoot", "COMSPEC", "ComSpec", "PATHEXT", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "PROGRAMDATA",
]);
const HOST_ENV_PREFIXES = ["LC_", "XDG_"];

export function hostChildEnv(source: ChildEnvSource, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (HOST_ENV_NAMES.has(name) || HOST_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) env[name] = value;
  }
  return { ...env, ...extra };
}
