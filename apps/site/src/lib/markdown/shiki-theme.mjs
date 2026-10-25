// 站点自有 Shiki 主题：浅色纸面，配色同博客 M2 代码卡（DESIGN.md「博客正文 M2」）。
export const actspacePaperTheme = {
  name: "actspace-paper",
  type: /** @type {const} */ ("light"),
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#2f2d29",
  },
  tokenColors: [
    { settings: { foreground: "#2f2d29" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#a39f96" } },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "keyword.operator.logical.python"],
      settings: { foreground: "#7c4dcc" },
    },
    { scope: ["keyword.operator", "punctuation"], settings: { foreground: "#2f2d29" } },
    { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "markup.inline.raw"], settings: { foreground: "#2f7d5b" } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "constant.other", "support.constant"], settings: { foreground: "#b5651d" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call.generic"], settings: { foreground: "#2856b8" } },
    {
      scope: [
        "variable.other.property", "meta.object-literal.key", "support.type.property-name", "entity.other.attribute-name",
        "support.type", "support.class", "entity.name.type", "entity.name.class", "support.variable", "variable.language",
        "variable.parameter", "entity.name.tag.yaml",
      ],
      settings: { foreground: "#8a5a12" },
    },
    { scope: ["entity.name.tag"], settings: { foreground: "#7c4dcc" } },
    { scope: ["markup.heading", "markup.bold"], settings: { foreground: "#1d1c1a", fontStyle: "bold" } },
    { scope: ["markup.inserted"], settings: { foreground: "#2f7d5b" } },
    { scope: ["markup.deleted"], settings: { foreground: "#c74747" } },
  ],
};
