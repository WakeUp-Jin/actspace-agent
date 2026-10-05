import { projectChatEvents, projectChatWindow } from "@actspace/client/sessions";
import { createMessageBlocks, type MessageBlock, type SessionRecord } from "@actspace/shared";
import type { DesktopBridge } from "@actspace/shared/desktop-bridge";
import { domainApi, getBridge } from "./bridge";

type Sessions = DesktopBridge["sessions"];

/** 原始 projection 的转发；需要 UI 结构时用下面的 createSession / forkSession / getSession。 */
export const sessionsApi = domainApi("sessions");

/** bridge 返回原始 projection，这里投影成 UI 使用的 SessionRecord（原先在 preload 里做）。 */
export async function createSession(input?: Parameters<Sessions["create"]>[0]): Promise<SessionRecord> {
  return projectChatWindow(await getBridge().sessions.create(input));
}

export async function forkSession(input: Parameters<Sessions["fork"]>[0]): Promise<SessionRecord> {
  return projectChatWindow(await getBridge().sessions.fork(input));
}

export async function getSession(input: Parameters<Sessions["get"]>[0]): Promise<SessionRecord | null> {
  const projection = await getBridge().sessions.get(input);
  return projection ? projectChatWindow(projection) : null;
}

export async function getSessionToolDetail(input: Parameters<Sessions["getToolDetail"]>[0]): Promise<MessageBlock[]> {
  const page = await getBridge().sessions.getToolDetail(input);
  return createMessageBlocks(projectChatEvents(page.snapshot, page.journal));
}
