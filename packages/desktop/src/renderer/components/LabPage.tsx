import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { MoreHorizontal, Plus, X } from "lucide-react";
import {
  initialCompletedExperiments,
  initialLabCards,
  labStages,
  type LabCardView,
  type LabCompletedExperimentView,
  type LabCompletedFilter,
  type LabStageId,
} from "../fixtures/labFixture";

type LabDialog = "new" | "detail" | "completed" | null;
type CompletedTab = "all" | LabCompletedFilter;

const STAGE_ACTION_LABEL: Record<LabStageId, string> = {
  hypothesis: "进入实证验证",
  verification: "进入能力锻造",
  forge: "提交晋升评审",
  promotion: "批准候选",
};

const NEXT_STAGE: Partial<Record<LabStageId, LabStageId>> = {
  hypothesis: "verification",
  verification: "forge",
  forge: "promotion",
};

const STAGE_PROGRESS_META: Record<LabStageId, Pick<LabCardView, "tag" | "tagColor" | "meta" | "checks">> = {
  hypothesis: {
    tag: "草稿",
    tagColor: "#6b7280",
    meta: "User · 刚刚",
    checks: ["补能力缺口", "补初始假说", "定义成功标准"],
  },
  verification: {
    tag: "验证中",
    tagColor: "#d99a20",
    meta: "证据 0 · 刚刚",
    checks: ["补验证方案", "记录证据", "写出观察结论"],
  },
  forge: {
    tag: "候选",
    tagColor: "#287783",
    meta: "待锻造 · 刚刚",
    checks: ["定义产物类型", "补使用契约", "补验证方式"],
  },
  promotion: {
    tag: "待评审",
    tagColor: "#946400",
    meta: "中风险 · 3 检查",
    checks: ["确认证据", "确认风险", "等待人工批准"],
  },
};

const pageClass =
  "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-[18px] overflow-hidden bg-app-bg px-[34px] pb-[34px] pt-[calc(var(--window-chrome-strip-height)+18px)] text-text-main max-[1100px]:px-6 max-[760px]:px-4 max-[760px]:pb-[18px] max-[760px]:pt-[calc(var(--window-chrome-strip-height)+14px)]";
const topbarClass =
  "flex min-h-[58px] items-center gap-[18px] rounded-[14px] border border-line bg-white/90 px-[26px] max-[760px]:flex-col max-[760px]:items-start max-[760px]:p-4";
const actionsClass = "ml-auto flex gap-2.5 max-[760px]:ml-0 max-[760px]:w-full";
const secondaryButtonClass =
  "inline-flex h-8 min-w-[88px] items-center justify-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-medium text-text-muted transition hover:border-line-strong hover:bg-surface-subtle hover:text-text-main active:translate-y-px max-[760px]:flex-1";
const primaryButtonClass =
  "inline-flex h-8 min-w-[88px] items-center justify-center rounded-act-md border border-transparent bg-brand px-3 text-[13px] font-medium text-white transition hover:bg-brand-strong active:translate-y-px max-[760px]:flex-1";
const iconButtonClass =
  "grid h-8 w-8 place-items-center rounded-act-md border border-line bg-surface text-text-faint transition hover:border-line-strong hover:bg-surface-subtle hover:text-text-main";
const addButtonClass =
  "ml-auto grid h-7 w-7 place-items-center rounded-act-md border bg-white/70 text-text-faint transition hover:border-line-strong hover:bg-white hover:text-brand";
const boardClass =
  "grid min-h-0 grid-cols-[repeat(4,minmax(230px,1fr))] gap-3.5 overflow-hidden max-[1100px]:grid-cols-[repeat(4,minmax(260px,1fr))] max-[1100px]:overflow-x-auto";
const columnBaseClass =
  "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-[14px] border p-3.5";
const stageColumnClass: Record<LabStageId, string> = {
  hypothesis: "border-[#dbe6ff] bg-[#f3f7ff]",
  verification: "border-[#eadfd2] bg-[#fff7ef]",
  forge: "border-[#d6e8eb] bg-[#eefbfc]",
  promotion: "border-[#e9e1ce] bg-[#fffaf0]",
};
const stageAddBorderClass: Record<LabStageId, string> = {
  hypothesis: "border-[#dbe6ff]",
  verification: "border-[#eadfd2]",
  forge: "border-[#d6e8eb]",
  promotion: "border-[#e9e1ce]",
};
const stageEmptyClass: Record<LabStageId, string> = {
  hypothesis: "border-[#d5e1f8]",
  verification: "border-[#e6d9ca]",
  forge: "border-[#d2e4e7]",
  promotion: "border-[#e4dbc7]",
};
const cardClass =
  "relative grid min-h-[88px] grid-rows-[auto_auto_auto] justify-items-start rounded-act-md border border-line bg-surface p-3 text-left shadow-[0_1px_2px_rgba(31,45,61,0.05)] transition hover:-translate-y-px hover:border-line-strong hover:shadow-[0_8px_24px_rgba(31,45,61,0.08)]";
const selectedCardClass =
  "border-brand before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand";
const tagClass =
  "inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-[9px] text-[11px] font-medium";
const overlayClass = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/25 p-8";
const modalBaseClass =
  "grid max-h-[min(760px,calc(100vh-64px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-act-popover max-[760px]:max-h-[calc(100vh-28px)] max-[760px]:w-[calc(100vw-28px)]";
const modalWidthClass: Record<Exclude<LabDialog, null>, string> = {
  new: "w-[min(540px,calc(100vw-64px))]",
  detail: "w-[min(860px,calc(100vw-64px))]",
  completed: "w-[min(940px,calc(100vw-64px))]",
};
const modalHeadClass = "flex min-h-[78px] items-center gap-3 border-b border-line px-7";
const modalBodyClass = "min-h-0 overflow-auto px-7 py-[26px]";
const modalFootClass = "relative flex min-h-16 items-center gap-2.5 border-t border-line px-7";
const fieldClass = "grid gap-2";
const fieldControlClass =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] leading-[1.45] text-text-main outline-none transition focus:border-[#bfd4ff] focus:shadow-[0_0_0_3px_rgba(47,111,255,0.12)]";
const detailGridClass =
  "grid grid-cols-[minmax(0,1fr)_246px] gap-7 max-[1100px]:grid-cols-1";
const sideClass =
  "border-l border-line pl-6 max-[1100px]:border-l-0 max-[1100px]:border-t max-[1100px]:pl-0 max-[1100px]:pt-[22px]";
const menuClass =
  "absolute bottom-[calc(100%+8px)] right-0 z-[2] grid w-[132px] gap-0.5 rounded-[10px] border border-line bg-surface p-1.5 shadow-act-popover";
const menuButtonClass =
  "h-8 rounded-[7px] px-2.5 text-left text-[13px] text-text-muted hover:bg-surface-subtle hover:text-text-main";
const tabClass =
  "h-[30px] rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-text-muted";
const activeTabClass = "border-[#bfd4ff] bg-brand-soft text-brand-strong";
const historyGridClass = "grid grid-cols-[minmax(220px,1fr)_96px_120px_112px_64px] items-center gap-4";

function cloneCards(cards: LabCardView[]): LabCardView[] {
  return cards.map((card) => ({
    ...card,
    sections: card.sections.map((section) => ({ ...section })),
    checks: [...card.checks],
  }));
}

function tagStyle(color: string): CSSProperties {
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} 13%, #fff)`,
  };
}

function stageTitle(stageId: LabStageId): string {
  return labStages.find((stage) => stage.id === stageId)?.title ?? stageId;
}

function stageActionLabel(stageId: LabStageId): string {
  return STAGE_ACTION_LABEL[stageId];
}

function buildDraftCard(title: string, idea: string): LabCardView {
  return {
    id: `hyp-draft-${Date.now()}`,
    stage: "hypothesis",
    tag: "草稿",
    tagColor: "#6b7280",
    title,
    meta: "User · 刚刚",
    experiment: title,
    creator: "User",
    updatedAt: "刚刚",
    evidence: "0",
    artifacts: "0",
    sections: [
      {
        title: "问题 / 想法",
        body: idea,
      },
      {
        title: "下一步",
        body: "继续补齐能力缺口、初始假说和成功标准，然后再推进到实证验证。",
      },
    ],
    checks: [...STAGE_PROGRESS_META.hypothesis.checks],
  };
}

function makeCompletedExperiment(
  card: LabCardView,
  result: string,
  resultColor: string,
  filter: LabCompletedFilter,
  artifact = "none",
): LabCompletedExperimentView {
  return {
    id: `completed-${card.id}-${Date.now()}`,
    title: card.experiment || card.title,
    result,
    resultColor,
    filter,
    artifact,
    date: "刚刚",
    summary: `${card.title} 已从 Lab 当前矩阵移入已完成实验。`,
  };
}

export function LabPage() {
  const [cards, setCards] = useState<LabCardView[]>(() => cloneCards(initialLabCards));
  const [completedExperiments, setCompletedExperiments] = useState<LabCompletedExperimentView[]>(() => [
    ...initialCompletedExperiments,
  ]);
  const [selectedCardId, setSelectedCardId] = useState(initialLabCards[0]?.id ?? null);
  const [dialog, setDialog] = useState<LabDialog>(null);
  const [completedTab, setCompletedTab] = useState<CompletedTab>("all");
  const [selectedCompletedId, setSelectedCompletedId] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIdea, setNewIdea] = useState("");
  const [editDraft, setEditDraft] = useState<{ title: string; body: string } | null>(null);

  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;
  const filteredCompleted = completedExperiments.filter((item) => completedTab === "all" || item.filter === completedTab);
  const selectedCompleted = completedExperiments.find((item) => item.id === selectedCompletedId) ?? null;

  const groupedCards = useMemo(() => {
    return new Map(labStages.map((stage) => [stage.id, cards.filter((card) => card.stage === stage.id)]));
  }, [cards]);

  function closeDialog() {
    setDialog(null);
    setMoreMenuOpen(false);
    setEditDraft(null);
    setSelectedCompletedId(null);
  }

  function openDetail(card: LabCardView) {
    setSelectedCardId(card.id);
    setMoreMenuOpen(false);
    setEditDraft(null);
    setDialog("detail");
  }

  function resetNewExperimentForm() {
    setNewTitle("");
    setNewIdea("");
  }

  function createExperiment() {
    const title = newTitle.trim();
    const idea = newIdea.trim();
    if (!title || !idea) return;

    const draft = buildDraftCard(title, idea);
    setCards((current) => [draft, ...current]);
    setSelectedCardId(draft.id);
    resetNewExperimentForm();
    setDialog(null);
  }

  function saveCardEdit() {
    if (!selectedCard || !editDraft) return;
    const nextTitle = editDraft.title.trim();
    const nextBody = editDraft.body.trim();
    if (!nextTitle || !nextBody) return;

    setCards((current) =>
      current.map((card) => {
        if (card.id !== selectedCard.id) return card;
        const [firstSection, ...restSections] = card.sections;
        return {
          ...card,
          title: nextTitle,
          updatedAt: "刚刚",
          sections: [
            {
              title: firstSection?.title ?? "问题 / 想法",
              body: nextBody,
            },
            ...restSections,
          ],
        };
      }),
    );
    setEditDraft(null);
  }

  function advanceSelectedCard() {
    if (!selectedCard) return;

    if (selectedCard.stage === "promotion") {
      setCards((current) => current.filter((card) => card.id !== selectedCard.id));
      setCompletedExperiments((current) => [
        makeCompletedExperiment(selectedCard, "已晋升", "#16a36a", "promoted", selectedCard.artifacts === "0" ? "candidate" : "artifact"),
        ...current,
      ]);
      closeDialog();
      return;
    }

    const nextStage = NEXT_STAGE[selectedCard.stage];
    if (!nextStage) return;
    const stageMeta = STAGE_PROGRESS_META[nextStage];
    setCards((current) =>
      current.map((card) => {
        if (card.id !== selectedCard.id) return card;
        return {
          ...card,
          stage: nextStage,
          tag: stageMeta.tag,
          tagColor: stageMeta.tagColor,
          meta: stageMeta.meta,
          updatedAt: "刚刚",
          checks: [...stageMeta.checks],
          sections: [
            ...card.sections,
            {
              title: "阶段推进",
              body: `已从${stageTitle(card.stage)}推进到${stageTitle(nextStage)}。`,
            },
          ],
        };
      }),
    );
    setMoreMenuOpen(false);
  }

  function closeCardAs(result: "pause" | "cancel") {
    if (!selectedCard) return;
    const completed =
      result === "pause"
        ? makeCompletedExperiment(selectedCard, "已暂停", "#6b7280", "abandoned")
        : makeCompletedExperiment(selectedCard, "已废弃", "#6b7280", "abandoned");
    setCards((current) => current.filter((card) => card.id !== selectedCard.id));
    setCompletedExperiments((current) => [completed, ...current]);
    closeDialog();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (moreMenuOpen) {
        setMoreMenuOpen(false);
        return;
      }
      if (dialog) closeDialog();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, moreMenuOpen]);

  return (
    <main className={pageClass} aria-label="Lab 实验台">
      <header className={topbarClass}>
        <h1 className="m-0 text-2xl font-bold leading-none text-text-main">Lab</h1>
        <div className={actionsClass}>
          <button className={secondaryButtonClass} type="button" onClick={() => setDialog("completed")}>
            已完成实验
          </button>
          <button className={primaryButtonClass} type="button" onClick={() => setDialog("new")}>
            新实验
          </button>
        </div>
      </header>

      <section className={boardClass} aria-label="Lab experiments">
        {labStages.map((stage) => {
          const stageCards = groupedCards.get(stage.id) ?? [];
          const emptySlots = Math.max(0, 5 - stageCards.length);
          return (
            <section key={stage.id} className={`${columnBaseClass} ${stageColumnClass[stage.id]}`} aria-label={stage.title}>
              <header className="flex min-h-9 items-center gap-2">
                <h2 className="m-0 text-base font-semibold text-text-main">{stage.title}</h2>
                <span className="text-[13px] font-medium text-text-faint">{stageCards.length}</span>
                <button
                  className={`${addButtonClass} ${stageAddBorderClass[stage.id]}`}
                  type="button"
                  aria-label={stage.addLabel}
                  onClick={() => setDialog("new")}
                >
                  <Plus size={16} strokeWidth={2} />
                </button>
              </header>
              <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
                {stageCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`${cardClass} ${card.id === selectedCardId ? selectedCardClass : ""}`}
                    onClick={() => openDetail(card)}
                  >
                    <span className={tagClass} style={tagStyle(card.tagColor)}>
                      {card.tag}
                    </span>
                    <span className="mt-[9px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold leading-[1.35] text-text-main">
                      {card.title}
                    </span>
                    <span className="mt-[7px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[1.3] text-text-faint">
                      {card.meta}
                    </span>
                  </button>
                ))}
                {Array.from({ length: emptySlots }, (_, index) => (
                  <div
                    key={`${stage.id}-empty-${index}`}
                    className={`min-h-[88px] rounded-act-md border border-dashed bg-white/40 ${stageEmptyClass[stage.id]}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      {dialog === "new" ? (
        <div className={overlayClass} role="presentation" onClick={closeDialog}>
          <section
            className={`${modalBaseClass} ${modalWidthClass.new}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-new-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={modalHeadClass}>
              <h2 id="lab-new-title" className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[22px] font-semibold text-text-main">
                新实验
              </h2>
              <button className={iconButtonClass} type="button" aria-label="关闭" onClick={closeDialog}>
                <X size={16} strokeWidth={2} />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createExperiment();
              }}
            >
              <div className={modalBodyClass}>
                <label className={fieldClass}>
                  <span className="text-[13px] font-semibold text-text-main">标题</span>
                  <input
                    className={fieldControlClass}
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.currentTarget.value)}
                    autoFocus
                    required
                  />
                </label>
                <label className={`${fieldClass} mt-[18px]`}>
                  <span className="text-[13px] font-semibold text-text-main">问题 / 想法</span>
                  <textarea
                    className={`${fieldControlClass} min-h-[124px] resize-y`}
                    value={newIdea}
                    onChange={(event) => setNewIdea(event.currentTarget.value)}
                    required
                  />
                </label>
              </div>
              <footer className={modalFootClass}>
                <button className={secondaryButtonClass} type="button" onClick={closeDialog}>
                  取消
                </button>
                <button className={primaryButtonClass} type="submit">
                  创建
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {dialog === "detail" && selectedCard ? (
        <div className={overlayClass} role="presentation" onClick={closeDialog}>
          <section
            className={`${modalBaseClass} ${modalWidthClass.detail}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-card-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={modalHeadClass}>
              <h2 id="lab-card-title" className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[22px] font-semibold text-text-main">
                {selectedCard.title}
              </h2>
              <span className={`${tagClass} shrink-0`} style={tagStyle(selectedCard.tagColor)}>
                {selectedCard.tag}
              </span>
              <button className={iconButtonClass} type="button" aria-label="关闭" onClick={closeDialog}>
                <X size={16} strokeWidth={2} />
              </button>
            </header>
            <div className={modalBodyClass}>
              <div className={detailGridClass}>
                <section>
                  {editDraft ? (
                    <div className="grid gap-[18px]">
                      <label className={fieldClass}>
                        <span className="text-[13px] font-semibold text-text-main">标题</span>
                        <input
                          className={fieldControlClass}
                          value={editDraft.title}
                          onChange={(event) => setEditDraft({ ...editDraft, title: event.currentTarget.value })}
                        />
                      </label>
                      <label className={fieldClass}>
                        <span className="text-[13px] font-semibold text-text-main">{selectedCard.sections[0]?.title ?? "内容"}</span>
                        <textarea
                          className={`${fieldControlClass} min-h-[124px] resize-y`}
                          value={editDraft.body}
                          onChange={(event) => setEditDraft({ ...editDraft, body: event.currentTarget.value })}
                        />
                      </label>
                    </div>
                  ) : (
                    selectedCard.sections.map((section) => (
                      <section key={`${selectedCard.id}-${section.title}`} className="mt-[25px] first:mt-0">
                        <h3 className="mb-[9px] mt-0 text-[13px] font-semibold text-text-main">{section.title}</h3>
                        <p className="m-0 text-[13px] leading-[1.65] text-text-muted">{section.body}</p>
                      </section>
                    ))
                  )}
                  <section className="mt-[25px]">
                    <h3 className="mb-[9px] mt-0 text-[13px] font-semibold text-text-main">检查项</h3>
                    <ul className="m-0 grid list-none gap-2.5 p-0">
                      {selectedCard.checks.map((check) => (
                        <li key={check} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 text-[13px] leading-[1.45] text-text-muted">
                          <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-[5px] bg-brand-soft text-[11px] font-bold text-brand-strong">
                            ✓
                          </span>
                          {check}
                        </li>
                      ))}
                    </ul>
                  </section>
                </section>
                <aside className={sideClass}>
                  {[
                    ["所属实验", selectedCard.experiment],
                    ["阶段", stageTitle(selectedCard.stage)],
                    ["创建者", selectedCard.creator],
                    ["更新时间", selectedCard.updatedAt],
                    ["关联证据", selectedCard.evidence],
                    ["关联产物", selectedCard.artifacts],
                  ].map(([label, value]) => (
                    <div key={label} className="mt-[18px] first:mt-0">
                      <span className="block text-[11px] text-text-subtle">{label}</span>
                      <strong className="mt-[5px] block text-[13px] font-medium text-text-main">{value}</strong>
                    </div>
                  ))}
                </aside>
              </div>
            </div>
            <footer className={modalFootClass}>
              {editDraft ? (
                <>
                  <button className={secondaryButtonClass} type="button" onClick={() => setEditDraft(null)}>
                    取消编辑
                  </button>
                  <button className={primaryButtonClass} type="button" onClick={saveCardEdit}>
                    保存
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={secondaryButtonClass}
                    type="button"
                    onClick={() => setEditDraft({ title: selectedCard.title, body: selectedCard.sections[0]?.body ?? "" })}
                  >
                    编辑
                  </button>
                  <button className={primaryButtonClass} type="button" onClick={advanceSelectedCard}>
                    {stageActionLabel(selectedCard.stage)}
                  </button>
                  <div className="relative">
                    <button
                      className={iconButtonClass}
                      type="button"
                      aria-label="更多操作"
                      aria-haspopup="menu"
                      aria-expanded={moreMenuOpen}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMoreMenuOpen((open) => !open);
                      }}
                    >
                      <MoreHorizontal size={16} strokeWidth={2} />
                    </button>
                    {moreMenuOpen ? (
                      <div className={menuClass} role="menu">
                        <button className={menuButtonClass} type="button" role="menuitem" onClick={() => closeCardAs("pause")}>
                          暂停
                        </button>
                        <button className={`${menuButtonClass} text-danger`} type="button" role="menuitem" onClick={() => closeCardAs("cancel")}>
                          取消
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </footer>
          </section>
        </div>
      ) : null}

      {dialog === "completed" ? (
        <div className={overlayClass} role="presentation" onClick={closeDialog}>
          <section
            className={`${modalBaseClass} ${modalWidthClass.completed}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-completed-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={modalHeadClass}>
              <h2 id="lab-completed-title" className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[22px] font-semibold text-text-main">
                已完成实验
              </h2>
              <button className={iconButtonClass} type="button" aria-label="关闭" onClick={closeDialog}>
                <X size={16} strokeWidth={2} />
              </button>
            </header>
            <div className={modalBodyClass}>
              <div className="mb-[22px] flex gap-2.5" role="tablist" aria-label="completed filters">
                {[
                  ["all", "全部"],
                  ["promoted", "已晋升"],
                  ["rejected", "已拒绝"],
                  ["abandoned", "已废弃"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={completedTab === value}
                    className={`${tabClass} ${completedTab === value ? activeTabClass : ""}`}
                    onClick={() => setCompletedTab(value as CompletedTab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                <div className={`${historyGridClass} px-4 text-xs font-medium text-text-faint`}>
                  <span>实验标题</span>
                  <span>结果</span>
                  <span>产物</span>
                  <span>完成时间</span>
                  <span />
                </div>
                {filteredCompleted.map((item) => (
                  <div
                    key={item.id}
                    className={`${historyGridClass} min-h-[54px] rounded-[10px] border border-line bg-surface px-4 text-[13px] text-text-faint hover:border-line-strong hover:bg-surface-subtle`}
                  >
                    <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-text-main">
                      {item.title}
                    </strong>
                    <span className={tagClass} style={tagStyle(item.resultColor)}>
                      {item.result}
                    </span>
                    <span>{item.artifact}</span>
                    <span>{item.date}</span>
                    <button
                      className="text-left text-[13px] font-medium text-brand"
                      type="button"
                      aria-label={`查看 ${item.title}`}
                      onClick={() => setSelectedCompletedId(item.id)}
                    >
                      查看
                    </button>
                  </div>
                ))}
              </div>
              {selectedCompleted ? (
                <aside
                  className="mt-4 rounded-[10px] border border-line bg-surface-subtle px-4 py-3.5"
                  aria-label={`${selectedCompleted.title} 详情`}
                >
                  <strong className="text-[13px] font-semibold text-text-main">{selectedCompleted.title}</strong>
                  <p className="mb-0 mt-1.5 text-[13px] leading-[1.55] text-text-muted">{selectedCompleted.summary}</p>
                </aside>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
