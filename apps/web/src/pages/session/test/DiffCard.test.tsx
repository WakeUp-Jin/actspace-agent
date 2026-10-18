import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffCard } from "../blocks/DiffCard";

const lines = (count: number) => Array.from({ length: count }, (_, index) => `+line ${index + 1}`).join("\n");
const card = (count: number) => <DiffCard kind="edit_diff" filePath="/w/a.ts" additions={count} deletions={0} diff={lines(count)} />;
const expand = () => userEvent.click(screen.getByRole("button", { expanded: false }));

it("shows a collapsed change row with counts", () => {
  render(card(3));
  expect(screen.getByText("编辑")).toBeInTheDocument();
  expect(screen.getByText("a.ts")).toBeInTheDocument();
  expect(screen.getByText("+3")).toBeInTheDocument();
  expect(screen.queryByText("line 1")).toBeNull();
});

it("shows 12 lines without a fold", async () => {
  render(card(12));
  await expand();
  expect(screen.getByText("line 12")).toBeInTheDocument();
  expect(screen.queryByText(/还有/)).toBeNull();
});

it("folds at 13 lines and expands on tap", async () => {
  render(card(13));
  await expand();
  expect(screen.queryByText("line 13")).toBeNull();
  await userEvent.click(screen.getByText("还有 1 行"));
  expect(screen.getByText("line 13")).toBeInTheDocument();
  expect(screen.queryByText(/还有/)).toBeNull();
});

it("marks additions and deletions", async () => {
  const { container } = render(<DiffCard kind="edit_diff" filePath="a" additions={1} deletions={1} diff={"-old\n+new"} />);
  await expand();
  expect(container.querySelector('[data-kind="del"]')?.textContent).toContain("old");
  expect(container.querySelector('[data-kind="add"]')?.textContent).toContain("new");
});
