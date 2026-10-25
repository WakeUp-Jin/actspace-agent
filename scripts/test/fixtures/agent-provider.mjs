import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";

/** Loopback-only real HTTP fixture. Never logs Authorization or reads user settings. */
export async function startAgentProvider({ scenario = "success", logPath, onRequest, port = 0, initialRequestId = 0, heartbeatMs = 20_000, toolCommand, toolBlockMs = 600_000, errorMessage } = {}) {
  const requests = [];
  const waiting = new Map();
  let hold = false;
  let summaryError = false;
  let titleHold = false;
  let summaryHold = false;
  let retryNextRun = false;
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ object: "list", data: ["fixture-main", "fixture-alternate"].map(id => ({ id, object: "model", owned_by: "fixture" })) }));
        return;
      }
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      const messages = body.messages ?? [];
      const system = JSON.stringify(messages.filter(item => item.role === "system" || item.role === "developer"));
      const isSummary = !body.tools?.length && (
        system.includes("Summarize the supplied Agent history faithfully") ||
        system.includes("You are a context summarization agent.")
      );
      const isTitle = /title|标题/i.test(system) && !body.tools?.length && !isSummary;
      // Runtime supplements are user-role messages too. Choose the human task
      // so a fresh runtime-state block does not suppress the fixture scenario.
      const lastUser = messages.findLastIndex(item => item.role === "user" && !JSON.stringify(item.content ?? "").includes("<runtime_context "));
      const content = JSON.stringify(messages[lastUser]?.content ?? "");
      const toolResults = messages.slice(lastUser + 1).filter(item => item.role === "tool");
      const entry = { id: initialRequestId + requests.length + 1, model: body.model, isSummary, isTitle, content, toolResults: toolResults.length,
        reasoning: body.reasoning_effort ?? body.reasoning ?? body.thinking, hasImage: raw.includes("image_url"), hasSkill: raw.includes("ACTSPACE_FIXTURE_SKILL_BODY"), hasSkillCatalog: raw.includes("ACTSPACE_FIXTURE_SKILL"), stream: body.stream };
      requests.push(entry);
      if (logPath) await appendFile(logPath, JSON.stringify(entry) + "\n");
      onRequest?.(entry, body);
      const retryThisRun = retryNextRun && !isSummary && !isTitle;
      if (retryThisRun) retryNextRun = false;
      const status = scenario === "terminal-error" || (isSummary && summaryError) ? 400
        : scenario === "persistent-error" || scenario === "retry-wait" ? 503
        : retryThisRun || (scenario === "retry-once" && requests.length === 1) ? 429 : 200;
      if (status !== 200) {
        response.writeHead(status, { "content-type": "application/json", "retry-after": scenario === "retry-wait" ? "30" : "0" });
        response.end(JSON.stringify({ error: { message: errorMessage ?? `${status} fixture ${scenario}`, type: "fixture_error", code: "fixture_failure" } }));
        return;
      }
      let delta = { role: "assistant", content: `Fixture completed: ${body.model}.\n\n[查看结果](result.txt)` };
      let finish = "stop";
      const tool = (name, args) => { delta = { role: "assistant", tool_calls: [{ index: 0, id: `fixture-${entry.id}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }; finish = "tool_calls"; };
      if (toolCommand && body.tools?.length && toolResults.length === 0)
        tool("bash", { command: toolCommand, intent: "Owned process cleanup fixture", blockMs: toolBlockMs, sandbox_permissions: "require_escalated", justification: "Fixture runs outside the sandbox." });
      if (body.tools?.length && content.includes("FIXTURE_TOOL") && toolResults.length < 2)
        tool(toolResults.length ? "write_file" : "bash", toolResults.length ? { path: "result.txt", content: "Fixture result.\n" } : { command: "pwd", intent: "隔离验收审批", sandbox_permissions: "require_escalated", justification: "Fixture runs outside the sandbox." });
      if (body.tools?.length && content.includes("FIXTURE_LONG") && toolResults.length < 12)
        tool("write_file", { path: "history-result.txt", content: `History step ${toolResults.length}` });
      if (body.tools?.length && content.includes("FIXTURE_BASH_PAIR") && toolResults.length < 2)
        tool("bash", { command: `printf acceptance-${toolResults.length + 1}`, intent: "连续 Bash 权限验收" });
      if (body.tools?.length && content.includes("FIXTURE_BASH_DENIED") && toolResults.length === 0)
        tool("bash", { command: "printf acceptance | cat", intent: "验证现有管道硬拒绝" });
      if (body.tools?.length && content.includes("FIXTURE_BASH_BACKGROUND") && toolResults.length < 3) {
        const taskId = JSON.stringify(toolResults).match(/bash_[0-9a-f-]+/)?.[0];
        if (toolResults.length === 0) tool("bash", { command: "printf ready; sleep 30", intent: "后台生命周期验收", blockMs: 50 });
        else if (taskId) tool(toolResults.length === 1 ? "task_output" : "task_stop", { taskId });
      }
      if (isSummary) delta = { role: "assistant", content: "Fixture summary: preserve the task, verified results and pending work." };
      if (isTitle) delta = { role: "assistant", content: "Fixture automatic title" };
      const holdKind = isTitle ? "title" : isSummary ? "summary" : "run";
      const shouldHold = isTitle ? titleHold : isSummary ? summaryHold : hold || content.includes("FIXTURE_HOLD");
      if (!body.stream && shouldHold) {
        await new Promise(resolve => {
          const release = () => { waiting.delete(release); resolve(); };
          waiting.set(release, holdKind); response.once("close", release);
        });
      }
      if (!body.stream) { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ id: `fixture-${entry.id}`, object: "chat.completion", model: body.model, choices: [{ index: 0, message: delta, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })); return; }
      response.writeHead(200, { "content-type": "text/event-stream" });
      const part = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: `fixture-${entry.id}`, object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }], ...(finish_reason ? { usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } } : {}) })}\n\n`);
      if (finish === "stop" && shouldHold) {
        part({ role: "assistant", content: "Fixture streaming; waiting for release.\n" });
        await new Promise(resolve => {
          const heartbeat = setInterval(() => { if (!response.destroyed) response.write(": fixture keepalive\n\n"); }, heartbeatMs);
          heartbeat.unref();
          const release = () => { clearInterval(heartbeat); waiting.delete(release); resolve(); };
          waiting.set(release, holdKind); response.once("close", release);
        });
      }
      if (!response.destroyed) { part(delta); part({}, finish); response.end("data: [DONE]\n\n"); }
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "fixture request failed" } }));
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, requests,
    control(action) {
      if (action === "hold") hold = true;
      else if (action === "release" || action === "title-release" || action === "summary-release") {
        if (action === "release") hold = false; else if (action === "title-release") titleHold = false; else summaryHold = false;
        for (const [release, kind] of waiting) if (kind === (action === "title-release" ? "title" : action === "summary-release" ? "summary" : "run")) release();
      }
      else if (action === "summary-error") summaryError = true;
      else if (action === "summary-ok") summaryError = false;
      else if (action === "title-hold") titleHold = true;
      else if (action === "summary-hold") summaryHold = true;
      else if (action === "retry-next-run") retryNextRun = true;
      else throw new Error(`Unknown provider action: ${action}`);
    },
    async close() { for (const release of waiting.keys()) release(); server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
