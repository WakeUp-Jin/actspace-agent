import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { DisclosureHost } from "@actspace/context";
import { resolveSessionWorkspaceRoot } from "@actspace/session-journal";
import type { ToolPreparedEnvironment } from "@actspace/tools-runtime";
import type { RuntimeSessionController } from "../session/session-controller.js";

/** File discovery only; reading these references still uses ordinary tool permissions. */
export function createContextHost(getSessions: () => RuntimeSessionController | undefined, tools: Omit<ToolPreparedEnvironment, "journal">): DisclosureHost {
  const file = async (path: string): Promise<string | undefined> => {
    try { const canonical = await realpath(path); return (await stat(canonical)).isFile() ? canonical : undefined; }
    catch (error) { if (["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) return; throw error; }
  };
  return {
    normalizeFile: async (sessionId, path) => {
      if (isAbsolute(path)) return file(path);
      const session = getSessions()?.getOpen(sessionId);
      if (!session) return;
      const root = resolveSessionWorkspaceRoot(session.header, session.journal.events, tools.workspaceRoot);
      return root ? file(resolve(root, path)) : undefined;
    },
    historyPath: async sessionId => {
      const sessions = getSessions();
      if (!sessions || sessions.isEphemeral(sessionId)) return;
      const path = sessions.store.storage.journalPath?.(sessionId);
      return path ? file(path) : undefined;
    },
    createIndex: (sessionId, content) => tools.createArtifact({ bytes: Buffer.from(content, "utf8"), mediaType: "text/plain", owner: { sessionId, callId: `context-index:${randomUUID()}`, pluginId: "actspace.context", name: "context-index" } }),
    resolveArtifact: async (sessionId, artifactId) => {
      if (!tools.resolveArtifact) throw new Error("Context artifact resolution is unavailable.");
      return tools.resolveArtifact(sessionId, artifactId);
    },
  };
}
