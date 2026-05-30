import { describe, expect, it } from "vitest";
import { extractHtmlDocument } from "../md-to-html";

describe("extractHtmlDocument", () => {
  it("strips a ```html fenced block", () => {
    const raw = ["这是说明", "```html", "<!doctype html><html><body>hi</body></html>", "```"].join("\n");
    expect(extractHtmlDocument(raw)).toBe("<!doctype html><html><body>hi</body></html>");
  });

  it("strips an unlabeled ``` fenced block", () => {
    const raw = ["```", "<!doctype html><p>x</p>", "```"].join("\n");
    expect(extractHtmlDocument(raw)).toBe("<!doctype html><p>x</p>");
  });

  it("slices from <!doctype html> when there is leading prose", () => {
    const raw = "Sure, here you go:\n<!doctype html>\n<html></html>";
    expect(extractHtmlDocument(raw)).toBe("<!doctype html>\n<html></html>");
  });

  it("slices from <html> when no doctype is present", () => {
    const raw = "preamble <html lang=\"en\"><body></body></html>";
    expect(extractHtmlDocument(raw)).toBe("<html lang=\"en\"><body></body></html>");
  });

  it("falls back to the trimmed raw text when no HTML markers exist", () => {
    expect(extractHtmlDocument("  just text  ")).toBe("just text");
  });
});
