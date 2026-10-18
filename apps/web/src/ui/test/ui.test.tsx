import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Sheet } from "../Sheet";
import { Button } from "../Button";

function Nested() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <Button onClick={() => setOuter(true)}>打开</Button>
      <Sheet open={outer} onOpenChange={setOuter} title="外层">
        <Button onClick={() => setInner(true)}>再打开</Button>
        <Sheet open={inner} onOpenChange={setInner} title="内层"><p>内容</p></Sheet>
      </Sheet>
    </>
  );
}

it("closes only the top sheet on Escape and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  render(<Nested />);
  const trigger = screen.getByRole("button", { name: "打开" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "再打开" }));
  expect(screen.getByRole("dialog", { name: "内层" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "内层" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "外层" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});
