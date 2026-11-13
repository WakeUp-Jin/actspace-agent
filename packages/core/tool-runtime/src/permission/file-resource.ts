import { existsSync, realpathSync } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import * as nodePath from "node:path";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isLexicallyInside } from "@actspace/shared";
import { ToolRuntimeError } from "../errors.js";
import type { ResourceSensitivity, ToolResource } from "./types.js";

export async function canonicalizeFileResource(
  input: string,
  access: "read" | "write" | "delete",
  workspaceRoot: string,
): Promise<Extract<ToolResource, { kind: "file" }>> {
  const candidate = resolve(isAbsolute(input) ? input : join(workspaceRoot, input));
  try {
    if (existsSync(candidate)) {
      const direct = await lstat(candidate);
      if ((access === "write" || access === "delete") && direct.isSymbolicLink()) {
        throw denied("SYMLINK_TARGET_DENIED", "Write and delete targets cannot be symbolic links.");
      }
      const canonicalPath = await realpath(candidate);
      const info = await lstat(canonicalPath);
      const targetKind = info.isFile() ? "file" : info.isDirectory() ? "directory" : undefined;
      if (targetKind === undefined) throw denied("NON_REGULAR_RESOURCE_DENIED", "Non-regular filesystem resources are not supported.");
      return Object.freeze({ kind: "file", access, canonicalPath, targetKind });
    }
    if (access !== "write") throw denied("RESOURCE_NOT_FOUND", "The requested filesystem resource does not exist.");
    let ancestor = dirname(candidate);
    const suffix: string[] = [basename(candidate)];
    while (!existsSync(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) throw denied("RESOURCE_CANONICALIZATION_FAILED", "No existing parent could be verified for the write target.");
      suffix.unshift(basename(ancestor));
      ancestor = parent;
    }
    const ancestorInfo = await lstat(ancestor);
    if (ancestorInfo.isSymbolicLink()) throw denied("SYMLINK_TARGET_DENIED", "A write target parent cannot be a symbolic link.");
    const canonicalAncestor = await realpath(ancestor);
    const canonicalPath = resolve(canonicalAncestor, ...suffix);
    return Object.freeze({ kind: "file", access, canonicalPath, targetKind: "missing" });
  } catch (error) {
    if (error instanceof ToolRuntimeError) throw error;
    throw denied("RESOURCE_CANONICALIZATION_FAILED", `Unable to verify filesystem resource: ${input}`);
  }
}

/**
 * `candidate` 是不是在 `root` 里面，就是 `root` 本身也算。
 *
 * 比 `isLexicallyInside` 多做一步：`root` 存在时先换成它的真实路径。工作区和授权的根目录可能是符号链接，
 * 而拿来比的 `candidate` 多半已经是 `canonicalizeFileResource` 解析过的真实路径。`candidate` 本身不解析。
 */
export function isPathWithin(root: string, candidate: string): boolean {
  const canonicalRoot = existsSync(root) ? realpathSync(root) : root;
  return isLexicallyInside(nodePath, canonicalRoot, candidate, { includeRoot: true });
}

export function classifyFileResource(resource: Extract<ToolResource, { kind: "file" }>): ResourceSensitivity {
  const normalized = resource.canonicalPath.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  const name = basename(lower);
  if ((resource.access === "write" || resource.access === "delete") && lower.split("/").includes(".git")) {
    return { kind: "protected", code: "GIT_METADATA_DENIED", reason: "File tools cannot modify Git metadata." };
  }
  if (/\/(keychains?|library\/keychains)(\/|$)/i.test(normalized)) {
    return { kind: "protected", code: "CREDENTIAL_STORE_DENIED", reason: "System credential stores are Host-only." };
  }
  if (/\/(cookies|login data|web data)$/i.test(normalized) || /\/\.ssh\/(id_[^/]+|.*\.pem)$/i.test(normalized)) {
    return { kind: "protected", code: "CREDENTIAL_FILE_DENIED", reason: "Credential files cannot be accessed by file tools." };
  }
  const onceOnly = (name.startsWith(".env") && name !== ".env.example")
    || [".npmrc", ".pypirc", ".netrc"].includes(name)
    || lower.endsWith("/.aws/credentials")
    || lower.endsWith("/.kube/config")
    || lower.endsWith("/.docker/config.json")
    || lower.endsWith("/.git/config");
  return onceOnly
    ? { kind: "once-only", code: "SENSITIVE_FILE_APPROVAL_REQUIRED", reason: "This file may contain credentials and requires one-time approval." }
    : { kind: "normal" };
}

function denied(code: string, message: string): ToolRuntimeError {
  return new ToolRuntimeError({ code, message, retryable: false, phase: "guard" });
}
