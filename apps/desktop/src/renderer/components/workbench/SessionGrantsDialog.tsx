import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { SessionGrant } from "@actspace/shared/runtime-v2";
import { sessionsApi } from "../../api/sessions";
import { useRunTargetContext } from "../../target/run-target-context";
import { useHostDirectory } from "../../target/host-directory";
import { Button } from "../ui/Button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/Dialog";

function pathOf(grant: SessionGrant) {
  return grant.selector.kind === "exact" ? grant.selector.canonicalPath : grant.selector.kind === "subtree" ? grant.selector.canonicalRoot : `${grant.selector.prefix.join(" ")} @ ${grant.selector.cwdRoot}`;
}

/** Host facts are fetched on opening and after every revoke. No renderer grant cache. */
export function SessionGrantsDialog({ sessionId, onClose, onChanged, returnFocus }: {
  sessionId: string; onClose: () => void; onChanged: () => void | Promise<void>; returnFocus: RefObject<HTMLButtonElement>;
}) {
  const { target } = useRunTargetContext();
  const hostId = target.kind === "remote" ? target.hostId : null;
  const connected = useHostDirectory(snapshot => snapshot.hosts.some(host => host.hostId === hostId && host.state === "connected"));
  const offline = Boolean(hostId && !connected);
  const [grants, setGrants] = useState<readonly SessionGrant[] | null>(null);
  const [error, setError] = useState<string>();
  const [revoking, setRevoking] = useState<string>();
  const active = useRef(true), busy = useRef(false), revision = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; revision.current++; }; }, []);
  const load = useCallback(async () => {
    const version = ++revision.current;
    setError(undefined);
    try {
      const page = await sessionsApi.get({ sessionId });
      if (!page || page.snapshot.sessionId !== sessionId) throw new Error("会话授权不可用");
      if (active.current && version === revision.current) setGrants(page.snapshot.sessionGrants.filter(grant => grant.sessionId === sessionId));
    } catch (cause) {
      if (active.current && version === revision.current) setError(cause instanceof Error ? cause.message : "读取授权失败");
    }
  }, [sessionId]);
  useEffect(() => { if (!offline) void load(); }, [load, offline]);
  const revoke = async (grantId: string) => {
    if (busy.current || offline) return;
    busy.current = true; setRevoking(grantId); setError(undefined);
    try {
      const result = await sessionsApi.revokeGrant({ sessionId, grantId });
      if (!result.ok) throw new Error(result.error || "撤销失败");
      if (!active.current) return;
      await load();
      await onChanged();
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "撤销失败");
    } finally {
      busy.current = false;
      if (active.current) setRevoking(undefined);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent returnFocus={returnFocus} size="md" withDescription>
      <DialogHeader><DialogTitle>本会话授权</DialogTitle><DialogDescription>撤销后，下一次权限检查将重新判断。已经执行的操作不受影响。</DialogDescription></DialogHeader>
      <DialogBody className="space-y-3">
        {offline ? <p role="status">Host 已断开，重连后可管理授权。</p> : null}
        {error ? <div role="alert" className="text-danger">{error}<Button variant="ghost" size="sm" onClick={() => void load()} disabled={offline || Boolean(revoking)}>重试</Button></div> : null}
        {!grants && !error && !offline ? <p role="status">正在读取授权…</p> : null}
        {grants?.length === 0 ? <p className="text-text-muted">本会话没有有效授权</p> : null}
        {grants?.map(grant => <div key={grant.grantId} className="flex min-w-0 items-start gap-3 rounded-act-sm border border-line p-3">
          <div className="min-w-0 flex-1"><div className="break-all text-act-sm text-text-main">{pathOf(grant)}</div><div className="mt-1 text-act-xs text-text-muted">{grant.access === "write" ? "写入" : grant.access === "execute" ? "执行" : "读取"} · {grant.selector.kind === "subtree" ? "目录及子项" : grant.selector.kind === "exact" ? "精确路径" : "命令前缀"} · 本会话</div></div>
          <Button variant="ghost" size="sm" busy={revoking === grant.grantId} disabled={offline || Boolean(revoking)} onClick={() => void revoke(grant.grantId)}>撤销</Button>
        </div>)}
      </DialogBody>
    </DialogContent>
  </Dialog>;
}
