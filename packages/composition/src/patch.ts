import type { CompositionEntry, Patch, PatchOperationResult } from "@actspace/bundle";
export function applyPatch(entries: readonly CompositionEntry[], patch: Patch): { readonly entries: readonly CompositionEntry[]; readonly results: readonly PatchOperationResult[] } {
  const next = [...entries]; const results: PatchOperationResult[] = [];
  for (const operation of patch.operations) {
    if (operation.kind === "insert") {
      if (next.some((entry) => entry.entryId === operation.entry.entryId)) fail(operation.id, `Entry ${operation.entry.entryId} already exists.`);
      const index = operation.after === undefined ? next.length : next.findIndex((entry) => entry.entryId === operation.after) + 1;
      if (operation.after !== undefined && index === 0) { miss(operation.id, operation.optional, `Anchor ${operation.after} not found.`); continue; }
      next.splice(index, 0, operation.entry); results.push(result(operation.id, "applied", "Entry inserted.")); continue;
    }
    const index = next.findIndex((entry) => entry.entryId === operation.target);
    if (index < 0) { const skipped = miss(operation.id, operation.optional, `Target ${operation.target} not found.`); if (skipped) results.push(result(operation.id, "skipped", `Optional target ${operation.target} not found.`)); continue; }
    if (operation.kind === "remove") next.splice(index, 1);
    else if (operation.kind === "disable") next[index] = Object.freeze({ ...next[index]!, enabled: false, state: "skipped" });
    else if (operation.kind === "replace-config") next[index] = Object.freeze({ ...next[index]!, config: operation.config });
    results.push(result(operation.id, "applied", `${operation.kind} applied.`));
  }
  return Object.freeze({ entries: Object.freeze(next), results: Object.freeze(results) });
  function miss(id: string, optional: boolean | undefined, message: string): boolean { if (optional) return true; fail(id, message); }
  function fail(id: string, message: string): never { results.push(result(id, "failed", message)); throw new Error(`Patch ${patch.id}/${id}: ${message}`); }
  function result(operationId: string, state: PatchOperationResult["state"], message: string): PatchOperationResult { return Object.freeze({ operationId, patchId: patch.id, state, message }); }
}
