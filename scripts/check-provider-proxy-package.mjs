import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve from the deployed application, never the development workspace.
// `@actspace/llm-service` reaches the app through `@actspace/runtime`, so follow that
// chain instead of requiring the app to list it as a direct dependency it never imports.
const root = resolve(process.argv[2] ?? ".");
const appRequire = createRequire(pathToFileURL(resolve(root, "package.json")));
const runtimeRequire = createRequire(pathToFileURL(appRequire.resolve("@actspace/runtime")));
const { ProviderProxyPool } = await import(pathToFileURL(runtimeRequire.resolve("@actspace/llm-service")).href);
const pool = new ProviderProxyPool();
try {
  await pool.getFetch("http://127.0.0.1:9");
  console.log("Production provider proxy initialization passed.");
} finally {
  await pool.dispose();
}
