import type { RuntimeJsonValue, RuntimeTrajectoryNode } from "@actspace/shared/runtime-v2";
import type { TrajectorySourceBlock } from "./contract";

/** Field readers shared by the builder and the live split. */
export type Data = Readonly<Record<string, RuntimeJsonValue>>;

export const asRecord = (value: RuntimeJsonValue | undefined): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
export const dataOf = (node: RuntimeTrajectoryNode): Data => asRecord(node.data);
export const text = (value: RuntimeJsonValue | undefined): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};
export const pick = (data: Data, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = text(data[key]);
    if (value !== null && value !== "") return value;
  }
  return null;
};
export const json = (value: RuntimeJsonValue | undefined, max = 240): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    const result = JSON.stringify(value);
    return result.length > max ? `${result.slice(0, max - 1)}…` : result;
  } catch {
    return "";
  }
};

export function valueText(value: RuntimeJsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value))
    return value
      .map((item) => valueText(item))
      .filter(Boolean)
      .join("\n\n");
  const data = asRecord(value);
  return pick(data, ["text", "content", "message", "summary", "delta"]) ?? json(value);
}

export function sourceBlocks(
  value: RuntimeJsonValue | undefined,
  fallbackType = "text",
): readonly TrajectorySourceBlock[] {
  if (typeof value === "string") return value === "" ? [] : [{ type: fallbackType, content: value, raw: value }];
  if (!Array.isArray(value)) {
    const content = valueText(value);
    return content === "" ? [] : [{ type: fallbackType, content, raw: value }];
  }
  return value.flatMap((item) => {
    const data = asRecord(item);
    const type = pick(data, ["type", "kind"]) ?? fallbackType;
    // Older sessions carry a runtime-context block the loop appended for the model; it is not message content.
    if (type === "runtime-context") return [];
    const args = data.arguments ?? data.args ?? data.input;
    const content =
      type === "tool-call" && args !== undefined
        ? typeof args === "string"
          ? args
          : JSON.stringify(args)
        : valueText(item);
    const callId = pick(data, ["callId", "toolCallId"]);
    const toolName = pick(data, ["name", "toolName"]);
    return [
      {
        type,
        content,
        ...(callId === null ? {} : { callId }),
        ...(toolName === null ? {} : { toolName }),
        raw: item,
      },
    ];
  });
}
