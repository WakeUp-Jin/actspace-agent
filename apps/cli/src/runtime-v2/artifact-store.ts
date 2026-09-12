import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import type { ToolArtifactOwner, ToolArtifactRef } from "@actspace/tools-runtime";

type ArtifactMetadata = ToolArtifactRef & { readonly schemaVersion: 1; readonly owner: ToolArtifactOwner };

export class CliV2ArtifactStore {
  readonly root: string;
  readonly #ephemeral: boolean;
  constructor(dataRoot: string, options: { readonly ephemeral?: boolean; readonly root?: string } = {}) { this.root = options.root ?? join(dataRoot, "artifacts-v2"); this.#ephemeral = options.ephemeral === true; }
  static async ephemeral(): Promise<CliV2ArtifactStore> { return new CliV2ArtifactStore("", { ephemeral: true, root: await mkdtemp(join(tmpdir(), "actspace-cli-artifacts-")) }); }
  async create(input: { readonly bytes: Uint8Array; readonly mediaType: string; readonly owner: ToolArtifactOwner }): Promise<ToolArtifactRef> {
    await mkdir(this.root, { recursive: true });
    const artifactId = randomUUID(); const path = join(this.root, artifactId); const metadataPath = `${path}.json`;
    const ref = Object.freeze({ artifactId, mediaType: input.mediaType, size: input.bytes.byteLength, sha256: createHash("sha256").update(input.bytes).digest("hex") });
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
  async read(artifactId: string): Promise<Buffer> { return (await this.#readVerified(artifactId)).bytes; }
  async readForSession(sessionId: string, artifactId: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> { const verified = await this.#readVerified(artifactId); if (verified.metadata.owner.sessionId !== sessionId) throw new Error("Artifact does not belong to this Session."); return Object.freeze({ bytes: verified.bytes, mediaType: verified.metadata.mediaType }); }
  async resolveForSession(sessionId: string, artifactId: string): Promise<{ readonly path: string; readonly mediaType: string }> { const stored = await this.readForSession(sessionId, artifactId); return { path: await realpath(join(this.root, artifactId)), mediaType: stored.mediaType }; }
  async exportForSession(sessionId: string, artifacts: readonly { readonly artifactId: string; readonly mediaType: string }[], outDir: string): Promise<void> {
    const unique = [...new Map(artifacts.map((artifact) => [artifact.artifactId, artifact])).values()];
    if (unique.length === 0) return;
    const target = join(outDir, "artifacts"); await mkdir(target, { recursive: true }); const manifest = [];
    for (const artifact of unique) {
      const stored = await this.readForSession(sessionId, artifact.artifactId);
      if (stored.mediaType !== artifact.mediaType) throw new Error("Artifact media type does not match the Session projection.");
      const filename = `${artifact.artifactId}${extensionFor(stored.mediaType)}`;
      await writeFile(join(target, filename), stored.bytes, { flag: "wx" });
      manifest.push({ artifactId: artifact.artifactId, mediaType: stored.mediaType, filename });
    }
    await writeFile(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  }
  async dispose(): Promise<void> { if (this.#ephemeral) await rm(this.root, { recursive: true, force: true }); }
  async #readVerified(artifactId: string): Promise<{ readonly bytes: Buffer; readonly metadata: ArtifactMetadata }> {
    if (!/^[0-9a-f-]{36}$/i.test(artifactId)) throw new Error("Invalid artifact id.");
    const path = join(this.root, artifactId);
    const [root, file, metadataFile] = await Promise.all([realpath(this.root), realpath(path), realpath(`${path}.json`)]);
    for (const target of [file, metadataFile]) { const nested = relative(root, target); if (nested.startsWith("..") || isAbsolute(nested)) throw new Error("Artifact escapes the store root."); }
    const [rawMetadata, bytes] = await Promise.all([readFile(metadataFile, "utf8"), readFile(file)]); const metadata = parseMetadata(rawMetadata, artifactId); const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== metadata.size || digest !== metadata.sha256) throw new Error("Artifact integrity check failed.");
    return { bytes, metadata };
  }
}

function extensionFor(mediaType: string): string { return mediaType === "image/png" ? ".png" : mediaType === "image/jpeg" ? ".jpg" : mediaType === "image/gif" ? ".gif" : mediaType === "image/webp" ? ".webp" : ".bin"; }

function parseMetadata(raw: string, artifactId: string): ArtifactMetadata {
  const value: unknown = JSON.parse(raw); if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Artifact metadata is invalid.");
  const record = value as Record<string, unknown>; const owner = record.owner;
  if (record.schemaVersion !== 1 || record.artifactId !== artifactId || typeof record.mediaType !== "string" || typeof record.size !== "number" || !Number.isSafeInteger(record.size) || record.size < 0 || typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.sha256) || owner === null || typeof owner !== "object" || Array.isArray(owner)) throw new Error("Artifact metadata is invalid.");
  const fields = owner as Record<string, unknown>; if ([fields.sessionId, fields.callId, fields.pluginId, fields.name].some((field) => typeof field !== "string" || field.length === 0)) throw new Error("Artifact owner metadata is invalid.");
  return value as ArtifactMetadata;
}
