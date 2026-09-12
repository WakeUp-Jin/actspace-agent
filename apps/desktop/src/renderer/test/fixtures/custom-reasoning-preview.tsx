/** Explicit offline visual fixture; does not read credentials or call providers. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { CustomModelReasoning } from "@actspace/shared";
import { CustomModelReasoningFields } from "../../components/settings/CustomModelReasoningFields";
import "../../styles/index.css";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
function Preview() {
  const [value, setValue] = useState<CustomModelReasoning>({ mode: "auto" });
  return <main className="min-h-screen bg-app-bg px-8 py-10 text-text-main"><div className="mx-auto max-w-[680px]"><h1 className="mb-2 text-xl font-semibold">CheapRouter · gpt-6-astra</h1><p className="mb-6 text-sm text-text-muted">自定义模型推理配置 · 离线验收</p><CustomModelReasoningFields apiModel="gpt-6-astra" value={value} onChange={setValue} /></div></main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
