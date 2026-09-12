import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve from the deployed application, never the development workspace.
const root = resolve(process.argv[2] ?? ".");
const require = createRequire(pathToFileURL(resolve(root, "package.json")));
const { ProviderProxyPool } = await import(pathToFileURL(require.resolve("@actspace/llm-service")).href);
const pool = new ProviderProxyPool();
try {
  await pool.getFetch("http://127.0.0.1:9");
  console.log("Production provider proxy initialization passed.");
} finally {
  await pool.dispose();
}
