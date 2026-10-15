import { execFile } from "node:child_process";
import { shell } from "electron";
import type {
  WorkspaceFileApplication,
  WorkspaceFileApplicationsInput,
  WorkspaceFileApplicationsResult,
  WorkspaceOpenFileInput,
  WorkspaceOpenFileResult,
} from "@actspace/shared";
import type { AppDataRoots } from "./app-paths";
import { resolveArtifactContextTarget } from "./artifact-context-menu-service";

/**
 * 交付卡的「用应用打开」：列出文件的关联应用，并用其中之一打开或在 Finder 中显示。
 * 查询脚本和去重规则移植自 DeepSeek Harness `util/native-command/file-applications.ts`（MIT 许可，见 `renderer/components/files/DEEPSEEK_HARNESS_LICENSE.txt`）。
 */

/** AppKit 在系统 JXA 宿主里运行；路径只作为 argv 传入，不拼进脚本源码。 */
const MAC_APPLICATIONS = `
ObjC.import('AppKit');
function run(argv) {
  var workspace = $.NSWorkspace.sharedWorkspace;
  var file = $.NSURL.fileURLWithPath(argv[0]);
  var preferred = workspace.URLForApplicationToOpenURL(file);
  var preferredPath = preferred.isNil() ? null : ObjC.unwrap(preferred.path);
  var urls = workspace.URLsForApplicationsToOpenURL(file);
  var apps = [];
  for (var i = 0; i < urls.count; i++) {
    var url = urls.objectAtIndex(i);
    var path = ObjC.unwrap(url.path);
    var image = null;
    if (argv[1] === 'icons') {
      var icon = workspace.iconForFile(path);
      var thumbnail = $.NSImage.alloc.initWithSize($.NSMakeSize(32, 32));
      thumbnail.lockFocus;
      icon.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 32, 32), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);
      thumbnail.unlockFocus;
      var bitmap = $.NSBitmapImageRep.imageRepWithData(thumbnail.TIFFRepresentation);
      var png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
      image = png.isNil() ? null : 'data:image/png;base64,' + ObjC.unwrap(png.base64EncodedStringWithOptions(0));
    }
    var bundle = $.NSBundle.bundleWithURL(url);
    var bundleId = bundle.isNil() || bundle.bundleIdentifier.isNil() ? null : ObjC.unwrap(bundle.bundleIdentifier);
    var version = bundle.isNil() ? null : bundle.objectForInfoDictionaryKey('CFBundleShortVersionString');
    apps.push({
      id: path,
      name: ObjC.unwrap($.NSFileManager.defaultManager.displayNameAtPath(path)),
      default: path === preferredPath,
      icon: image,
      bundle: bundleId,
      version: version === null || version.isNil() ? null : String(ObjC.unwrap(version))
    });
  }
  return JSON.stringify(apps);
}`;

export type FileApplicationsDeps = {
  platform?: NodeJS.Platform;
  /** 运行外部命令并返回 stdout；失败时抛错。 */
  run?: (file: string, args: string[]) => Promise<string>;
  openPath?: (path: string) => Promise<string>;
  showItemInFolder?: (path: string) => void;
};

type MacApplication = WorkspaceFileApplication & { bundle: string | null; version: string | null };

async function resolveTarget(input: { workspaceRoot?: string; relativePath: string }, roots: AppDataRoots): Promise<string | null> {
  const target = await resolveArtifactContextTarget({ kind: "workspace_file", workspaceRoot: input.workspaceRoot, relativePath: input.relativePath }, roots);
  return target?.path ?? null;
}

async function queryMacApplications(path: string, display: boolean, deps: FileApplicationsDeps): Promise<MacApplication[]> {
  const run = deps.run ?? runCommand;
  const stdout = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", MAC_APPLICATIONS, path, display ? "icons" : "handlers"]);
  return parseMacApplications(JSON.parse(stdout));
}

export function parseMacApplications(value: unknown): MacApplication[] {
  if (!Array.isArray(value)) throw new Error("Invalid native application list");
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) throw new Error("Invalid native application entry");
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id || typeof item.name !== "string" || typeof item.default !== "boolean") {
      throw new Error("Invalid native application entry");
    }
    const icon = typeof item.icon === "string" && item.icon.startsWith("data:image/png;base64,") ? item.icon : undefined;
    return {
      id: item.id,
      name: item.name,
      default: item.default,
      ...(icon ? { iconDataUrl: icon } : {}),
      bundle: typeof item.bundle === "string" && item.bundle ? item.bundle : null,
      version: typeof item.version === "string" && item.version ? item.version : null,
    };
  });
}

/**
 * 自动更新的应用会在磁盘上留下多份副本，LaunchServices 会全部登记。
 * 和 Finder 一样，bundle id 与显示名相同的副本合并为一项：优先系统默认，其次最高版本，位置取该组第一次出现处。
 * 打开时的校验不走这一步，所以被合并掉的副本仍然可以打开。
 */
export function dedupeMacApplications(applications: readonly MacApplication[]): WorkspaceFileApplication[] {
  const order: MacApplication[] = [];
  const groups = new Map<string, number>();
  for (const app of applications) {
    if (app.bundle === null) {
      order.push(app);
      continue;
    }
    const key = `${app.bundle}\u0000${app.name}`;
    const index = groups.get(key);
    if (index === undefined) {
      groups.set(key, order.length);
      order.push(app);
      continue;
    }
    const held = order[index]!;
    if (held.default) continue;
    if (app.default || compareVersions(app.version, held.version) > 0) order[index] = app;
  }
  return order.map(({ bundle: _bundle, version: _version, ...app }) => app);
}

function compareVersions(left: string | null, right: string | null): number {
  if (left === null || right === null) return left === right ? 0 : left === null ? -1 : 1;
  const a = left.split(".");
  const b = right.split(".");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (Number(a[i]) || 0) - (Number(b[i]) || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function listWorkspaceFileApplications(
  input: WorkspaceFileApplicationsInput,
  roots: AppDataRoots,
  deps: FileApplicationsDeps = {},
): Promise<WorkspaceFileApplicationsResult> {
  const path = await resolveTarget(input, roots);
  if (!path) return { applications: [], error: "invalid_target" };
  if ((deps.platform ?? process.platform) !== "darwin") return { applications: [] };
  try {
    return { applications: dedupeMacApplications(await queryMacApplications(path, true, deps)) };
  } catch {
    return { applications: [], error: "query_failed" };
  }
}

export async function openWorkspaceFile(
  input: WorkspaceOpenFileInput,
  roots: AppDataRoots,
  deps: FileApplicationsDeps = {},
): Promise<WorkspaceOpenFileResult> {
  const path = await resolveTarget(input, roots);
  if (!path) return { ok: false, error: "invalid_target", message: "File was not found in the workspace." };
  try {
    if (input.action === "reveal") {
      (deps.showItemInFolder ?? shell.showItemInFolder)(path);
      return { ok: true };
    }
    if (!input.applicationId) {
      const error = await (deps.openPath ?? shell.openPath)(path);
      return error ? { ok: false, error: "open_failed", message: error } : { ok: true };
    }
    // 应用 id 来自 renderer，只接受当前仍关联到这个文件的应用（含去重前的全部副本）。
    if ((deps.platform ?? process.platform) !== "darwin") return { ok: false, error: "not_registered", message: "Choosing an application is only available on macOS." };
    const registered = await queryMacApplications(path, false, deps);
    if (!registered.some((app) => app.id === input.applicationId)) {
      return { ok: false, error: "not_registered", message: "Application is not registered for this file." };
    }
    await (deps.run ?? runCommand)("/usr/bin/open", ["-a", input.applicationId, path]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: "open_failed", message: error instanceof Error ? error.message.slice(0, 500) : String(error) };
  }
}

function runCommand(file: string, args: string[]): Promise<string> {
  return new Promise((resolveResult, reject) => {
    execFile(file, args, { timeout: 10_000, windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()));
      else resolveResult(stdout);
    });
  });
}
