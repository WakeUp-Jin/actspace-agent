import { clipboard, Menu, nativeImage, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { ArtifactContextMenuInput, ArtifactContextMenuResult } from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";
import { readSessionArtifact, resolveSessionArtifactFile } from "./session-artifact-service";

type ResolvedArtifactContextTarget = {
  path: string;
  kind: ArtifactContextMenuInput["kind"];
  size: number;
  sessionImageDataUrl?: string;
};

const MAX_COPY_TEXT_BYTES = 2 * 1024 * 1024;

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

async function resolveWorkspaceTarget(
  input: Extract<ArtifactContextMenuInput, { kind: "workspace_file" }>,
  roots: AppDataRoots,
): Promise<ResolvedArtifactContextTarget | null> {
  const root = resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
  const requestedPath = resolve(root, input.relativePath);
  if (!isInside(root, requestedPath)) return null;

  try {
    const [realRoot, realPath] = await Promise.all([realpath(root), realpath(requestedPath)]);
    if (!isInside(realRoot, realPath)) return null;
    const fileStat = await stat(realPath);
    if (!fileStat.isFile()) return null;
    return { path: realPath, kind: input.kind, size: fileStat.size };
  } catch {
    return null;
  }
}

export async function resolveArtifactContextTarget(
  input: ArtifactContextMenuInput,
  roots: AppDataRoots,
): Promise<ResolvedArtifactContextTarget | null> {
  if (input.kind === "workspace_file") {
    return resolveWorkspaceTarget(input, roots);
  }

  const resolved = await resolveSessionArtifactFile(
    { sessionId: input.sessionId, artifactPath: input.artifactPath },
    roots,
  );
  if ("error" in resolved) return null;
  const image = await readSessionArtifact(
    { sessionId: input.sessionId, artifactPath: input.artifactPath },
    roots,
  );
  if (image.error || !image.dataUrl) return null;
  return { path: resolved.path, kind: input.kind, size: resolved.size, sessionImageDataUrl: image.dataUrl };
}

function openInCursor(targetPath: string): void {
  if (process.platform === "darwin") {
    const child = spawn("/usr/bin/open", ["-a", "Cursor", targetPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }
  void shell.openExternal(`cursor://file${encodeURI(targetPath)}`);
}

function runMenuAction(label: string, action: () => void | Promise<void>): void {
  void Promise.resolve(action()).catch((error) => {
    console.error(`[artifact-context-menu] ${label} failed`, error);
  });
}

export function createArtifactContextMenuTemplate(
  target: ResolvedArtifactContextTarget,
): MenuItemConstructorOptions[] {
  const copyArtifact = target.kind === "session_image"
    ? {
        label: "Copy image",
        click: () => runMenuAction("copy image", () => {
          const image = nativeImage.createFromDataURL(target.sessionImageDataUrl ?? "");
          if (!image.isEmpty()) clipboard.writeImage(image);
        }),
      }
    : {
        label: "Copy file contents",
        enabled: target.size <= MAX_COPY_TEXT_BYTES,
        click: () => runMenuAction("copy file contents", async () => {
          const bytes = await readFile(target.path);
          if (bytes.includes(0)) throw new Error("binary files cannot be copied as text");
          clipboard.writeText(bytes.toString("utf8"));
        }),
      };

  return [
    {
      label: "Open in Cursor",
      click: () => runMenuAction("open in Cursor", () => openInCursor(target.path)),
    },
    {
      label: "Open with default app",
      click: () => runMenuAction("open with default app", async () => {
        const error = await shell.openPath(target.path);
        if (error) throw new Error(error);
      }),
    },
    { type: "separator" },
    {
      label: "Copy path",
      click: () => clipboard.writeText(target.path),
    },
    copyArtifact,
    {
      label: "Reveal in Finder",
      click: () => shell.showItemInFolder(target.path),
    },
  ];
}

export async function showArtifactContextMenu(
  input: ArtifactContextMenuInput,
  roots: AppDataRoots,
  window?: BrowserWindow,
): Promise<ArtifactContextMenuResult> {
  const target = await resolveArtifactContextTarget(input, roots);
  if (!target) return { shown: false, error: "invalid_target" };

  Menu.buildFromTemplate(createArtifactContextMenuTemplate(target)).popup({ window });
  return { shown: true };
}
