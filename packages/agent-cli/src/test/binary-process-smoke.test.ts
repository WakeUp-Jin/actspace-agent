import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const artifact = process.platform === "win32" ? "actspace-agent.exe" : "actspace-agent";
const binary = resolve(repoRoot, "artifacts", "agent-cli", `${process.platform}-${process.arch}`, artifact);

describe("Agent CLI SEA artifact", () => {
  it.skipIf(process.env.ACTSPACE_TEST_CLI_BINARY !== "1")("exists for explicit binary smoke runs", async () => {
    await expect(access(binary)).resolves.toBeUndefined();
  });
});
