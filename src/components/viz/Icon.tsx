import type { ReactNode } from "react";

/**
 * Assay's own stroke icon set. 24 by 24 grid, 1.75 stroke, round caps and joins,
 * drawn on the same 3 to 21 live area so every glyph carries the same weight.
 */
export type IconName =
  | "structuring"
  | "funnel"
  | "wire"
  | "watchlist"
  | "payroll"
  | "seasonal"
  | "other"
  | "close"
  | "escalate"
  | "review"
  | "lock"
  | "abstain"
  | "search"
  | "filter"
  | "user"
  | "users"
  | "comment"
  | "download"
  | "upload"
  | "settings"
  | "play"
  | "pause"
  | "keyboard"
  | "shield"
  | "database"
  | "api"
  | "webhook"
  | "clock"
  | "check"
  | "x"
  | "chevronRight"
  | "chevronDown"
  | "external"
  | "menu"
  | "bell"
  | "spark"
  | "eye"
  | "key"
  | "file"
  | "chart"
  | "graph"
  | "plus"
  | "arrowRight";

const dot = (x: number, y: number) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="currentColor" stroke="none" />;

const GLYPHS: Record<IconName, ReactNode> = {
  // a row of equal deposits held just under a limit line
  structuring: (
    <>
      <path d="M3 5.5h18" />
      <path d="M6 20v-10.5M10 20v-10.5M14 20v-10.5M18 20v-10.5" />
    </>
  ),
  // many sources converging, one exit
  funnel: (
    <>
      <path d="M3.5 5l6.5 7M3.5 12h6.5M3.5 19l6.5-7" />
      <path d="M10 12h10.5M17.5 9l3 3-3 3" />
    </>
  ),
  // cross-border: a globe
  wire: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z" />
    </>
  ),
  // a name list under a lens
  watchlist: (
    <>
      <path d="M4 6h12M4 11h7M4 16h5" />
      <circle cx="15.5" cy="15" r="3.5" />
      <path d="M18 17.5l2.5 2.5" />
    </>
  ),
  // a banknote
  payroll: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 12h.01M17.5 12h.01" />
    </>
  ),
  // a leaf, for the turn of a season
  seasonal: (
    <>
      <path d="M5 19.5C5 11 10.5 4.5 19.5 4.5 19.5 13.5 13 19.5 5 19.5z" />
      <path d="M5 19.5l8.5-8.5" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      {dot(8, 12)}
      {dot(12, 12)}
      {dot(16, 12)}
    </>
  ),
  close: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.5 2.5 4.9-5.4" />
    </>
  ),
  escalate: <path d="M6 12.5l6-6 6 6M6 18.5l6-6 6 6" />,
  review: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9.5 3h5v3h-5z" />
      <path d="M8.5 11h7M8.5 15h4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2" />
    </>
  ),
  abstain: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  filter: <path d="M4 6.5h16M7 12h10M10 17.5h4" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3 19.5c.5-3.1 2.9-5.2 6-5.2s5.5 2.1 6 5.2" />
      <path d="M15.5 5.4a3.25 3.25 0 0 1 0 6.2M17.3 14.6c2 .7 3.3 2.4 3.7 4.9" />
    </>
  ),
  comment: (
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-7.5L7 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5z" />
  ),
  download: (
    <>
      <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
      <path d="M4 15.5v2.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 14.5v-11M7.5 8L12 3.5 16.5 8" />
      <path d="M4 15.5v2.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
    </>
  ),
  // two sliders
  settings: (
    <>
      <path d="M3.5 7.5h9M17.5 7.5h3M3.5 16.5h3M11.5 16.5h9" />
      <circle cx="15" cy="7.5" r="2.5" />
      <circle cx="9" cy="16.5" r="2.5" />
    </>
  ),
  play: <path d="M8 5.2v13.6L18.5 12z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M10.33 10h.01M13.67 10h.01M17 10h.01M8 14h8" />
    </>
  ),
  shield: <path d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.1z" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  // braces
  api: (
    <>
      <path d="M8.5 4.5c-1.9 0-2.8.8-2.8 2.6v2.3c0 1.3-.6 2.1-2.2 2.6 1.6.5 2.2 1.3 2.2 2.6v2.3c0 1.8.9 2.6 2.8 2.6" />
      <path d="M15.5 4.5c1.9 0 2.8.8 2.8 2.6v2.3c0 1.3.6 2.1 2.2 2.6-1.6.5-2.2 1.3-2.2 2.6v2.3c0 1.8-.9 2.6-2.8 2.6" />
    </>
  ),
  // an event leaving a node and calling back
  webhook: (
    <>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <path d="M9 17.5h6.5a4.25 4.25 0 0 0 0-8.5H9.5" />
      <path d="M12.5 6l-3 3 3 3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10.2 21a2 2 0 0 0 3.6 0" />
    </>
  ),
  spark: (
    <>
      <path d="M11 3.5l1.7 5 5 1.7-5 1.7-1.7 5-1.7-5-5-1.7 5-1.7z" />
      <path d="M18.5 15.5v5M16 18h5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M10.9 12.6L19.5 4M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h8l4.5 4.5v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V8h4.5M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8.5 16v-4M12.5 16V8M16.5 16v-6" />
    </>
  ),
  graph: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="7" r="2" />
      <circle cx="17" cy="19" r="2" />
      <path d="M10.1 10.4L6.5 7.3M14 10.6l3.4-2.4M13.5 14l2.3 3.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
};

export function Icon({ name, size = 18, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      style={{ flex: "none", display: "inline-block", verticalAlign: "middle" }}
    >
      {title ? <title>{title}</title> : null}
      {GLYPHS[name]}
    </svg>
  );
}

export const TYPOLOGY_ICON: Record<
  "structuring" | "funnel_account" | "high_risk_wire" | "sanctions_name" | "payroll_pattern" | "seasonal_cash" | "other",
  IconName
> = {
  structuring: "structuring",
  funnel_account: "funnel",
  high_risk_wire: "wire",
  sanctions_name: "watchlist",
  payroll_pattern: "payroll",
  seasonal_cash: "seasonal",
  other: "other",
};
