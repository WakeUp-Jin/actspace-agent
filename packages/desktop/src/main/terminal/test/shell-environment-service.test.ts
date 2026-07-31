import { describe, expect, it } from "vitest";
import { ShellEnvironmentService } from "../shell-environment-service";

describe("ShellEnvironmentService", () => {
  it("hydrates login PATH while filtering provider-like secrets", async () => {
    const service = new ShellEnvironmentService({
      platform: "darwin",
      sourceEnv: {
        SHELL: "/bin/zsh",
        PATH: "/usr/bin",
        OPENAI_API_KEY: "must-not-leak",
        ACTSPACE_MODE: "desktop",
      },
      runLoginEnv: async (_shell, env) => {
        expect(env.OPENAI_API_KEY).toBeUndefined();
        return "PATH=/opt/homebrew/bin:/usr/bin\0LANG=zh_CN.UTF-8\0SERVICE_TOKEN=nope\0";
      },
    });

    const result = await service.resolve();
    expect(result.shell).toBe("/bin/zsh");
    expect(result.args).toEqual(["-l"]);
    expect(result.env.PATH).toBe("/opt/homebrew/bin:/usr/bin");
    expect(result.env.OPENAI_API_KEY).toBeUndefined();
    expect(result.env.SERVICE_TOKEN).toBeUndefined();
    expect(result.env.ACTSPACE_MODE).toBeUndefined();
    expect(result.env.TERM_PROGRAM).toBe("Actspace");
  });
});
