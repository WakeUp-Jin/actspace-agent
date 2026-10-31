import { render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { createMockSession } from "../mock/mock-db";
import { SessionProjectionProvider, SessionProjectionScope, useOptionalSessionProjection } from "../session/SessionProjectionContext";
import { setupBridge } from "./helpers/bridge";

function Probe({ label }: { label: string }) {
  const projection = useOptionalSessionProjection();
  return <p data-testid={label}>{`${projection?.sessionId ?? "none"}|${projection?.cell?.snapshot?.metadata.title ?? ""}|${projection?.store.selectedSessionId ?? ""}`}</p>;
}

it("gives a side chat scope its own session without changing the selected one", async () => {
  const { db } = setupBridge();
  const main = createMockSession(db, { title: "主会话" });
  const side = createMockSession(db, { title: "侧边对话" });

  render(
    <SessionProjectionProvider sessionId={main.id}>
      <Probe label="outer" />
      <SessionProjectionScope sessionId={side.id}>
        <Probe label="scope" />
      </SessionProjectionScope>
    </SessionProjectionProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("outer")).toHaveTextContent(`${main.id}|主会话|${main.id}`));
  await waitFor(() => expect(screen.getByTestId("scope")).toHaveTextContent(`${side.id}|侧边对话|${main.id}`));
});

it("renders its children unchanged without an outer projection", () => {
  render(
    <SessionProjectionScope sessionId="side">
      <Probe label="bare" />
    </SessionProjectionScope>,
  );
  expect(screen.getByTestId("bare")).toHaveTextContent("none||");
});
