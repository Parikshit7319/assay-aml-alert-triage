import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/admin";
import { fillDays, rate, type DayPoint } from "@/lib/analytics";
import { getDb } from "@/lib/db/client";
import { analyticsEvents } from "@/lib/db/schema";
import { DAY } from "@/lib/util";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Site analytics", robots: { index: false } };

const DAYS = 30;
const n = (x: number) => x.toLocaleString("en-US");
const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1).replace(/\.0$/, "")}%`);

function DailyChart({ points }: { points: DayPoint[] }) {
  const W = 760;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 40 };
  const max = Math.max(1, ...points.map((p) => p.views));
  const step = (W - pad.left - pad.right) / points.length;
  const bw = Math.max(3, step * 0.72);
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const totalViews = points.reduce((s, p) => s + p.views, 0);
  const busiest = points.reduce((a, b) => (b.views > a.views ? b : a), points[0]);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="adm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="adm-daily-t adm-daily-d">
        <title id="adm-daily-t">{`Page views and visitors per day, last ${DAYS} days`}</title>
        <desc id="adm-daily-d">{`${n(totalViews)} page views in total. Busiest day ${busiest.day} with ${n(busiest.views)}. The table below lists every day.`}</desc>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
            <text x={pad.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = pad.left + i * step + (step - bw) / 2;
          return (
            <g key={p.day}>
              <rect x={x} y={y(p.views)} width={bw} height={Math.max(0, y(0) - y(p.views))} fill="var(--blue-wash)" stroke="var(--blue)" strokeWidth={0.75}>
                <title>{`${p.day}: ${p.views} views, ${p.visitors} visitors`}</title>
              </rect>
              <rect x={x + bw * 0.25} y={y(p.visitors)} width={bw * 0.5} height={Math.max(0, y(0) - y(p.visitors))} fill="var(--navy)" />
              {(i === 0 || i === points.length - 1 || i % 7 === 0) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle">
                  {p.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="adm-legend">
        <span>
          <i style={{ background: "var(--blue-wash)", border: "1px solid var(--blue)" }} />
          Page views
        </span>
        <span>
          <i style={{ background: "var(--navy)" }} />
          Visitors (daily hashes)
        </span>
      </figcaption>
    </figure>
  );
}

function Ranked({ rows, label, empty }: { rows: { key: string; n: number; sub?: number }[]; label: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="adm-fine">{empty}</p>;
  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th scope="col">{label}</th>
          <th scope="col" className="r">
            Count
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td style={{ wordBreak: "break-all" }}>{r.key}</td>
            <td className="r">
              <span className="adm-bar" style={{ width: `${Math.round((r.n / max) * 80)}px` }} aria-hidden="true" />
              {n(r.n)}
              {r.sub != null && <span className="adm-fine"> ({n(r.sub)} visitors)</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Operator view of first-party analytics. Same access rule as /admin/leads. */
export default async function AnalyticsPage() {
  await requireOperator();
  const db = await getDb();
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (DAYS - 1) * DAY);
  const inWindow = gte(analyticsEvents.ts, since);
  const isView = eq(analyticsEvents.event, "pageview");
  const day = sql<string>`to_char(${analyticsEvents.ts} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [daily, paths, refs, devices, events, clicks, [conv]] = await Promise.all([
    db
      .select({ day, views: sql<number>`count(*)::int`, visitors: sql<number>`count(distinct ${analyticsEvents.visitor})::int` })
      .from(analyticsEvents)
      .where(and(inWindow, isView))
      .groupBy(day),
    db
      .select({ key: analyticsEvents.path, n: sql<number>`count(*)::int`, sub: sql<number>`count(distinct ${analyticsEvents.visitor})::int` })
      .from(analyticsEvents)
      .where(and(inWindow, isView))
      .groupBy(analyticsEvents.path)
      .orderBy(desc(sql`count(*)`))
      .limit(15),
    db
      .select({ key: analyticsEvents.referrerHost, n: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(inWindow, isView, isNotNull(analyticsEvents.referrerHost)))
      .groupBy(analyticsEvents.referrerHost)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({ key: analyticsEvents.device, n: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(inWindow, isView))
      .groupBy(analyticsEvents.device),
    db
      .select({ key: analyticsEvents.event, n: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(inWindow)
      .groupBy(analyticsEvents.event),
    db
      .select({ key: analyticsEvents.label, n: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(inWindow, eq(analyticsEvents.event, "click"), isNotNull(analyticsEvents.label)))
      .groupBy(analyticsEvents.label)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({
        viewers: sql<number>`count(distinct ${analyticsEvents.visitor} || ':' || ${day}) filter (where ${analyticsEvents.event} = 'pageview')::int`,
        starters: sql<number>`count(distinct ${analyticsEvents.visitor} || ':' || ${day}) filter (where ${analyticsEvents.event} = 'demo_start')::int`,
        submitters: sql<number>`count(distinct ${analyticsEvents.visitor} || ':' || ${day}) filter (where ${analyticsEvents.event} = 'pilot_submit')::int`,
      })
      .from(analyticsEvents)
      .where(inWindow),
  ]);

  const points = fillDays(daily, DAYS, now);
  const count = (e: string) => Number(events.find((x) => x.key === e)?.n ?? 0);
  const views = count("pageview");
  const visitorDays = Number(conv?.viewers ?? 0);
  const deviceTotal = devices.reduce((s, d) => s + Number(d.n), 0);
  const deviceRows = (["desktop", "tablet", "mobile"] as const).map((d) => ({ key: d, n: Number(devices.find((x) => x.key === d)?.n ?? 0) }));
  const unknownDevice = Number(devices.find((x) => x.key == null)?.n ?? 0);

  return (
    <main className="adm">
      <nav className="adm-nav" aria-label="Operator pages">
        <Link href="/admin/leads">Pilot requests</Link>
        <span aria-current="page">Site analytics</span>
      </nav>
      <h1>Site analytics</h1>
      <p className="adm-lede">
        Last {DAYS} days, UTC, both editions. First-party only: no cookies, no IP address or user agent stored, and a visitor is a hash that changes every day, so one person on three days counts as three visitor-days. Do Not Track, Global Privacy Control and obvious bots are not counted.
      </p>

      <dl className="adm-figs">
        <div>
          <dt>Page views</dt>
          <dd>{n(views)}</dd>
        </div>
        <div>
          <dt>Visitor-days</dt>
          <dd>{n(visitorDays)}</dd>
        </div>
        <div>
          <dt>Demo starts</dt>
          <dd>
            {n(count("demo_start"))}
            <small>{pct(rate(Number(conv?.starters ?? 0), visitorDays))} of visitor-days</small>
          </dd>
        </div>
        <div>
          <dt>Pilot requests sent</dt>
          <dd>
            {n(count("pilot_submit"))}
            <small>{pct(rate(Number(conv?.submitters ?? 0), visitorDays))} of visitor-days</small>
          </dd>
        </div>
        <div>
          <dt>Sign-ups</dt>
          <dd>{n(count("signup"))}</dd>
        </div>
      </dl>

      <section className="adm-sec" aria-labelledby="adm-daily-h">
        <h2 id="adm-daily-h">Per day</h2>
        <DailyChart points={points} />
        <details style={{ marginTop: 10 }}>
          <summary className="adm-fine">Daily numbers as a table</summary>
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className="r">
                  Page views
                </th>
                <th scope="col" className="r">
                  Visitors
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day}>
                  <td>{p.day}</td>
                  <td className="r">{n(p.views)}</td>
                  <td className="r">{n(p.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="adm-grid">
        <section className="adm-sec" aria-labelledby="adm-paths-h">
          <h2 id="adm-paths-h">Top pages</h2>
          <Ranked rows={paths.map((p) => ({ key: p.key, n: Number(p.n), sub: Number(p.sub) }))} label="Path" empty="No page views yet." />
        </section>
        <section className="adm-sec" aria-labelledby="adm-refs-h">
          <h2 id="adm-refs-h">Top referrers</h2>
          <Ranked rows={refs.map((r) => ({ key: r.key ?? "", n: Number(r.n) }))} label="Referring site" empty="No outside referrers yet. Direct visits and same-site navigation are not listed." />
        </section>
        <section className="adm-sec" aria-labelledby="adm-dev-h">
          <h2 id="adm-dev-h">Devices</h2>
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Device, by viewport width</th>
                <th scope="col" className="r">
                  Page views
                </th>
                <th scope="col" className="r">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {deviceRows.map((d) => (
                <tr key={d.key}>
                  <td style={{ textTransform: "capitalize" }}>{d.key}</td>
                  <td className="r">{n(d.n)}</td>
                  <td className="r">{pct(rate(d.n, deviceTotal))}</td>
                </tr>
              ))}
              {unknownDevice > 0 && (
                <tr>
                  <td>Unknown</td>
                  <td className="r">{n(unknownDevice)}</td>
                  <td className="r">{pct(rate(unknownDevice, deviceTotal))}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="adm-fine">Mobile under 768 px wide, tablet under 1,100 px, desktop above.</p>
        </section>
        <section className="adm-sec" aria-labelledby="adm-clicks-h">
          <h2 id="adm-clicks-h">Tracked clicks</h2>
          <Ranked rows={clicks.map((c) => ({ key: c.key ?? "", n: Number(c.n) }))} label="Element (data-track)" empty="No tracked clicks yet." />
        </section>
      </div>
    </main>
  );
}
