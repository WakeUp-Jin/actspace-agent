import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";

export type FakeStep = { readonly text: string } | { readonly tool: string; readonly arguments: Readonly<Record<string, unknown>> } | { readonly hang: true };
type ChatRequest = { readonly tools?: readonly { readonly function: { readonly name: string } }[]; readonly messages: readonly { readonly role: string; readonly content?: unknown }[] };

/**
 * OpenAI-compatible chat completions server that streams one scripted step per request (same as the CLI's test helper,
 * which this package cannot import). `hang` never answers, for timeouts.
 */
export async function startFakeOpenAi(steps: readonly FakeStep[]) {
  const requests: ChatRequest[] = [];
  let next = 0;
  const server = createServer(async (req, res) => {
    const body = JSON.parse(await text(req)) as ChatRequest;
    requests.push(body);
    const step = steps[Math.min(next++, steps.length - 1)]!;
    if ("hang" in step) return;
    const chunk = (delta: unknown, finish: string | null = null) => `data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", created: 0, model: "fake", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.writeHead(200, { "content-type": "text/event-stream" });
    if ("text" in step) res.write(chunk({ role: "assistant", content: step.text }) + chunk({}, "stop"));
    else {
      const name = body.tools?.map(tool => tool.function.name).find(candidate => candidate === step.tool || candidate.endsWith(step.tool)) ?? step.tool;
      res.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${next}`, type: "function", function: { name, arguments: JSON.stringify(step.arguments) } }] }) + chunk({}, "tool_calls"));
    }
    res.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/v1`, port, requests,
    toolResults: () => requests.flatMap(request => request.messages).filter(message => message.role === "tool").map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)),
    close: () => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

async function text(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
