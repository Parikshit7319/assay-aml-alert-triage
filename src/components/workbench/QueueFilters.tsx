"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { Icon } from "@/components/viz/Icon";
import { REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { useDismiss, useStoredString, writeStorage } from "./overlay";
import {
  activeFilterCount,
  BUILT_IN_VIEWS,
  DEFAULT_FILTERS,
  filtersEqual,
  parseSavedViews,
  RECOMMENDATION_VALUES,
  removeView,
  RISK_LABEL,
  SORT_LABEL,
  SORT_VALUES,
  STATUS_VALUES,
  TYPOLOGY_VALUES,
  upsertView,
  type QueueFilterState,
  type QueueSort,
  type RiskBand,
  type SavedView,
} from "./queue-filter";
import "./workbench.css";

export { DEFAULT_FILTERS, applyQueueFilters, countFacets, parseFilters, serializeFilters, type QueueFilterState } from "./queue-filter";

export interface QueueFiltersProps {
  value: QueueFilterState;
  onChange: (next: QueueFilterState) => void;
  /** Teammates for the assignee facet. */
  members?: { id: string; name: string }[];
  /** Counts keyed "facet:value", e.g. from countFacets(rows). Shown next to each option. */
  counts?: Partial<Record<string, number>>;
  /** localStorage key for saved views. */
  storageKey: string;
  /** Ref to the search input, so the "/" shortcut can focus it. */
  searchRef?: Ref<HTMLInputElement>;
  /** When given, announces "Showing N of M alerts" politely as filters change. */
  resultCount?: number;
  totalCount?: number;
}

const REC_OPTION_LABEL: Record<string, string> = { ...REC_LABEL, none: "Not triaged" };
const DUE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any due date" },
  { value: 0, label: "Due today or overdue" },
  { value: 5, label: "Due within 5 days" },
  { value: 10, label: "Due within 10 days" },
];
const RISK_SHORT: Record<Exclude<RiskBand, "all">, string> = { high: "High", medium: "Medium", low: "Low" };

function dueLabel(d: number | null): string {
  return DUE_OPTIONS.find((o) => o.value === d)?.label ?? `Due within ${d} days`;
}

function writeViews(key: string, views: SavedView[]): boolean {
  return writeStorage(key, JSON.stringify(views.map(({ id, name, filters }) => ({ id, name, filters }))));
}

function Facet({ label, active, children, wide }: { label: string; active?: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(pop, open, () => setOpen(false), btn);
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLElement>("input, button, select")?.focus();
  }, [open]);
  return (
    <div className="wb-facet">
      <button ref={btn} type="button" className={`wb-chip ${active ? "is-active" : ""}`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        {active && <span className="wb-chip__value">{active}</span>}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div ref={pop} id={id} className={`wb-popover ${wide ? "wb-popover--wide" : ""}`}>
          {children}
          <div className="wb-popover__foot">
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => {
                setOpen(false);
                btn.current?.focus();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckList({ legend, options, selected, onToggle, counts, facet }: { legend: string; options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void; counts?: Partial<Record<string, number>>; facet: string }) {
  return (
    <fieldset className="wb-checklist">
      <legend>{legend}</legend>
      {options.map((o) => {
        const n = counts?.[`${facet}:${o.value}`];
        return (
          <label key={o.value} className="wb-check">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
            <span className="wb-check__label">{o.label}</span>
            {n != null && <span className="wb-check__count num">{n}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

function RadioList<T extends string | number | null>({ legend, name, options, value, onPick, counts, facet }: { legend: string; name: string; options: { value: T; label: string }[]; value: T; onPick: (v: T) => void; counts?: Partial<Record<string, number>>; facet?: string }) {
  return (
    <fieldset className="wb-checklist">
      <legend>{legend}</legend>
      {options.map((o) => {
        const n = facet ? counts?.[`${facet}:${o.value}`] : undefined;
        return (
          <label key={String(o.value)} className="wb-check">
            <input type="radio" name={name} checked={value === o.value} onChange={() => onPick(o.value)} />
            <span className="wb-check__label">{o.label}</span>
            {n != null && <span className="wb-check__count num">{n}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * Search, faceted filters, active filter pills and saved views for the alert
 * queue. Controlled: hold QueueFilterState in the parent and run
 * applyQueueFilters on the rows. Saved views live in this browser.
 */
export function QueueFilters({ value, onChange, members = [], counts, storageKey, searchRef, resultCount, totalCount }: QueueFiltersProps) {
  const ids = useId();
  const stored = useStoredString(storageKey);
  // Used only when this browser blocks storage, so views still work for the visit.
  const [memoryViews, setMemoryViews] = useState<SavedView[] | null>(null);
  const views = useMemo(() => memoryViews ?? parseSavedViews(stored), [memoryViews, stored]);
  const [viewName, setViewName] = useState("");
  const [viewMsg, setViewMsg] = useState<string | null>(null);
  const setViews = (next: SavedView[]): boolean => {
    if (writeViews(storageKey, next)) {
      setMemoryViews(null);
      return true;
    }
    setMemoryViews(next);
    return false;
  };

  const set = (patch: Partial<QueueFilterState>) => onChange({ ...value, ...patch });
  const memberName = (id: string) => (id === "me" ? "Me" : id === "unassigned" ? "Unassigned" : (members.find((m) => m.id === id)?.name ?? "Former member"));

  const pills: { key: string; label: string; remove: () => void }[] = [
    ...value.status.map((v) => ({ key: `status:${v}`, label: `Status: ${STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v}`, remove: () => set({ status: value.status.filter((x) => x !== v) }) })),
    ...value.typology.map((v) => ({ key: `typology:${v}`, label: `Type: ${TYPOLOGY_LABEL[v as keyof typeof TYPOLOGY_LABEL] ?? v}`, remove: () => set({ typology: value.typology.filter((x) => x !== v) }) })),
    ...value.recommendation.map((v) => ({ key: `rec:${v}`, label: `Agent: ${REC_OPTION_LABEL[v] ?? v}`, remove: () => set({ recommendation: value.recommendation.filter((x) => x !== v) }) })),
    ...value.assignee.map((v) => ({ key: `assignee:${v}`, label: `Assignee: ${memberName(v)}`, remove: () => set({ assignee: value.assignee.filter((x) => x !== v) }) })),
    ...(value.risk !== "all" ? [{ key: "risk", label: `Risk: ${RISK_SHORT[value.risk]}`, remove: () => set({ risk: "all" }) }] : []),
    ...(value.dueWithinDays != null ? [{ key: "due", label: dueLabel(value.dueWithinDays), remove: () => set({ dueWithinDays: null }) }] : []),
  ];
  const activeCount = activeFilterCount(value);
  const dirty = activeCount > 0 || value.q.trim() !== "" || value.sort !== DEFAULT_FILTERS.sort;
  const allViews = [...BUILT_IN_VIEWS, ...views];
  const currentView = allViews.find((v) => filtersEqual(v.filters, value));

  const saveView = (e: FormEvent) => {
    e.preventDefault();
    const name = viewName.trim();
    if (!name) {
      setViewMsg("Name the view first.");
      return;
    }
    if (BUILT_IN_VIEWS.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      setViewMsg("That name belongs to a built-in view. Pick another.");
      return;
    }
    const next = upsertView(views, name, value, `view-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    const persisted = setViews(next);
    setViewName("");
    setViewMsg(persisted ? `Saved "${name}" in this browser.` : `Saved "${name}" for this visit only; this browser blocked local storage.`);
  };

  const deleteView = (v: SavedView) => {
    setViews(removeView(views, v.id));
    setViewMsg(`Deleted "${v.name}".`);
  };

  /** Chip text for a multi-select facet: the one value's name, or how many are picked. */
  const many = (list: string[]) => (list.length > 1 ? `${list.length} selected` : undefined);

  return (
    <div className="wb-filters" role="search" aria-label="Filter the alert queue">
      <div className="wb-filters__bar">
        <div className="wb-search">
          <label htmlFor={`${ids}-q`} className="visually-hidden">
            Search alerts
          </label>
          <Icon name="search" size={16} />
          <input
            id={`${ids}-q`}
            ref={searchRef}
            data-wb-search=""
            type="search"
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Customer, alert ID or rule"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="wb-kbd wb-search__kbd" aria-hidden="true">
            /
          </kbd>
        </div>

        <div className="wb-filters__facets">
          <Facet label="Status" active={value.status.length === 1 ? STATUS_LABEL[value.status[0] as keyof typeof STATUS_LABEL] : many(value.status)}>
            <CheckList legend="Status" facet="status" counts={counts} options={STATUS_VALUES.map((v) => ({ value: v, label: STATUS_LABEL[v] }))} selected={value.status} onToggle={(v) => set({ status: toggle(value.status, v) })} />
          </Facet>
          <Facet label="Type" active={value.typology.length === 1 ? TYPOLOGY_LABEL[value.typology[0] as keyof typeof TYPOLOGY_LABEL] : many(value.typology)}>
            <CheckList legend="Alert type" facet="typology" counts={counts} options={TYPOLOGY_VALUES.map((v) => ({ value: v, label: TYPOLOGY_LABEL[v] }))} selected={value.typology} onToggle={(v) => set({ typology: toggle(value.typology, v) })} />
          </Facet>
          <Facet label="Agent" active={value.recommendation.length === 1 ? REC_OPTION_LABEL[value.recommendation[0]] : many(value.recommendation)}>
            <CheckList
              legend="Agent recommends"
              facet="recommendation"
              counts={counts}
              options={RECOMMENDATION_VALUES.map((v) => ({ value: v, label: REC_OPTION_LABEL[v] }))}
              selected={value.recommendation}
              onToggle={(v) => set({ recommendation: toggle(value.recommendation, v) })}
            />
          </Facet>
          <Facet label="Assignee" active={value.assignee.length === 1 ? memberName(value.assignee[0]) : many(value.assignee)}>
            <CheckList
              legend="Assigned to"
              facet="assignee"
              counts={counts}
              options={[{ value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
              selected={value.assignee}
              onToggle={(v) => set({ assignee: toggle(value.assignee, v) })}
            />
          </Facet>
          <Facet label="Risk" active={value.risk !== "all" ? RISK_SHORT[value.risk] : undefined}>
            <RadioList<RiskBand> legend="Risk score" name={`${ids}-risk`} facet="risk" counts={counts} options={(["all", "high", "medium", "low"] as RiskBand[]).map((v) => ({ value: v, label: RISK_LABEL[v] }))} value={value.risk} onPick={(v) => set({ risk: v })} />
          </Facet>
          <Facet label="SLA" active={value.dueWithinDays != null ? (value.dueWithinDays === 0 ? "Overdue" : `${value.dueWithinDays} d`) : undefined}>
            <RadioList<number | null> legend="Internal SLA" name={`${ids}-due`} options={DUE_OPTIONS} value={value.dueWithinDays} onPick={(v) => set({ dueWithinDays: v })} />
          </Facet>
        </div>

        <div className="wb-filters__end">
          <label className="wb-sort">
            <span>Sort</span>
            <select value={value.sort} onChange={(e) => set({ sort: e.target.value as QueueSort })}>
              {SORT_VALUES.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <Facet label="Views" active={currentView?.name} wide>
            <div className="wb-views">
              <p className="wb-views__label">Built in</p>
              <ul className="wb-views__list">
                {BUILT_IN_VIEWS.map((v) => (
                  <li key={v.id}>
                    <button type="button" className="wb-views__apply" aria-pressed={currentView?.id === v.id} onClick={() => onChange({ ...v.filters })}>
                      {v.name}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="wb-views__label">Saved in this browser</p>
              {views.length ? (
                <ul className="wb-views__list">
                  {views.map((v) => (
                    <li key={v.id}>
                      <button type="button" className="wb-views__apply" aria-pressed={currentView?.id === v.id} onClick={() => onChange({ ...v.filters })}>
                        {v.name}
                      </button>
                      <button type="button" className="wb-icon-btn" onClick={() => deleteView(v)} aria-label={`Delete view ${v.name}`}>
                        <Icon name="x" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wb-views__empty">None yet. Set filters, then save them here.</p>
              )}
              <form className="wb-views__save" onSubmit={saveView}>
                <label htmlFor={`${ids}-vn`}>Save current filters as</label>
                <div className="wb-views__row">
                  <input id={`${ids}-vn`} type="text" value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={60} placeholder="e.g. My wires" />
                  <button type="submit" className="btn btn-outline btn-small">
                    Save
                  </button>
                </div>
              </form>
              <p className="wb-views__msg" aria-live="polite">
                {viewMsg}
              </p>
            </div>
          </Facet>
        </div>
      </div>

      {(pills.length > 0 || dirty) && (
        <div className="wb-pills">
          <ul aria-label="Active filters">
            {pills.map((p) => (
              <li key={p.key}>
                <span className="wb-pill">
                  {p.label}
                  <button type="button" onClick={p.remove} aria-label={`Remove filter ${p.label}`}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {dirty && (
            <button type="button" className="wb-linkbtn" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
              Clear all
            </button>
          )}
        </div>
      )}
      {resultCount != null && (
        <p className="wb-filters__count" aria-live="polite">
          {totalCount != null ? `Showing ${resultCount} of ${totalCount} alerts` : `${resultCount} alerts`}
          {currentView ? `, view: ${currentView.name}` : ""}
        </p>
      )}
    </div>
  );
}
