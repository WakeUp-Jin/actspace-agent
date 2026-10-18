import { ChevronLeft } from "lucide-react";
import { useState, type ReactNode } from "react";
import { goBack, navigate } from "../../app/router";
import { setTheme, useTheme, type ThemePreference } from "../../app/theme";
import { useWide } from "../../app/use-wide";
import { useConnection, useConnectionStore } from "../../connection/use-connection";
import { Button } from "../../ui/Button";
import { HeaderButton, PageHeader } from "../../ui/PageHeader";
import { Pressable } from "../../ui/Pressable";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { cx } from "../../ui/cx";

const THEME_OPTIONS = [{ value: "system", label: "系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }] as const satisfies readonly { value: ThemePreference; label: string }[];

function statusText(status: ReturnType<typeof useConnection>["status"], maintenance: boolean): { text: string; tone: string } {
  if (status === "ready") return maintenance ? { text: "维护中", tone: "bg-warning" } : { text: "在线", tone: "bg-success" };
  if (status === "connecting" || status === "reconnecting") return { text: status === "connecting" ? "连接中…" : "重连中…", tone: "bg-warning pulse-dot" };
  return { text: "已断开", tone: "bg-text-faint" };
}

function Group({ title, children, caption }: { readonly title?: string; readonly children: ReactNode; readonly caption?: string }) {
  return (
    <section className="mx-4 mb-[22px]">
      {title ? <h2 className="m-0 mb-1.5 px-1 text-act-xs font-medium text-text-faint">{title}</h2> : null}
      <div className="inset-group">{children}</div>
      {caption ? <p className="m-0 mt-2 px-1 text-act-xs leading-normal text-text-faint">{caption}</p> : null}
    </section>
  );
}

function Line({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="inset-row flex min-h-12 items-center gap-2.5 px-3.5 text-act-base">
      <span className="flex-none">{label}</span>
      <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-act-md text-text-faint">{children}</span>
    </div>
  );
}

/** 设置：服务器 / 外观 / 关于，白底分组；最下面「断开并移除」。 */
export function SettingsPage() {
  const store = useConnectionStore();
  const state = useConnection();
  const wide = useWide();
  const { preference } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const status = statusText(state.status, state.maintenance);

  const forget = () => {
    setConfirming(false);
    store.forget();
    navigate({ name: "connect" }, { replace: true });
  };

  return (
    <div className="relative h-full overflow-hidden">
      <div className="no-scrollbar h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+64px)]">
        <div className={cx("mx-auto", wide && "max-w-[560px]")}>
          <Group title="服务器">
            <Line label="地址"><span className="truncate">{state.host?.url ?? "未连接"}</span></Line>
            <Line label="状态"><span aria-hidden className={cx("size-1.5 flex-none rounded-full", status.tone)} />{status.text}</Line>
            <Line label="本设备"><span className="truncate">{state.host?.name ?? "—"}</span></Line>
          </Group>
          <Group title="外观">
            <div className="inset-row flex min-h-12 items-center gap-2.5 px-3.5 text-act-base">
              <span className="flex-none">主题</span>
              <Segmented compact label="主题" value={preference} options={THEME_OPTIONS} onChange={setTheme} className="ml-auto" />
            </div>
          </Group>
          <Group title="关于">
            <Line label="网页版本"><span className="tabular-nums">{__APP_VERSION__}</span></Line>
          </Group>
          <Group caption="清除这台设备保存的凭据。要彻底吊销，在服务器上执行 host revoke。">
            <Pressable onClick={() => setConfirming(true)} className="min-h-12 px-3.5 text-center text-act-base font-medium text-danger">断开并移除</Pressable>
          </Group>
        </div>
      </div>
      <PageHeader title="设置" {...(wide ? {} : { left: <HeaderButton label="返回" onClick={goBack}><ChevronLeft size={20} aria-hidden /></HeaderButton> })} />
      <Sheet open={confirming} onOpenChange={setConfirming} title="断开并移除？" description="会清除这台设备上保存的服务器和登录凭据，之后需要重新配对。服务器上的会话不受影响。">
        <div className="grid gap-2 pb-1 pt-4">
          <Button variant="danger" block onClick={forget} className="rounded-act-pill">断开并移除</Button>
          <Button variant="ghost" block onClick={() => setConfirming(false)} className="rounded-act-pill">取消</Button>
        </div>
      </Sheet>
    </div>
  );
}
