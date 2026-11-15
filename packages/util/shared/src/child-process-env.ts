/**
 * 子进程环境变量的两档构造。Desktop main 进程的 `process.env` 继承自用户登录环境，子进程不该原样拿到。
 *
 * - `toolChildEnv`：Agent 工具和用户工具链（bash、rg、源码编译、本地更新脚本）。继承全部变量，
 *   只剥掉名字像凭据的，和值里带着账号密码的地址；这样用户装的 node / go / pnpm 还能找到，但 Key 不跟着进去。
 * - `hostChildEnv`：main 自己拼 argv 的子进程（git、ssh）。只放行运行所需的少量变量。
 */
export type ChildEnvSource = Readonly<Record<string, string | undefined>>;

/**
 * 名字里出现这些片段就视为凭据。`KEY` 单独不算（`XDG_SESSION_KEY` 之类太多误伤）。
 * `PWD` 和 `DSN` 要求前面是下划线并且在结尾：`PWD`、`OLDPWD` 是 shell 的当前目录，不能剥。
 */
const CREDENTIAL_NAME_PATTERN = /API_?KEY|ACCESS_KEY|PRIVATE_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|DATABASE_URL|_PWD$|_DSN$/i;

/** `user:password@` 里不会出现的字符：在 `@` 之前遇到，说明 `://` 后面这一段不带账号密码。 */
const USERINFO_END = /[\s/?#]/;

/** 代理地址即使带账号密码也保留：剥掉以后，要经过这个代理才能上网的机器上，命令里的 curl / git / npm 全部连不出去。 */
const PROXY_ENV_NAMES = new Set(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]);

export function isCredentialEnvName(name: string): boolean {
  return CREDENTIAL_NAME_PATTERN.test(name);
}

/**
 * 值里有带账号密码的地址，比如 `REDIS_URL=redis://:secret@host`、`PIP_INDEX_URL=https://me:secret@pypi.example/simple`。
 * 地址可以在值的任何位置（`jdbc:postgresql://…`、逗号分隔的多个地址）。
 *
 * 每次起子进程都要对所有变量跑一遍，所以先用 indexOf 找 `://`，只从那里往后看。
 * 把协议名也写进正则、从头扫一遍是平方级的：一个 50 KB 的值（base64 的证书）实测要 2 秒多。
 */
export function isCredentialEnvValue(name: string, value: string): boolean {
  if (PROXY_ENV_NAMES.has(name.toUpperCase())) return false;
  for (let at = value.indexOf("://"); at !== -1; at = value.indexOf("://", at + 3)) {
    if (startsWithPasswordUserinfo(value, at + 3)) return true;
  }
  return false;
}

/**
 * 从 `start` 起是不是 `user:password@`。用户名可以为空（`redis://:secret@host`），密码不能为空，密码里可以有冒号。
 *
 * 逐个字符看一遍，不用正则：`[^…]*:[^…]+@` 不锚定时是平方级的，
 * 靠 sticky 加 lastIndex 才是线性，这一点从正则本身看不出来（CodeQL 也按平方级报）。
 */
function startsWithPasswordUserinfo(value: string, start: number): boolean {
  let colon = -1;
  for (let at = start; at < value.length; at += 1) {
    const char = value[at];
    if (char === "@") return colon !== -1 && at > colon + 1;
    if (char === ":") { if (colon === -1) colon = at; }
    else if (USERINFO_END.test(char)) return false;
  }
  return false;
}

export function toolChildEnv(source: ChildEnvSource): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || isCredentialEnvName(name) || isCredentialEnvValue(name, value)) continue;
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
