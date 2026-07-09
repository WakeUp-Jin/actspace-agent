import type { AgentEvent, AgentEventSink } from "@actspace/agent-core";
import type { SerializableAgentEvent } from "./types";

export class AgentEventCollector {
  private events: SerializableAgentEvent[] = [];

  readonly sink: AgentEventSink = (event: AgentEvent) => {
    this.events.push({
      timestamp: new Date().toISOString(),
      event,
    });
  };

  getEvents(): SerializableAgentEvent[] {
    return [...this.events];
  }
}
