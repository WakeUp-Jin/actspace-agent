import { readFile, mkdtemp, mkdir, writeFile, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { artifactHash, publishPluginArtifact, pluginId, entryId, serviceId, type PluginArtifact } from "@actspace/cordis-adapter";
import { normalizeToolDefinition } from "@actspace/tools-runtime";
import { validateInputSchema } from "./schema.js";
export type ToolSource = { metadata: { name: string; description: string; inputSchema: Record<string, unknown> }; implementation: string };
export async function readSource(directory: string): Promise<ToolSource> {
  for (const name of ["", "tool.json", "implementation.ts"]) {
    const info = await lstat(join(directory, name));
    if (info.isSymbolicLink() || (name && (!info.isFile() || info.size > 256 * 1024))) throw new Error("Tool source must be a regular file under 256 KiB");
  }
  const metadata = JSON.parse(await readFile(join(directory, "tool.json"), "utf8"));
  if (!metadata || typeof metadata.name !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(metadata.name) || typeof metadata.description !== "string" || !metadata.description.trim() || metadata.description.length > 4096 || metadata.inputSchema?.type !== "object") throw new Error("Invalid tool.json: expected name, description and object inputSchema");
  validateInputSchema(metadata.inputSchema);
  const clean = { name: metadata.name, description: metadata.description, inputSchema: metadata.inputSchema };
  return { metadata: clean, implementation: await readFile(join(directory, "implementation.ts"), "utf8") };
}
export function sourceDigest(source: ToolSource): string { return artifactHash(JSON.stringify(source)); }
export async function buildTool(source: ToolSource, artifactRoot: string): Promise<PluginArtifact> {
  validateInputSchema(source.metadata.inputSchema);
  const ast = ts.createSourceFile("implementation.ts", source.implementation, ts.ScriptTarget.ES2022, true);
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ["require", "eval"].includes(node.expression.text))))) throw new Error("V1 supports a single TypeScript file without external imports or dynamic code loading");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  await mkdir(artifactRoot, { recursive: true });
  const directory = await mkdtemp(join(artifactRoot, ".build-"));
  try {
    const input = join(directory, "implementation.ts");
    const text = source.implementation + '\nconst __actspaceExecuteContract: (args: Record<string, unknown>) => Promise<unknown> = execute;\n';
    await writeFile(input, text);
    const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true, noEmitOnError: true, types: [], lib: ["lib.es2022.d.ts"], skipLibCheck: true };
    const program = ts.createProgram([input], options);
    const errors = ts.getPreEmitDiagnostics(program);
    if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n").slice(0, 16000));
    const emitted = program.emit();
    if (emitted.emitSkipped) throw new Error("TypeScript emit failed");
    const exported = ast.statements.some(s => ts.isFunctionDeclaration(s) && s.name?.text === "execute" && s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
    if (!exported) throw new Error("implementation.ts must export function execute");
    await writeFile(input, source.implementation);
    await writeFile(join(directory, "tool.json"), JSON.stringify(source.metadata));
    await writeFile(join(directory, "source.json"), JSON.stringify({ schemaVersion: 1, digest: sourceDigest(source), contract: "json-tool-v1" }));
    const id = `actspace.evolved.${source.metadata.name}`;
    const definition = normalizeToolDefinition({ abiVersion: 2, pluginId: id, name: source.metadata.name, description: source.metadata.description, inputSchema: source.metadata.inputSchema, definitionVersion: 1, effects: [{ capabilityId: "process", mode: "execute", resourceScope: "workspace" }], concurrency: "exclusive", sensitiveArgumentPaths: [], resultSchemaVersion: 1 });
    await writeFile(join(directory, "plugin.js"), `import { execute } from './implementation.js';
export function apply(ctx) {
  const tools = ctx.get('tools.runtime');
  const handle = tools.register({ definition: ${JSON.stringify(definition)},
    permission: { extractResources: () => [], evaluate: () => ({ kind: 'ask', risk: 'high', reason: 'Run user-created tool code (trusted same-process plugin, not a sandbox).' }) },
    executor: { concurrencySafe: false, execute: async (args, context) => {
      context.signal.throwIfAborted();
      const value = await execute(args);
      const text = JSON.stringify(value, (_key, item) => {
        if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Tool result numbers must be finite');
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') throw new Error('Tool must return JSON');
        return item;
      });
      if (text === undefined || text.length > 1000000) throw new Error('Tool must return JSON under 1 MB');
      return { status: 'completed', summary: ${JSON.stringify(source.metadata.name)}, modelOutput: [{ type: 'json', value: JSON.parse(text) }] };
    } }
  });
  ctx.provide(${JSON.stringify(`tools.evolved.${source.metadata.name}`)}, { definition: handle.registration.definition });
  ctx.effect(() => () => handle.dispose(), ${JSON.stringify(id)});
}`);
    return await publishPluginArtifact({ sourceRoot: directory, artifactRoot, files: ["plugin.js", "implementation.js", "implementation.ts", "tool.json", "source.json"], plugin: {
      schemaVersion: 1, pluginId: pluginId(id), version: sourceDigest(source), name: source.metadata.name, runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: `evolution:${sourceDigest(source)}` }, codecs: [],
      behaviors: [{ entryId: entryId(`evolved-${source.metadata.name}`), module: "./plugin.js", required: true, enabled: true, config: {}, host: { required: ["process"], optional: [] }, frontend: null, provides: [serviceId(`tools.evolved.${source.metadata.name}`)], injects: [serviceId("tools.runtime")], contracts: { services: { provides: [{ id: `tools.evolved.${source.metadata.name}`, version: 1 }], requires: [{ id: "tools.runtime", version: 1 }] }, events: { provides: [], requires: [] } } }],
      contributions: { services: [`tools.evolved.${source.metadata.name}`], events: [], contributions: [] },
    } });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
