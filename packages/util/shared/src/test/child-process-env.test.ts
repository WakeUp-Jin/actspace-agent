import { describe, expect, it } from "vitest";
import { hostChildEnv, isCredentialEnvName, toolChildEnv } from "../child-process-env";

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
  UNDEFINED_VALUE: undefined,
} satisfies Readonly<Record<string, string | undefined>>;

describe("isCredentialEnvName", () => {
  it.each(["TAVILY_API_KEY", "OPENAI_APIKEY", "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "GITHUB_TOKEN", "DB_PASSWORD", "MYSQL_PASSWD", "GOOGLE_APPLICATION_CREDENTIALS", "SSH_PRIVATE_KEY", "my_token"])(
    "flags %s",
    (name) => expect(isCredentialEnvName(name)).toBe(true),
  );
  it.each(["PATH", "HOME", "XDG_SESSION_KEY", "GPG_KEY_ID", "SSH_AUTH_SOCK", "AWS_REGION", "GOPATH", "ACTSPACE_DISABLED_TOOLS"])(
    "keeps %s",
    (name) => expect(isCredentialEnvName(name)).toBe(false),
  );
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
    for (const name of ["TAVILY_API_KEY", "ZHIPU_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN", "DB_PASSWORD", "GOOGLE_APPLICATION_CREDENTIALS", "UNDEFINED_VALUE"]) {
      expect(env).not.toHaveProperty(name);
    }
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
