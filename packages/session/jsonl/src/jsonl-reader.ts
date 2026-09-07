import { readFile } from "node:fs/promises";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { validateSessionHeader, type SessionHeaderV1 } from "@actspace/session-journal";
import { validateSessionEvents, type SessionAccessState, type SessionValidationDiagnostic, type SessionValidationResult } from "@actspace/session-journal";
import { SessionError } from "@actspace/session-journal";

export type SessionInspection = {
  readonly journalPath: string;
  readonly header: SessionHeaderV1 | null;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly accessState: SessionAccessState;
  readonly diagnostics: readonly SessionValidationDiagnostic[];
  readonly validation: SessionValidationResult | null;
  readonly tornTail: { readonly offset: number; readonly bytes: Buffer } | null;
  readonly rawBytes: Buffer;
};

export async function inspectJsonlSession(
  journalPath: string,
  registry: EventCodecRegistry,
  expectedSessionId?: string,
): Promise<SessionInspection> {
  const bytes = await readFile(journalPath);
  const diagnostics: SessionValidationDiagnostic[] = [];
  let header: SessionHeaderV1 | null = null;
  const events: SessionEventEnvelopeV1[] = [];
  let tornTail: SessionInspection["tornTail"] = null;
  try {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("Journal must not contain a UTF-8 BOM.");
    const hasFinalLf = bytes.length > 0 && bytes[bytes.length - 1] === 0x0a;
    let parseBytes = bytes;
    if (!hasFinalLf) {
      const lastLf = bytes.lastIndexOf(0x0a);
      const offset = lastLf + 1;
      tornTail = Object.freeze({ offset, bytes: Buffer.from(bytes.subarray(offset)) });
      parseBytes = bytes.subarray(0, offset);
    }
    const lines = parseBytes.toString("utf8").split("\n").filter((line) => line.length > 0);
    if (lines.length === 0) throw new Error("Journal has no Header.");
    const headerValue = JSON.parse(lines[0] as string) as unknown;
    validateSessionHeader(headerValue, expectedSessionId);
    header = headerValue;
    for (let index = 1; index < lines.length; index += 1) {
      events.push(JSON.parse(lines[index] as string) as SessionEventEnvelopeV1);
    }
    const validation = validateSessionEvents(events, registry);
    if (tornTail !== null) {
      diagnostics.push({ code: "INVALID_EVENT", seq: events.length, type: "physical/torn-tail", message: "Journal has a torn final line; explicit repair is required." });
      return freezeInspection({ journalPath, header, events, accessState: "corrupt", diagnostics: [...validation.diagnostics, ...diagnostics], validation, tornTail, rawBytes: bytes });
    }
    return freezeInspection({ journalPath, header, events, accessState: validation.accessState, diagnostics: validation.diagnostics, validation, tornTail: null, rawBytes: bytes });
  } catch (error) {
    diagnostics.push({ code: "INVALID_EVENT", seq: events.length, type: "physical/invalid", message: error instanceof Error ? error.message : String(error) });
    return freezeInspection({ journalPath, header, events, accessState: "corrupt", diagnostics, validation: null, tornTail, rawBytes: bytes });
  }
}

export function exportCanonicalJsonl(inspection: SessionInspection): Buffer {
  if (inspection.header === null || inspection.validation === null || inspection.tornTail !== null || inspection.accessState === "corrupt") {
    throw new SessionError("SESSION_CORRUPT", "Canonical export requires a physically valid Journal.");
  }
  return Buffer.from(inspection.rawBytes);
}

function freezeInspection(value: SessionInspection): SessionInspection {
  return Object.freeze({ ...value, events: Object.freeze([...value.events]), diagnostics: Object.freeze([...value.diagnostics]) });
}
