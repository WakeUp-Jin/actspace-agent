import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Test assembly only: production CLI, Host, Loop, HTTP adapter and storage.
// Keep retry configuration outside the product's command-line contract.
const entry = fileURLToPath(new URL("../../../apps/cli/dist/cli.js", import.meta.url));
const require = createRequire(entry);
const runtime = await require("@actspace/runtime/loader").loadRuntime();
const delay = Number(process.env.FIXTURE_RETRY_DELAY_MS ?? 10);
require("./runtime-v2/loader.js").setRuntimeV2LoaderForTest(async () => ({
  ...runtime,
  createRuntimeHostServices(input) {
    const port = input.services[runtime.LLM_HOST_PORT_ID];
    return runtime.createRuntimeHostServices({ ...input, services: {
      ...input.services,
      [runtime.LLM_HOST_PORT_ID]: { ...port, routes: port.routes.map(route => ({
        ...route, retryPolicy: { maxAttempts: 2, baseDelayMs: delay, maxDelayMs: delay, shouldRetry: failure => failure.retryable },
      })) },
    } });
  },
}));
process.exitCode = await require(entry).main();
