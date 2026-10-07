import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../ui/Button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/Dialog";
import { IconButton } from "../../ui/IconButton";
import { ActorAvatar } from "../avatar/ActorAvatar";
import { rosterActors, splitDirs } from "../model/selectors";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";

const LABEL_CLASS = "text-act-xs font-medium text-text-muted";
const HINT_CLASS = "font-normal text-text-faint";
const INPUT_CLASS =
  "w-full rounded-act-md border border-line bg-surface px-2.5 py-[7px] text-act-sm text-text-main outline-none placeholder:text-text-faint focus:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const CREW_IDLE_CLASS = "border-line bg-surface text-text-muted hover:border-line-strong";
const CREW_ON_CLASS = "border-text-main bg-selected text-text-main";

function NewSpaceForm({ onDone }: { onDone: (id: string) => void }) {
  const actors = useSpaceDemoSelector((s) => s.actors);
  const { createSpace } = useSpaceDemoActions();
  const roster = rosterActors(actors);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [dirs, setDirs] = useState("");
  const [crew, setCrew] = useState<string[]>(() => roster.slice(0, 2).map((a) => a.id));

  const toggle = (id: string) => setCrew((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const submit = () => onDone(createSpace({ name, goal, dirs: splitDirs(dirs), crew }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => { event.preventDefault(); submit(); }}
    >
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>名字</span>
        <input autoFocus className={INPUT_CLASS} value={name} placeholder="比如：支付链路提速" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>要解决的问题</span>
        <input className={INPUT_CLASS} value={goal} placeholder="一句话，比如：把 checkout 的 p75 降到 200ms 以内" onChange={(e) => setGoal(e.target.value)} />
      </label>
      <div className="flex flex-col gap-1.5" role="group" aria-label="成员">
        <span className={LABEL_CLASS}>成员 <small className={HINT_CLASS}>从名册里选，之后也能加</small></span>
        <div className="flex flex-wrap gap-1.5">
          {roster.map((a) => {
            const on = crew.includes(a.id);
            return (
              <button
                key={a.id} type="button" aria-pressed={on} onClick={() => toggle(a.id)}
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-act-md border pl-1 pr-2.5 text-act-xs transition-colors duration-(--motion-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring ${on ? CREW_ON_CLASS : CREW_IDLE_CLASS}`}
              >
                <ActorAvatar id={a.id} actor={a} size={22} />
                {a.name}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>相关目录 <small className={HINT_CLASS}>选填</small></span>
        <input className={INPUT_CLASS} value={dirs} placeholder="payments-api, checkout-web" onChange={(e) => setDirs(e.target.value)} />
      </label>
      <DialogFooter className="mt-1">
        <DialogClose asChild><Button variant="secondary" size="md">取消</Button></DialogClose>
        <Button type="submit" variant="primary" size="md">创建</Button>
      </DialogFooter>
    </form>
  );
}

/** 新建 Space：名字、要解决的问题、成员（默认选名册前两个）、相关目录。创建后先通知 `onCreated`，再关闭。 */
export function NewSpaceDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (spaceId: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" closeOnOutsideClick={false} className="flex max-h-[calc(100vh_-_64px)] flex-col gap-4 p-5">
        <DialogHeader>
          <DialogTitle className="text-act-lg font-semibold text-text-main">新建 Space</DialogTitle>
          <DialogClose asChild>
            <IconButton label="关闭" tooltip={false} size="sm"><X size={14} aria-hidden="true" /></IconButton>
          </DialogClose>
        </DialogHeader>
        <DialogBody>
          <NewSpaceForm onDone={(id) => { onCreated?.(id); onOpenChange(false); }} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
