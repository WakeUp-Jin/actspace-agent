import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDesktopNonoPath } from "../sandbox-resources";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function executable(path: string): Promise<string> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "");
  await chmod(path, 0o755);
  return path;
}

describe.skipIf(process.platform === "win32")("resolveDesktopNonoPath", () => {
  it("uses only the shipped binary when packaged", async () => {
    const root = await mkdtemp(join(tmpdir(), "desktop-nono-")); dirs.push(root);
    const shipped = await executable(join(root, "resources", "app", "sandbox-components", "bin", "nono"));
    const override = await executable(join(root, "override", "nono"));
    const repoRoot = join(root, "repo");
    await executable(join(repoRoot, "dist", "sandbox-components", `${process.platform}-${process.arch}`, "nono"));
    expect(resolveDesktopNonoPath({ packaged: true, resourcesPath: join(root, "resources"), repoRoot, env: { ACTSPACE_NONO_PATH: override } })).toBe(shipped);
    await rm(shipped);
    expect(resolveDesktopNonoPath({ packaged: true, resourcesPath: join(root, "resources"), repoRoot, env: { ACTSPACE_NONO_PATH: override } })).toBeUndefined();
  });

  it("prefers ACTSPACE_NONO_PATH, then the repo copy, in development", async () => {
    const root = await mkdtemp(join(tmpdir(), "desktop-nono-")); dirs.push(root);
    const override = await executable(join(root, "override", "nono"));
    const repoRoot = join(root, "repo");
    const fetched = await executable(join(repoRoot, "dist", "sandbox-components", `${process.platform}-${process.arch}`, "nono"));
    const input = { packaged: false, resourcesPath: join(root, "resources"), repoRoot };
    expect(resolveDesktopNonoPath({ ...input, env: { ACTSPACE_NONO_PATH: override } })).toBe(override);
    expect(resolveDesktopNonoPath({ ...input, env: { ACTSPACE_NONO_PATH: join(root, "missing") } })).toBe(fetched);
    expect(resolveDesktopNonoPath({ ...input, repoRoot: join(root, "elsewhere"), env: {} })).toBeUndefined();
  });
});
