import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { SessionArtifactReadInput, SessionArtifactReadResult } from "@actspace/shared";
import type { AppDataRoots } from "./agent-run";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function isSafeSessionId(sessionId: string): boolean {
  return sessionId.length > 0 && sessionId !== "." && sessionId !== ".." && !sessionId.includes("/") && !sessionId.includes("\\");
}

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function detectImageMime(bytes: Buffer): SessionArtifactReadResult["mimeType"] {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function emptyResult(error: NonNullable<SessionArtifactReadResult["error"]>): SessionArtifactReadResult {
  return { name: "", relativePath: "", size: 0, error };
}

export type ResolvedSessionArtifactFile = {
  path: string;
  name: string;
  relativePath: string;
  size: number;
};

export async function resolveSessionArtifactFile(
  input: SessionArtifactReadInput,
  roots: AppDataRoots,
): Promise<ResolvedSessionArtifactFile | { error: NonNullable<SessionArtifactReadResult["error"]> }> {
  if (!isSafeSessionId(input.sessionId)) {
    return { error: "invalid_session" };
  }

  const artifactRoot = resolve(roots.sessionRoot, input.sessionId, "artifacts");
  const requestedPath = isAbsolute(input.artifactPath)
    ? resolve(input.artifactPath)
    : resolve(artifactRoot, input.artifactPath);

  if (!isInside(artifactRoot, requestedPath)) {
    return { error: "escapes_root" };
  }

  let realArtifactRoot: string;
  let realRequestedPath: string;
  try {
    [realArtifactRoot, realRequestedPath] = await Promise.all([realpath(artifactRoot), realpath(requestedPath)]);
  } catch {
    return { error: "not_found" };
  }

  if (!isInside(realArtifactRoot, realRequestedPath)) {
    return { error: "escapes_root" };
  }

  let size: number;
  try {
    const fileStat = await stat(realRequestedPath);
    if (!fileStat.isFile()) {
      return { error: "not_a_file" };
    }
    size = fileStat.size;
  } catch {
    return { error: "not_found" };
  }

  return {
    path: realRequestedPath,
    name: basename(realRequestedPath),
    relativePath: relative(realArtifactRoot, realRequestedPath).replace(/\\/g, "/"),
    size,
  };
}

export async function readSessionArtifact(
  input: SessionArtifactReadInput,
  roots: AppDataRoots,
): Promise<SessionArtifactReadResult> {
  const resolved = await resolveSessionArtifactFile(input, roots);
  if ("error" in resolved) {
    return emptyResult(resolved.error);
  }

  const { path: realRequestedPath, name, relativePath, size } = resolved;
  if (size > MAX_IMAGE_BYTES) {
    return { name, relativePath, size, error: "too_large" };
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(realRequestedPath);
  } catch {
    return { name, relativePath, size, error: "read_failed" };
  }

  const mimeType = detectImageMime(bytes);
  if (!mimeType) {
    return { name, relativePath, size, error: "unsupported_format" };
  }

  return {
    name,
    relativePath,
    mimeType,
    size,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}
