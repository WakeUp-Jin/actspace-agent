import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import type { CliArtifactResult, ContextSnapshotArtifact, SerializableAgentEvent } from "./types";

export interface WriteArtifactsInput {
  outDir: string;
  result: CliArtifactResult;
  events: SerializableAgentEvent[];
  finalText: string;
  contextSnapshots?: ContextSnapshotArtifact[];
}

export async function writeArtifacts(input: WriteArtifactsInput): Promise<void> {
  const outDir = resolve(input.outDir);
  await mkdir(outDir, { recursive: true });

  await writeJsonWithin(outDir, "result.json", input.result);
  await writeFileWithin(outDir, "trace.jsonl", input.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  await writeFileWithin(outDir, "final-response.md", input.finalText);

  if (input.contextSnapshots?.length) {
    await mkdir(artifactPath(outDir, "context-snapshots"), { recursive: true });
    await Promise.all(input.contextSnapshots.map((snapshot, index) => writeJsonWithin(
      outDir,
      join("context-snapshots", `${String(index + 1).padStart(3, "0")}-${snapshot.kind}.json`),
      snapshot,
    )));
  }
}

async function writeJsonWithin(root: string, relativePath: string, value: unknown): Promise<void> {
  await writeFileWithin(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileWithin(root: string, relativePath: string, content: string): Promise<void> {
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Artifact path escapes output directory: ${relativePath}`);
  }
  await writeFile(target, content, "utf8");
}

export function artifactPath(outDir: string, fileName: string): string {
  return join(resolve(outDir), fileName);
}
