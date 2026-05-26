import { describe, expect, it } from "vitest";
import { extractStringField } from "../partial-args";

describe("extractStringField", () => {
  it("returns null when field absent", () => {
    expect(extractStringField('{"foo":"bar"}', "path")).toBeNull();
  });

  it("extracts closed string field", () => {
    expect(extractStringField('{"path":"/foo/bar.md"}', "path")).toEqual({
      value: "/foo/bar.md",
      closed: true,
    });
  });

  it("extracts unclosed string field (streaming)", () => {
    expect(extractStringField('{"path":"/foo/bar', "path")).toEqual({
      value: "/foo/bar",
      closed: false,
    });
  });

  it("returns empty unclosed when opening quote present but no value", () => {
    expect(extractStringField('{"path":"', "path")).toEqual({
      value: "",
      closed: false,
    });
  });

  it("handles whitespace around colon", () => {
    expect(extractStringField('{"path"  :   "/x"}', "path")).toEqual({
      value: "/x",
      closed: true,
    });
  });

  it("handles JSON escape sequences", () => {
    const json = '{"path":"a\\"b\\\\c\\n\\t/d"}';
    expect(extractStringField(json, "path")).toEqual({
      value: 'a"b\\c\n\t/d',
      closed: true,
    });
  });

  it("handles unicode escape \\uXXXX", () => {
    const json = '{"name":"\\u4e2d\\u6587"}';
    expect(extractStringField(json, "name")).toEqual({
      value: "中文",
      closed: true,
    });
  });

  it("handles trailing backslash mid-stream", () => {
    expect(extractStringField('{"content":"abc\\', "content")).toEqual({
      value: "abc",
      closed: false,
    });
  });

  it("handles partial unicode escape mid-stream", () => {
    expect(extractStringField('{"name":"\\u4e', "name")).toEqual({
      value: "",
      closed: false,
    });
  });

  it("picks the requested field when multiple fields exist", () => {
    const json = '{"name":"first","path":"/p","note":"x"}';
    expect(extractStringField(json, "path")).toEqual({
      value: "/p",
      closed: true,
    });
  });

  it("extracts content field while path is already closed (write_file streaming)", () => {
    const partial = '{"path":"/tmp/夜雨.md","content":"# 夜雨\\n\\n半夜';
    expect(extractStringField(partial, "path")).toEqual({
      value: "/tmp/夜雨.md",
      closed: true,
    });
    expect(extractStringField(partial, "content")).toEqual({
      value: "# 夜雨\n\n半夜",
      closed: false,
    });
  });

  it("skips false-positive key fragments (key as substring of another key)", () => {
    const json = '{"file_path_extra":"x","path":"/real"}';
    expect(extractStringField(json, "path")).toEqual({
      value: "/real",
      closed: true,
    });
  });

  it("handles quoted key without colon (defensive)", () => {
    expect(extractStringField('{"path" "notValid"}', "path")).toBeNull();
  });
});
