import type { RuntimeLiveEvent, RuntimeSessionSnapshot } from "@actspace/shared/runtime-v2";
import type { LiveProgressHub, LiveCursor, LiveHandshake, LiveProgressInput } from "./live-progress.js";

export class RuntimeProjectionStream {
  constructor(
    readonly live: LiveProgressHub,
    private readonly snapshot: (sessionId: string) => RuntimeSessionSnapshot,
  ) {}

  publish(input: LiveProgressInput): RuntimeLiveEvent | null {
    return this.live.publish(input);
  }

  handshake(sessionId: string, afterCursor?: LiveCursor): LiveHandshake {
    return this.live.handshake(sessionId, () => this.snapshot(sessionId), afterCursor);
  }
}
