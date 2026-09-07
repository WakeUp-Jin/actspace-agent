import { parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";
import { normalizeModelCatalog, type CatalogSource } from "@actspace/shared";

try {
  const { source, text } = workerData as { source: CatalogSource; text: string };
  const entries = normalizeModelCatalog(source, JSON.parse(text));
  parentPort?.postMessage({ entries, contentHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex") });
} catch {
  parentPort?.postMessage({ error: "目录格式无效，仍使用本地价目。" });
}
