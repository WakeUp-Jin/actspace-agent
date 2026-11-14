import { describe, expect, it } from "vitest";
import { hostChildEnv, isCredentialEnvName, isCredentialEnvValue, toolChildEnv } from "../child-process-env";

const source = {
  PATH: "/usr/bin:/bin",
  HOME: "/Users/me",
  LANG: "zh_CN.UTF-8",
  LC_ALL: "C",
  XDG_CONFIG_HOME: "/Users/me/.config",
  SSH_AUTH_SOCK: "/tmp/agent.sock",
  HTTPS_PROXY: "http://127.0.0.1:7897",
  GOPATH: "/Users/me/go",
  NVM_DIR: "/Users/me/.nvm",
  ACTSPACE_DISABLED_TOOLS: "web_search",
  TAVILY_API_KEY: "tvly-secret",
  ZHIPU_API_KEY: "zhipu-secret",
  OPENAI_API_KEY: "sk-secret",
  AWS_SECRET_ACCESS_KEY: "aws-secret",
  AWS_ACCESS_KEY_ID: "AKIA",
  AWS_REGION: "us-east-1",
  GITHUB_TOKEN: "ghp",
  GH_TOKEN: "ghp",
  NPM_TOKEN: "npm",
  DB_PASSWORD: "pw",
  GOOGLE_APPLICATION_CREDENTIALS: "/path/key.json",
  XDG_SESSION_KEY: "session",
  DATABASE_URL: "postgres://localhost/app",
  MYSQL_PWD: "pw",
  SENTRY_DSN: "https://public@sentry.example/1",
  REDIS_URL: "redis://:pw@cache.internal:6379/0",
  PIP_INDEX_URL: "https://me:pw@pypi.example/simple",
  NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
  PWD: "/Users/me/project",
  OLDPWD: "/Users/me",
  UNDEFINED_VALUE: undefined,
} satisfies Readonly<Record<string, string | undefined>>;

describe("isCredentialEnvName", () => {
  it.each(["TAVILY_API_KEY", "OPENAI_APIKEY", "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "GITHUB_TOKEN", "DB_PASSWORD", "MYSQL_PASSWD", "GOOGLE_APPLICATION_CREDENTIALS", "SSH_PRIVATE_KEY", "my_token", "DATABASE_URL", "SHADOW_DATABASE_URL", "database_url", "MYSQL_PWD", "db_pwd", "SENTRY_DSN", "POSTGRES_DSN"])(
    "flags %s",
    (name) => expect(isCredentialEnvName(name)).toBe(true),
  );
  it.each(["PATH", "HOME", "XDG_SESSION_KEY", "GPG_KEY_ID", "SSH_AUTH_SOCK", "AWS_REGION", "GOPATH", "ACTSPACE_DISABLED_TOOLS", "PWD", "OLDPWD", "INIT_CWD", "DSN_FORMAT", "PWD_HISTORY"])(
    "keeps %s",
    (name) => expect(isCredentialEnvName(name)).toBe(false),
  );
});

describe("isCredentialEnvValue", () => {
  it.each([
    "postgres://app:s3cret@db.internal:5432/app",
    "redis://:s3cret@cache.internal:6379/0",
    "jdbc:postgresql://app:s3cret@db.internal/app",
    "https://me:s3cret@pypi.example/simple",
    "amqp://guest:guest@localhost",
    "https://mirror.example/simple, https://me:s3cret@pypi.example/simple",
    "https://me:s3:cret@pypi.example/simple",
    "http://localhost/, redis://:s3cret@cache.internal",
  ])("flags %s", (value) => expect(isCredentialEnvValue("SOME_URL", value)).toBe(true));

  it.each([
    "https://registry.npmjs.org/",
    "http://localhost:3000/@scope/pkg",
    "http://127.0.0.1:7897",
    "http://[::1]:8080/",
    "ssh://git@github.com/org/repo.git",
    "git@github.com:org/repo.git",
    "postgres://localhost:5432/app?email=me@example.com",
    "https://host/path:with@colon",
    "https://me:@pypi.example/simple",
    "https://:@pypi.example/simple",
    "https://me@pypi.example:8080/@scope",
    "https://me :s3cret@pypi.example/simple",
    "/usr/bin:/bin",
    "",
  ])("keeps %s", (value) => expect(isCredentialEnvValue("SOME_URL", value)).toBe(false));

  it.each(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "https_proxy", "all_proxy"])("keeps a proxy address with a password in %s", (name) => {
    expect(isCredentialEnvValue(name, "http://me:s3cret@proxy.corp:8080")).toBe(false);
  });

  it("stays linear on a large value", () => {
    // 把协议名写进正则从头扫，前两种输入是平方级的：实测 200 KB 各要 35 秒左右。
    for (const value of ["a".repeat(200_000), `x://u:${"p".repeat(200_000)}`, "://".repeat(70_000), `x://${":".repeat(200_000)}`, `x://${"!".repeat(200_000)}`, "x://a:".repeat(70_000)]) {
      const startedAt = performance.now();
      expect(isCredentialEnvValue("BIG", value)).toBe(false);
      expect(performance.now() - startedAt).toBeLessThan(200);
    }
  });
});

describe("toolChildEnv", () => {
  it("keeps the user toolchain but strips credential-shaped names and undefined values", () => {
    const env = toolChildEnv(source);
    expect(env.PATH).toBe(source.PATH);
    expect(env.GOPATH).toBe(source.GOPATH);
    expect(env.NVM_DIR).toBe(source.NVM_DIR);
    expect(env.AWS_REGION).toBe(source.AWS_REGION);
    expect(env.ACTSPACE_DISABLED_TOOLS).toBe(source.ACTSPACE_DISABLED_TOOLS);
    expect(env.XDG_SESSION_KEY).toBe(source.XDG_SESSION_KEY);
    expect(env.PWD).toBe(source.PWD);
    expect(env.OLDPWD).toBe(source.OLDPWD);
    expect(env.NPM_CONFIG_REGISTRY).toBe(source.NPM_CONFIG_REGISTRY);
    expect(env.HTTPS_PROXY).toBe(source.HTTPS_PROXY);
    for (const name of ["TAVILY_API_KEY", "ZHIPU_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN", "DB_PASSWORD", "GOOGLE_APPLICATION_CREDENTIALS", "DATABASE_URL", "MYSQL_PWD", "SENTRY_DSN", "REDIS_URL", "PIP_INDEX_URL", "UNDEFINED_VALUE"]) {
      expect(env).not.toHaveProperty(name);
    }
  });

  it("keeps a proxy address that carries a password, because commands cannot reach the network without it", () => {
    expect(toolChildEnv({ HTTPS_PROXY: "http://me:pw@proxy.corp:8080", https_proxy: "http://me:pw@proxy.corp:8080" })).toEqual({ HTTPS_PROXY: "http://me:pw@proxy.corp:8080", https_proxy: "http://me:pw@proxy.corp:8080" });
  });
});

describe("hostChildEnv", () => {
  it("only passes the allowlist plus explicit extras", () => {
    const env = hostChildEnv(source, { GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" });
    expect(env).toEqual({
      PATH: source.PATH,
      HOME: source.HOME,
      LANG: source.LANG,
      LC_ALL: "C",
      XDG_CONFIG_HOME: source.XDG_CONFIG_HOME,
      XDG_SESSION_KEY: source.XDG_SESSION_KEY,
      SSH_AUTH_SOCK: source.SSH_AUTH_SOCK,
      HTTPS_PROXY: source.HTTPS_PROXY,
      GIT_TERMINAL_PROMPT: "0",
    });
  });

  it("extras win over inherited values", () => {
    expect(hostChildEnv({ LANG: "en_US" }, { LANG: "C" }).LANG).toBe("C");
  });
});
