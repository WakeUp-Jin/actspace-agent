import { cp, mkdir } from "node:fs/promises";
await mkdir(new URL("../dist/prompts/", import.meta.url), { recursive: true });
await cp(new URL("../src/prompts/english-learning.md", import.meta.url), new URL("../dist/prompts/english-learning.md", import.meta.url));
