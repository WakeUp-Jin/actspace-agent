import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDataRoots } from "../agent-run";

vi.mock("electron", () => ({
  clipboard: { writeImage: vi.fn(), writeText: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromDataURL: vi.fn(() => ({ isEmpty: () => false })) },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
}));

import { createArtifactContextMenuTemplate, resolveArtifactContextTarget } from "../artifact-context-menu-service";

const created: string[] = [];
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-artifact-menu-"));
  created.push(dataRoot);
  return {
    dataRoot,
    sessionRoot: join(dataRoot, "sessions"),
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: join(dataRoot, "workspace"),
    workspaceRoot: join(dataRoot, "workspace"),
  };
}

describe("artifact context menu service", () => {
  it("resolves workspace files but rejects traversal outside the workspace", async () => {
    const roots = await makeRoots();
    const filePath = join(roots.workspaceRoot, "docs", "report.md");
    await mkdir(join(roots.workspaceRoot, "docs"), { recursive: true });
    await writeFile(filePath, "report", "utf8");
    const outsidePath = join(roots.dataRoot, "outside.md");
    await writeFile(outsidePath, "outside", "utf8");

    const inside = await resolveArtifactContextTarget(
      { kind: "workspace_file", workspaceRoot: roots.workspaceRoot, relativePath: "docs/report.md" },
      roots,
    );
    const outside = await resolveArtifactContextTarget(
      { kind: "workspace_file", workspaceRoot: roots.workspaceRoot, relativePath: "../outside.md" },
      roots,
    );

    expect(inside?.path).toBe(await realpath(filePath));
    expect(outside).toBeNull();
  });

  it("resolves generated images only inside the current session artifacts directory", async () => {
    const roots = await makeRoots();
    const imageDir = join(roots.sessionRoot, "session-1", "artifacts", "generated-images");
    const imagePath = join(imageDir, "generated-01.png");
    await mkdir(imageDir, { recursive: true });
    await writeFile(imagePath, Buffer.from(PNG_BASE64, "base64"));

    const target = await resolveArtifactContextTarget(
      { kind: "session_image", sessionId: "session-1", artifactPath: imagePath },
      roots,
    );
    const outside = await resolveArtifactContextTarget(
      { kind: "session_image", sessionId: "session-2", artifactPath: imagePath },
      roots,
    );

    expect(target?.path).toBe(await realpath(imagePath));
    expect(target?.sessionImageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(outside).toBeNull();
  });

  it("uses image-specific and file-specific copy menu labels", () => {
    const imageLabels = createArtifactContextMenuTemplate({
      kind: "session_image",
      path: "/tmp/generated.png",
      size: 4,
      sessionImageDataUrl: "data:image/png;base64,AAAA",
    }).map((item) => item.label);
    const fileLabels = createArtifactContextMenuTemplate({
      kind: "workspace_file",
      path: "/tmp/report.md",
      size: 6,
    }).map((item) => item.label);

    expect(imageLabels).toContain("Copy image");
    expect(fileLabels).toContain("Copy file contents");
    expect(fileLabels).toContain("Reveal in Finder");
  });
});
