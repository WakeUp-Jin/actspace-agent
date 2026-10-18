import type { AgentHandle } from "@actspace/core-agent";
import { containNotification, type CordisContext } from "@actspace/cordis-adapter";
import type { PromptHostPort } from "@actspace/prompt";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { EnglishLearningState } from "@actspace/shared";
import { completedMessage, record } from "./completion.js";
import { extractEnglish } from "./english-text.js";
import { ENGLISH_LEARNING_SECTION, PROMPT_ID, PLUGIN_ID } from "./prompt.js";
import type { SpeechHostPort } from "./host-port.js";
import { SpeechQueue } from "./queue.js";

type Binding = { session: AgentHandle["session"]; watermark: number; injected: Map<string, Set<string>>; remove: () => void };
export class EnglishLearningService {
  private binding: Binding | undefined;
  private closed = false;
  private readonly listeners = new Set<(state: EnglishLearningState) => void>();
  private readonly seen = new Set<string>();
  private readonly queue: SpeechQueue;
  private readonly removeEvents: () => void;
  private readonly removeSettings: () => void;
  private state: EnglishLearningState;

  constructor(private readonly ctx: CordisContext, private readonly host: SpeechHostPort) {
    this.state = { enabled: false, targetSessionId: null, revision: 0, promptStatus: "off", speechStatus: "idle", queuedSegments: 0, hasApiKey: false, error: null, notice: null };
    this.queue = new SpeechQueue(host, (patch) => this.update(patch));
    this.update({ speechStatus: this.queue.available() });
    const service = this;
    const remove = ctx.on?.("session/event", containNotification(ctx, function (this: { sessionId?: string } | undefined, event: SessionEventEnvelopeV1) {
      service.observe(this?.sessionId, event);
    }));
    this.removeEvents = typeof remove === "function" ? remove as () => void : () => {};
    this.removeSettings = host.subscribeSettings(() => { void this.queue.stop(); });
  }

  getState(): EnglishLearningState { return structuredClone(this.state); }
  subscribe(listener: (state: EnglishLearningState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  async enableSession(sessionId: string): Promise<EnglishLearningState> {
    const sessions = this.ctx.get?.("session.runtime") as { getOpen(id: string): AgentHandle["session"] | undefined };
    const session = sessions.getOpen(sessionId);
    if (!session) throw new Error("目标会话尚未就绪。");
    return this.bind(session);
  }

  async enable(agent: AgentHandle): Promise<EnglishLearningState> {
    if (agent.descriptor.kind !== "main" || agent.session.header.lineage !== null) throw new Error("请选择主会话。");
    agent.scope.assertActive();
    return this.bind(agent.session);
  }

  private async bind(session: AgentHandle["session"]): Promise<EnglishLearningState> {
    if (this.closed) throw new Error("英语辅助学习已停止。");
    if (session.header.lineage !== null) throw new Error("请选择主会话。");
    const binding: Binding = { session, watermark: session.journal.lastSeq, injected: new Map(), remove: () => {} };
    const extensions = (this.ctx.get?.("actspace.host.prompt") as PromptHostPort | undefined)?.extensions;
    if (!extensions) throw new Error("会话提示词入口不可用。");
    this.binding?.remove();
    const remove = extensions.registerMainSession(session.header.sessionId, {
      id: PROMPT_ID, owner: PLUGIN_ID, order: 100, criticality: "optional", fields: ["system"],
      get: (context, write) => {
        if (this.binding !== binding) return;
        write({ system: { sections: [{ id: PROMPT_ID, owner: PLUGIN_ID, order: 5000, content: ENGLISH_LEARNING_SECTION }], modelFacts: [] } });
        const { turnId, stepId } = context.request;
        if (!turnId || !stepId) return;
        let steps = binding.injected.get(turnId);
        if (!steps) { steps = new Set(); binding.injected.set(turnId, steps); }
        steps.add(stepId);
      },
    });
    binding.remove = () => { remove(); binding.injected.clear(); };
    this.binding = binding;
    this.seen.clear();
    this.update({ enabled: true, targetSessionId: session.header.sessionId, promptStatus: "active" });
    await this.queue.stop();
    return this.getState();
  }

  async disable(): Promise<EnglishLearningState> {
    const binding = this.binding;
    this.binding = undefined;
    binding?.remove();
    this.seen.clear();
    this.update({ enabled: false, targetSessionId: null, promptStatus: "off" });
    await this.queue.stop();
    return this.getState();
  }

  async stop(): Promise<EnglishLearningState> { await this.queue.stop(); return this.getState(); }
  preview(): EnglishLearningState {
    if (this.state.speechStatus === "playing" || this.state.speechStatus === "synthesizing") throw new Error("请先停止当前语音。");
    this.queue.enqueue(["Learning English can be part of everyday work."]);
    return this.getState();
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.removeEvents(); this.removeSettings();
    await this.disable(); await this.queue.dispose();
    this.listeners.clear();
  }

  private observe(sessionId: string | undefined, event: SessionEventEnvelopeV1): void {
    const binding = this.binding;
    if (!binding || sessionId !== binding.session.header.sessionId || event.type !== "turn/end" || event.seq <= binding.watermark) return;
    const turnId = record(event.data).turnId;
    if (typeof turnId !== "string") return;
    const injected = binding.injected.get(turnId);
    binding.injected.delete(turnId);
    if (!injected) return;
    const sessions = this.ctx.get?.("session.runtime") as { getOpen(id: string): AgentHandle["session"] | undefined } | undefined;
    const latest = (sessions?.getOpen(sessionId) ?? binding.session).journal.latestEvent("assistant/message", event.seq - 1);
    const message = completedMessage(latest ? [latest] : [], event);
    if (!message || !injected.has(message.stepId)) return;
    const key = `${sessionId}:${turnId}:${message.messageId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.queue.enqueue(extractEnglish(message.text));
  }

  private update(patch: Partial<EnglishLearningState>): void {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1, hasApiKey: Boolean(this.host.resolveCredential()) };
    for (const listener of this.listeners) { try { listener(this.getState()); } catch { /* UI observers cannot affect the Agent. */ } }
  }
}
