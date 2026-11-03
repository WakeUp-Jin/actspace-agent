/** KaTeX 载入失败时，公式 widget 显示源码并标成错误（规范 §5：出错时显示原文）。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupViews, focusView, mountEditor } from "./markdown-editor-helpers";

vi.mock("../components/markdown-common/katex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/markdown-common/katex")>();
  return { ...actual, loadKatex: () => Promise.reject(new Error("chunk 载入失败")) };
});

afterEach(cleanupViews);

describe("KaTeX 载入失败", () => {
  it("行内公式显示 TeX 源码，标 is-error", async () => {
    const { view, parent } = mountEditor({ doc: "质能 $E=mc^2$ 方程\n\n末尾" });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await vi.waitFor(() => expect(parent.querySelector(".md-math.is-error")).not.toBeNull());
    expect(parent.querySelector(".md-math")?.textContent).toBe("E=mc^2");
  });

  it("块公式同样显示源码", async () => {
    const { view, parent } = mountEditor({ doc: "$$\na^2\n$$\n\n末尾" });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await vi.waitFor(() => expect(parent.querySelector(".md-math-block.is-error")).not.toBeNull());
    expect(parent.querySelector(".md-math-block")?.textContent).toBe("a^2");
  });
});
