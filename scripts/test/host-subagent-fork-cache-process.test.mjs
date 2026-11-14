import { realpathSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { createRequire } from "node:module";
const require = createRequire(
  realpathSync(resolve(process.env.ACTSPACE_HOST_TEST_PACKAGE ?? "packages/host/agent-host/package.json")),
);
const { WebSocket } = require("ws");
const { HostClient } = await import(
  process.env.ACTSPACE_HOST_TEST_CLIENT ?? "../../packages/client/client/dist/host/client.js"
);
const exec = promisify(execFile),
  cli = resolve(process.env.ACTSPACE_HOST_TEST_CLI ?? "apps/cli/dist/cli.js");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, accept, label) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const result = await read();
    if (accept(result)) return result;
    await pause(30);
  }
  throw new Error(`Timed out: ${label}`);
}
async function connect(port, code) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
  await once(socket, "open");
  const client = new HostClient(socket);
  await client.authenticate({ code, name: "fork cache fixture" });
  return client;
}
const FORK_PROMPT = "Try the other approach.";
// The fork's task is a user message; the parent only carries the prompt inside its agent_fork call.
const isFork = (body) =>
  body.messages.some((message) => message.role === "user" && JSON.stringify(message.content).includes(FORK_PROMPT));
const toolMessages = (body) => body.messages.filter((message) => message.role === "tool").length;
const call = (id, name, args) => ({
  role: "assistant",
  tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

// S4 缓存一致：父会话两步之后在第三步调用 agent_fork；fork 的首个请求与父会话第三步的请求，
// 系统提示词、工具定义、模型与边界之前的消息逐项相同（设计 02 §8.4、§10）。
test("a forked subagent sends its first request with the parent's prompt, tools and message prefix", {
  timeout: 60000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "host-fork-cache-"));
  await writeFile(join(root, "a.txt"), "alpha");
  await writeFile(join(root, "b.txt"), "beta");
  const bodies = [];
  const provider = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    bodies.push(body);
    response.writeHead(200, { "content-type": "text/event-stream" });
    const tools = toolMessages(body);
    // The fork first tries a tool a subagent may not run (it sees it, for the cache), then answers.
    const delta = isFork(body)
      ? tools === 2
        ? call("fork-task", "task_list", {})
        : { role: "assistant", content: "Plan B works." }
      : tools === 0
        ? call("read-a", "read_file", { path: "a.txt" })
        : tools === 1
          ? call("read-b", "read_file", { path: "b.txt" })
          : tools === 2
            ? call("fork-b", "agent_fork", { description: "Try plan B", prompt: FORK_PROMPT, background: false })
            : { role: "assistant", content: "Parent done." };
    const finish = delta.tool_calls ? "tool_calls" : "stop";
    for (const chunk of [
      { choices: [{ index: 0, delta, finish_reason: null }] },
      {
        choices: [{ index: 0, delta: {}, finish_reason: finish }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ])
      response.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", ...chunk })}\n\n`,
      );
    response.end("data: [DONE]\n\n");
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const net = await import("node:net"),
    reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const config = join(root, "host.json"),
    env = { ...process.env, HOST_FIXTURE_KEY: "isolated-fixture" };
  await writeFile(
    config,
    JSON.stringify({
      schemaVersion: 1,
      dataRoot: join(root, "data"),
      listen: { address: "127.0.0.1", port },
      allowedOrigins: [],
      workspaces: [{ id: "main", name: "Fixture", path: root }],
      providers: [
        {
          id: "fixture",
          type: "openai-completions",
          baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
          keyEnv: "HOST_FIXTURE_KEY",
          models: ["fixture"],
        },
      ],
      defaultModel: "fixture/fixture",
    }),
  );
  const children = [],
    clients = [];
  const management = async (command, ...args) =>
    JSON.parse((await exec(process.execPath, [cli, "host", command, "--config", config, ...args], { env })).stdout);
  try {
    const host = spawn(process.execPath, [cli, "host", "serve", "--config", config], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(host);
    let output = "",
      errors = "";
    host.stderr.on("data", (bytes) => {
      errors += bytes;
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`start timeout: ${errors}`)), 10000);
      host.stdout.on("data", (bytes) => {
        output += bytes;
        if (output.includes("hostId")) {
          clearTimeout(timer);
          resolve();
        }
      });
      host.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Host exited ${code}: ${errors}`));
      });
    });
    const client = await connect(port, (await management("pair")).code);
    clients.push(client);
    const sessionId = (await client.call("sessions.create", { workspaceId: "main" })).sessionId;
    await client.call("tasks.submit", { sessionId, submissionId: "parent", content: "Read both files, then fork." });
    await until(
      async () => bodies.some((body) => !isFork(body) && toolMessages(body) >= 3),
      Boolean,
      "parent consumed the fork result",
    ).catch(async (error) => {
      const summary = bodies.map((body) => ({
        fork: isFork(body),
        tools: toolMessages(body),
        last: JSON.stringify(body.messages.at(-1)).slice(0, 400),
      }));
      const { readdir, readFile } = await import("node:fs/promises");
      const journals = [];
      for (const id of await readdir(join(root, "data/sessions-v2")).catch(() => []))
        journals.push(
          (await readFile(join(root, "data/sessions-v2", id, "journal.jsonl"), "utf8").catch(() => ""))
            .split("\n")
            .map((line) => line.slice(0, 300))
            .slice(-15)
            .join("\n"),
        );
      throw new Error(`${error.message}\n${JSON.stringify(summary, null, 1)}\n${errors}\n${journals.join("\n----\n")}`);
    });

    const parent = bodies.find((body) => !isFork(body) && toolMessages(body) === 2);
    const fork = bodies.find((body) => isFork(body) && toolMessages(body) === 2);
    assert.ok(parent && fork, `expected a parent step-3 request and a fork request, got ${bodies.length} requests`);
    assert.ok(
      parent.tools.some((tool) => tool.function.name === "agent_fork"),
      "the parent can fork",
    );
    // Same system prompt, same tool definitions in the same order, same model and options.
    assert.deepEqual(fork.tools, parent.tools);
    assert.equal(fork.model, parent.model);
    for (const key of Object.keys(parent).filter((key) => key !== "messages"))
      assert.deepEqual(fork[key], parent[key], `request field ${key}`);
    assert.ok(["system", "developer"].includes(parent.messages[0].role), "the request opens with the system prompt");
    assert.deepEqual(fork.messages[0], parent.messages[0]);
    // Every message up to the step-2 tool result is identical; the fork then adds its own task.
    const lastTool = parent.messages.findLastIndex((message) => message.role === "tool");
    assert.deepEqual(fork.messages.slice(0, lastTool + 1), parent.messages.slice(0, lastTool + 1));
    const forkTask = fork.messages.findIndex(
      (message) => message.role === "user" && JSON.stringify(message.content).includes(FORK_PROMPT),
    );
    assert.ok(forkTask > lastTool, "the fork task follows the inherited prefix");
    assert.ok(
      !JSON.stringify(fork.messages).includes("fork-b"),
      "the step holding the agent_fork call stays with the parent",
    );

    // The blocked tool fails when called, with the spec's text, and the fork carries on.
    const blocked = bodies
      .find((body) => isFork(body) && toolMessages(body) === 3)
      ?.messages.find((message) => message.role === "tool" && message.tool_call_id === "fork-task");
    assert.match(JSON.stringify(blocked?.content), /Subagents cannot use task_list\./);

    // The parent received the fork's answer in its synchronous result.
    const consumed = bodies.find((body) => !isFork(body) && toolMessages(body) === 3);
    const forkResult = consumed.messages.find(
      (message) => message.role === "tool" && message.tool_call_id === "fork-b",
    );
    assert.match(JSON.stringify(forkResult?.content), /Plan B works\./);
  } finally {
    clients.forEach((client) => {
      client.close();
    });
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
