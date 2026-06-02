import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSystemPromptSegment } from "@actspace/agent-core";

type WarningLogger = (message: string, details?: Record<string, unknown>) => void;

type AgentsMdSource = {
  id: string;
  title: string;
  path: string;
  priority: number;
};

export type LoadAgentsMdSegmentsInput = {
  dataRoot: string;
  workspaceRoot: string;
  warn?: WarningLogger;
  readTextFile?: (filePath: string) => Promise<string>;
};

export async function loadAgentsMdSegments(
  input: LoadAgentsMdSegmentsInput,
): Promise<AgentSystemPromptSegment[]> {
  const readTextFile = input.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  const segments: AgentSystemPromptSegment[] = [];

  for (const source of createAgentsMdSources(input.dataRoot, input.workspaceRoot)) {
    const content = await readOptionalTextFile(source, readTextFile, input.warn);
    if (!content?.trim()) continue;
    segments.push({
      id: source.id,
      title: source.title,
      content,
      bucket: "rules",
      priority: source.priority,
    });
  }

  return segments;
}

function createAgentsMdSources(dataRoot: string, workspaceRoot: string): AgentsMdSource[] {
  return [
    { id: "agents_user_data", title: "UserData AGENTS.md", path: join(dataRoot, "AGENTS.md"), priority: 90 },
    { id: "agents_workspace", title: "Workspace AGENTS.md", path: join(workspaceRoot, "AGENTS.md"), priority: 80 },
  ];
}

async function readOptionalTextFile(
  source: AgentsMdSource,
  readTextFile: (filePath: string) => Promise<string>,
  warn?: WarningLogger,
): Promise<string | null> {
  try {
    return await readTextFile(source.path);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    warn?.("optional text file read failed", {
      label: `rules ${source.id}`,
      path: source.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}
