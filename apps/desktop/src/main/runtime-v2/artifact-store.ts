import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { ToolArtifactOwner, ToolArtifactRef } from "@actspace/tools-runtime";

type ArtifactMetadata = ToolArtifactRef & {
  readonly schemaVersion: 1;
  readonly owner: ToolArtifactOwner;
};

export class DesktopArtifactStore {
  readonly root: string;

  constructor(dataRoot: string) {
    this.root = join(dataRoot, "artifacts-v2");
  }

  async create(input: { readonly bytes: Uint8Array; readonly mediaType: string; readonly owner: ToolArtifactOwner }): Promise<ToolArtifactRef> {
    await mkdir(this.root, { recursive: true });
    const artifactId = randomUUID();
    const path = join(this.root, artifactId);
    const metadataPath = `${path}.json`;
    const ref = Object.freeze({
      artifactId,
      mediaType: input.mediaType,
      size: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    });
    const metadata: ArtifactMetadata = Object.freeze({ schemaVersion: 1, ...ref, owner: Object.freeze({ ...input.owner }) });
    try {
      await writeFile(path, input.bytes, { flag: "wx" });
      await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", flag: "wx" });
      return ref;
    } catch (error) {
      await Promise.allSettled([rm(path, { force: true }), rm(metadataPath, { force: true })]);
      throw error;
    }
  }

  async read(artifactId: string): Promise<Buffer> {
    const metadata = await this.#readVerified(artifactId);
    return metadata.bytes;
  }

  async readForSession(sessionId: string, artifactId: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const verified = await this.#readVerified(artifactId);
    if (verified.metadata.owner.sessionId !== sessionId) throw new Error("Artifact does not belong to this Session.");
    return Object.freeze({ bytes: verified.bytes, mediaType: verified.metadata.mediaType });
  }

  async resolveForSession(sessionId: string, artifactId: string): Promise<{ readonly path: string; readonly bytes: Uint8Array; readonly mediaType: string }> {
    const verified = await this.#readVerified(artifactId);
    if (verified.metadata.owner.sessionId !== sessionId) throw new Error("Artifact does not belong to this Session.");
    return Object.freeze({ path: verified.path, bytes: verified.bytes, mediaType: verified.metadata.mediaType });
  }

  async deleteForSession(sessionId: string, artifactId: string): Promise<void> {
    const verified = await this.#readVerified(artifactId);
    if (verified.metadata.owner.sessionId !== sessionId) throw new Error("Artifact does not belong to this Session.");
    await Promise.all([
      rm(verified.path),
      rm(`${verified.path}.json`),
    ]);
  }

  async #readVerified(artifactId: string): Promise<{ readonly path: string; readonly bytes: Buffer; readonly metadata: ArtifactMetadata }> {
    if (!/^[0-9a-f-]{36}$/i.test(artifactId)) throw new Error("Invalid artifact id.");
    const path = join(this.root, artifactId);
    const [realRoot, realPath, realMetadataPath] = await Promise.all([realpath(this.root), realpath(path), realpath(`${path}.json`)]);
    if (!isInside(realRoot, realPath) || !isInside(realRoot, realMetadataPath)) throw new Error("Artifact escapes the store root.");
    const [rawMetadata, bytes] = await Promise.all([readFile(realMetadataPath, "utf8"), readFile(realPath)]);
    const metadata = parseMetadata(rawMetadata, artifactId);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== metadata.size || digest !== metadata.sha256) throw new Error("Artifact integrity check failed.");
    return { path: realPath, bytes, metadata };
  }
}

function isInside(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function parseMetadata(raw: string, artifactId: string): ArtifactMetadata {
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Artifact metadata is invalid.");
  const record = value as Record<string, unknown>;
  const owner = record.owner;
  if (record.schemaVersion !== 1 || record.artifactId !== artifactId || typeof record.mediaType !== "string" || typeof record.size !== "number" || !Number.isSafeInteger(record.size) || record.size < 0 || typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.sha256) || owner === null || typeof owner !== "object" || Array.isArray(owner)) throw new Error("Artifact metadata is invalid.");
  const fields = owner as Record<string, unknown>;
  if ([fields.sessionId, fields.callId, fields.pluginId, fields.name].some((field) => typeof field !== "string" || field.length === 0)) throw new Error("Artifact owner metadata is invalid.");
  return value as ArtifactMetadata;
}
