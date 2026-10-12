import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SessionSearch } from "../components/sidebar/SessionSearch";
import { overrideBridge } from "./helpers/bridge";

it("queries history beyond loaded sidebar items and replaces each bounded result page", async () => {
  const listPage = vi.fn().mockResolvedValueOnce({ items: [{ id: "first", title: "Old session" }], groups: [], nextCursor: "first" }).mockResolvedValueOnce({ items: [{ id: "second", title: "Another old session" }], groups: [] });
  overrideBridge({ "sessions.listPage": listPage });
  const select = vi.fn();
  render(<SessionSearch onSelect={select} />);
  fireEvent.click(screen.getByRole("button", { name: "搜索本机会话" }));
  fireEvent.change(screen.getByLabelText("搜索会话标题和片段"), { target: { value: "needle" } });
  await screen.findByRole("button", { name: "Old session" });
  expect(listPage).toHaveBeenCalledWith({ search: "needle", limit: 50 });
  fireEvent.click(screen.getByRole("button", { name: "下一页结果" }));
  await screen.findByRole("button", { name: "Another old session" });
  expect(screen.queryByRole("button", { name: "Old session" })).not.toBeInTheDocument();
  expect(listPage).toHaveBeenLastCalledWith({ search: "needle", limit: 50, after: "first" });
  fireEvent.click(screen.getByRole("button", { name: "Another old session" }));
  expect(select).toHaveBeenCalledWith("second", "Another old session");
  await waitFor(() => expect(screen.queryByLabelText("搜索会话标题和片段")).not.toBeInTheDocument());
});


it("shows Session fallback status while keeping results usable", async () => {
  overrideBridge({ "sessions.listPage": vi.fn().mockResolvedValue({items:[{id:"fallback",title:"Recovered title"}],groups:[],readModel:{source:"session",status:"fallback"}}) });
  render(<SessionSearch onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name:"搜索本机会话" }));
  fireEvent.change(screen.getByLabelText("搜索会话标题和片段"), {target:{value:"recovered"}});
  await screen.findByRole("button", {name:"Recovered title"});
  expect(screen.getByText("查询索引暂不可用，已从会话文件读取")).toBeInTheDocument();
});
