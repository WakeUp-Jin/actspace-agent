/** Explicit component acceptance fixture. No IPC, credentials, or persisted state. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ModelPickerMenu } from "../../components/composer/ModelPicker";
import { Button } from "../../components/ui/Button";
import { Popover, PopoverTrigger } from "../../components/ui/Popover";
import { TooltipProvider } from "../../components/ui/Tooltip";
import type { ModelCatalog } from "../../target/use-model-catalog";
import "../../styles/index.css";

const catalog: ModelCatalog = {
  source: "local-providers",
  groups: [{ key: "fixture", label: "验收供应商", models: [{ id: "fixture-main", label: "普通模型" }] }],
};
const pinned = [{ id: "unconfigured", label: "未配置" }, { id: "follow", label: "跟随会话默认模型" }];
const initialTheme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = initialTheme;

function Preview() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("fixture-main");
  const [selections, setSelections] = useState(0);
  const [submissions, setSubmissions] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const selectedLabel = [...pinned, ...catalog.groups[0].models].find((model) => model.id === selected)!.label;
  return (
    <main className="min-h-screen bg-app-bg p-6 text-text-main">
      <h1 className="text-act-lg font-semibold">ModelPicker pinned 组件验收</h1>
      <p className="my-4 text-act-sm text-text-muted">独立代表场景；无模型请求，不写入设置或会话。</p>
      <Button variant="secondary" onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        setTheme(next);
      }}>切换主题（当前{theme === "light" ? "浅色" : "深色"}）</Button>
      <form className="mt-6" onSubmit={(event) => { event.preventDefault(); setSubmissions((count) => count + 1); }}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild><Button variant="secondary">选择模型：{selectedLabel}</Button></PopoverTrigger>
          {open ? <ModelPickerMenu catalog={catalog} pinned={pinned} selectedModelId={selected} side="bottom" onSelect={(id) => {
            setSelected(id);
            setSelections((count) => count + 1);
            setOpen(false);
          }} /> : null}
        </Popover>
      </form>
      <p role="status" className="mt-6 text-act-sm">当前选择：{selectedLabel}；选择次数：{selections}；意外表单提交：{submissions}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<TooltipProvider><Preview /></TooltipProvider>);
