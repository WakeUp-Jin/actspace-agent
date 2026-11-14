import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { WorkspaceFileApplication } from "@actspace/shared";

/** 关联应用的图标，图片缺失或加载失败时退回通用图标。交付卡的「用应用打开」下拉和打不开时的兜底对话框共用。 */
export function ApplicationIcon({ source, size = 14 }: { source: string | undefined; size?: number }) {
  const [failed, setFailed] = useState(false);
  return !source || failed ? (
    <ExternalLink size={size} aria-hidden="true" />
  ) : (
    <img
      src={source}
      width={size}
      height={size}
      className="flex-none object-contain"
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/** 一行关联应用：图标加名称；系统默认的那项带「（默认）」。 */
export function ApplicationLabel({ app, defaultId }: { app: WorkspaceFileApplication; defaultId?: string }) {
  return (
    <>
      <ApplicationIcon key={app.iconDataUrl} source={app.iconDataUrl} />
      <span className="min-w-0 truncate">{app.id === defaultId ? `${app.name}（默认）` : app.name}</span>
    </>
  );
}
