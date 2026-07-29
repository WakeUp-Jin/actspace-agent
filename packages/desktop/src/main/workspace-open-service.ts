import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type {
  WorkspaceOpenInput,
  WorkspaceOpenResult,
  WorkspaceOpenTool,
  WorkspaceOpenToolId,
  WorkspaceOpenToolsResult,
} from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

type AppDefinition = { label: string; appName: string; bundlePaths: string[]; iconFiles: string[] };

const userApplications = resolve(homedir(), "Applications");

const TOOL_DEFINITIONS: Record<WorkspaceOpenToolId, AppDefinition> = {
  vscode: {
    label: "VS Code",
    appName: "Visual Studio Code",
    bundlePaths: ["/Applications/Visual Studio Code.app", resolve(userApplications, "Visual Studio Code.app")],
    iconFiles: ["Code.icns"],
  },
  cursor: {
    label: "Cursor",
    appName: "Cursor",
    bundlePaths: ["/Applications/Cursor.app", resolve(userApplications, "Cursor.app")],
    iconFiles: ["Cursor.icns"],
  },
  finder: {
    label: "Finder",
    appName: "Finder",
    bundlePaths: ["/System/Library/CoreServices/Finder.app"],
    iconFiles: ["Finder.icns"],
  },
  terminal: {
    label: "Terminal",
    appName: "Terminal",
    bundlePaths: ["/System/Applications/Utilities/Terminal.app", "/Applications/Utilities/Terminal.app"],
    iconFiles: ["Terminal.icns"],
  },
  iterm2: {
    label: "iTerm2",
    appName: "iTerm",
    bundlePaths: ["/Applications/iTerm.app", "/Applications/iTerm2.app", resolve(userApplications, "iTerm.app")],
    iconFiles: ["iTerm2 App Icon for Release.icns", "iTerm.icns"],
  },
};

export type OpenCommandRunner = (args: string[]) => Promise<{ ok: boolean; message?: string }>;
export type WorkspaceAppIconLoader = (input: { bundlePath: string; iconPath?: string }) => Promise<string | undefined>;

export async function listWorkspaceOpenTools(
  runner: OpenCommandRunner = runOpenCommand,
  loadIcon?: WorkspaceAppIconLoader,
): Promise<WorkspaceOpenToolsResult> {
  const tools = await Promise.all(
    (Object.entries(TOOL_DEFINITIONS) as Array<[WorkspaceOpenToolId, AppDefinition]>).map(async ([id, definition]) => {
      const available = process.platform === "darwin" && (await runner(["-Ra", definition.appName])).ok;
      const bundlePath = available ? await findAppBundle(definition.bundlePaths) : undefined;
      const iconPath = bundlePath ? await findAppIcon(bundlePath, definition.iconFiles) : undefined;
      const iconDataUrl = bundlePath && loadIcon ? await loadIcon({ bundlePath, iconPath }) : undefined;
      return { id, label: definition.label, available, iconDataUrl } satisfies WorkspaceOpenTool;
    }),
  );
  return { tools };
}

async function findAppIcon(bundlePath: string, iconFiles: string[]): Promise<string | undefined> {
  for (const iconFile of iconFiles) {
    const candidate = resolve(bundlePath, "Contents", "Resources", iconFile);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // The fallback loader can still ask macOS for the bundle's generic file icon.
    }
  }
  return undefined;
}

async function findAppBundle(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      // Apps can be installed outside the standard bundle locations. In that case
      // opening still works through Launch Services and the renderer uses its fallback icon.
    }
  }
  return undefined;
}

export async function openWorkspaceInTool(
  input: WorkspaceOpenInput,
  roots: AppDataRoots,
  runner: OpenCommandRunner = runOpenCommand,
): Promise<WorkspaceOpenResult> {
  const workspaceRoot = resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
  const definition = TOOL_DEFINITIONS[input.toolId];
  if (!definition) {
    return { ok: false, workspaceRoot, toolId: input.toolId, error: "open_failed", message: "Unknown workspace tool." };
  }

  try {
    const info = await stat(workspaceRoot);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    return { ok: false, workspaceRoot, toolId: input.toolId, error: "invalid_workspace", message: "Workspace root was not found." };
  }

  if (process.platform !== "darwin") {
    return { ok: false, workspaceRoot, toolId: input.toolId, error: "unsupported_platform", message: "Workspace opening is currently available on macOS." };
  }

  const installed = await runner(["-Ra", definition.appName]);
  if (!installed.ok) {
    return { ok: false, workspaceRoot, toolId: input.toolId, error: "not_installed", message: `${definition.label} is not installed.` };
  }

  const opened = await runner(["-a", definition.appName, workspaceRoot]);
  return opened.ok
    ? { ok: true, workspaceRoot, toolId: input.toolId }
    : { ok: false, workspaceRoot, toolId: input.toolId, error: "open_failed", message: opened.message ?? `Failed to open ${definition.label}.` };
}

function runOpenCommand(args: string[]): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolveResult) => {
    execFile("/usr/bin/open", args, { timeout: 8_000, windowsHide: true, encoding: "utf8" }, (error, _stdout, stderr) => {
      resolveResult(error ? { ok: false, message: String(stderr ?? error.message).trim().slice(0, 500) } : { ok: true });
    });
  });
}
