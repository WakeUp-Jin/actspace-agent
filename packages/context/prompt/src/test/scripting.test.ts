import { describe, expect, it } from "vitest";
import { MAIN_AGENT_DESCRIPTOR } from "@actspace/agent";
import { SkillCatalog } from "@actspace/skill";
import { createCoreContributors, type ScriptingFacts } from "../core-contributors.js";

const base = {
  scopeId: "scope",
  agent: MAIN_AGENT_DESCRIPTOR,
  host: {
    hostKind: "desktop" as const,
    capabilityCeiling: [],
    runtimeContract: "actspace.runtime.v2",
    invocationId: "test",
  },
  workspaceRoot: "/workspace",
  instructions: [],
  skills: new SkillCatalog(),
};
type Options = Parameters<typeof createCoreContributors>[0];
const scratchDirectory = (sessionId: string) => `/tmp/bash-v2/p1/scripts/${sessionId}`;
const resolveById = async (options: Partial<Options>, id: string) => {
  const item = createCoreContributors({ ...base, ...options } as Options).find((entry) => entry.id === id);
  return item === undefined ? undefined : (await item.resolve({ sessionId: "s1" } as never)).value;
};

describe("scripting guidance", () => {
  it("is absent without Bash and in Chat mode", () => {
    const ids = (options: Partial<Options>) =>
      createCoreContributors({ ...base, ...options } as Options).map((item) => item.id);
    expect(ids({})).not.toContain("core/scripting");
    expect(ids({ scripting: { scratchDirectory } })).toContain("core/scripting");
    expect(ids({ scripting: { scratchDirectory } })).toContain("host/scripting-facts");
    expect(ids({ scripting: { scratchDirectory }, profile: "chat" })).not.toContain("core/scripting");
    expect(ids({ scripting: { scratchDirectory }, profile: "chat" })).not.toContain("host/scripting-facts");
  });

  it("describes both ways to run a script, the scratch directory and the output cap, and stays short", async () => {
    let installed = false;
    const scripting: ScriptingFacts = {
      scratchDirectory,
      python: {
        version: "3.12.16",
        corePackages: ["openpyxl", "pypdf"],
        extensionPackages: ["numpy", "pandas"],
        extensionInstalled: () => installed,
      },
    };
    const section = (await resolveById({ scripting }, "core/scripting")) as string;
    expect(section.split("\n").length).toBeLessThanOrEqual(10);
    expect(section).toContain("actspace-python -c '...'");
    expect(section).toContain("write the file into $ACTSPACE_SCRATCH");
    expect(section).toContain("cleaned up automatically");
    expect(section).toContain("at most 8000 characters");
    expect(section).toContain("Do not pip install");
    expect(section).not.toContain("python3");

    const facts = (await resolveById({ scripting }, "host/scripting-facts")) as {
      scratchDirectory: string;
      python: { command: string; corePackages: string[]; dataExtension: { installed: boolean } };
    };
    expect(facts.scratchDirectory).toBe("/tmp/bash-v2/p1/scripts/s1");
    expect(facts.python.command).toBe("actspace-python");
    expect(facts.python.corePackages).toEqual(["openpyxl", "pypdf"]);
    expect(facts.python.dataExtension.installed).toBe(false);
    installed = true;
    expect(
      ((await resolveById({ scripting }, "host/scripting-facts")) as typeof facts).python.dataExtension.installed,
    ).toBe(true);
  });

  it("falls back to the system python3 when the build ships no runtime", async () => {
    const section = (await resolveById({ scripting: { scratchDirectory } }, "core/scripting")) as string;
    expect(section).toContain("python3 -c '...'");
    expect(section).toContain("no bundled Python");
    expect(section).not.toContain("actspace-python");
    const facts = (await resolveById({ scripting: { scratchDirectory } }, "host/scripting-facts")) as {
      python: unknown;
    };
    expect(facts.python).toBeNull();
  });
});
