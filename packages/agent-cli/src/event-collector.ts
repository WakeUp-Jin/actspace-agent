import type { RuntimeStreamEvent, SessionEvent } from "@actspace/shared";
import type { SerializableTraceEvent } from "./types";

export class CliTraceCollector {
  private events: SerializableTraceEvent[] = [];

  captureRuntime(event: RuntimeStreamEvent): void {
    this.events.push({ timestamp: new Date().toISOString(), source: "runtime", event });
  }

  captureHarness(events: SessionEvent[]): void {
    for (const event of events) {
      this.events.push({ timestamp: new Date().toISOString(), source: "harness", event });
    }
  }

  getEvents(): SerializableTraceEvent[] {
    return [...this.events];
  }
}
