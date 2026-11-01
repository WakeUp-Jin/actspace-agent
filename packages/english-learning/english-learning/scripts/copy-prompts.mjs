import { watch } from "node:fs";
import { cp, mkdir } from "node:fs/promises";

async function copyPrompt() {
  await mkdir(new URL("../dist/prompts/", import.meta.url), { recursive: true });
  await cp(new URL("../src/prompts/english-learning.md", import.meta.url), new URL("../dist/prompts/english-learning.md", import.meta.url));
}

await copyPrompt();

if (process.argv.includes("--watch")) {
  watch(new URL("../src/prompts/", import.meta.url), (_event, filename) => {
    if (filename?.toString() === "english-learning.md") {
      void copyPrompt().catch((error) => console.error(error));
    }
  });
}
