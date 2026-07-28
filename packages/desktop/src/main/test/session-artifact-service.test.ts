import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDataRoots } from "../agent-turn";
import { readSessionArtifact } from "../session-artifact-service";

const created: string[] = [];
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-session-artifact-"));
  created.push(dataRoot);
  return {
    dataRoot,
    sessionRoot: join(dataRoot, "sessions"),
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: dataRoot,
    workspaceRoot: dataRoot,
  };
}

describe("readSessionArtifact", () => {
  it("reads a generated image through a data URL", async () => {
    const roots = await makeRoots();
    const imageDir = join(roots.sessionRoot, "session-1", "artifacts", "generated-images", "batch");
    const imagePath = join(imageDir, "generated-01.png");
    await mkdir(imageDir, { recursive: true });
    await writeFile(imagePath, Buffer.from(PNG_BASE64, "base64"));

    const result = await readSessionArtifact({ sessionId: "session-1", artifactPath: imagePath }, roots);

    expect(result.error).toBeUndefined();
    expect(result.name).toBe("generated-01.png");
    expect(result.relativePath).toBe("generated-images/batch/generated-01.png");
    expect(result.mimeType).toBe("image/png");
    expect(result.dataUrl?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("rejects paths outside the current session artifacts directory", async () => {
    const roots = await makeRoots();
    const outside = join(roots.dataRoot, "outside.png");
    await writeFile(outside, Buffer.from(PNG_BASE64, "base64"));

    const result = await readSessionArtifact({ sessionId: "session-1", artifactPath: outside }, roots);

    expect(result.error).toBe("escapes_root");
    expect(result.dataUrl).toBeUndefined();
  });

  it("rejects symlinks that escape the session artifacts directory", async () => {
    const roots = await makeRoots();
    const artifactRoot = join(roots.sessionRoot, "session-1", "artifacts");
    const outside = join(roots.dataRoot, "outside.png");
    const linked = join(artifactRoot, "linked.png");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(outside, Buffer.from(PNG_BASE64, "base64"));
    await symlink(outside, linked);

    const result = await readSessionArtifact({ sessionId: "session-1", artifactPath: linked }, roots);

    expect(result.error).toBe("escapes_root");
  });

  it("uses file signatures instead of trusting the extension", async () => {
    const roots = await makeRoots();
    const imageDir = join(roots.sessionRoot, "session-1", "artifacts", "generated-images");
    const fakeImage = join(imageDir, "fake.png");
    await mkdir(imageDir, { recursive: true });
    await writeFile(fakeImage, "not an image", "utf8");

    const result = await readSessionArtifact({ sessionId: "session-1", artifactPath: fakeImage }, roots);

    expect(result.error).toBe("unsupported_format");
    expect(result.dataUrl).toBeUndefined();
  });

  it("rejects images above the generated artifact size limit", async () => {
    const roots = await makeRoots();
    const imageDir = join(roots.sessionRoot, "session-1", "artifacts", "generated-images");
    const hugeImage = join(imageDir, "huge.png");
    await mkdir(imageDir, { recursive: true });
    await writeFile(hugeImage, Buffer.from(PNG_BASE64, "base64"));
    await truncate(hugeImage, 25 * 1024 * 1024 + 1);

    const result = await readSessionArtifact({ sessionId: "session-1", artifactPath: hugeImage }, roots);

    expect(result.error).toBe("too_large");
    expect(result.dataUrl).toBeUndefined();
  });
});
