"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/viz/Icon";
import { withBase } from "@/lib/base-path";
import "./marketing.css";

export interface Chapter {
  /** Seconds from the start of the video. */
  at: number;
  label: string;
}

/**
 * Planned chapters for the 90-second walkthrough. The times must match the
 * recording; update them when the file lands in public/media.
 */
export const DEMO_CHAPTERS: Chapter[] = [
  { at: 0, label: "The queue, ranked by risk score" },
  { at: 9, label: "A structuring alert, every claim cited" },
  { at: 36, label: "A memo with instructions, locked before the model" },
  { at: 49, label: "Batch approval with a QA sample" },
  { at: 61, label: "The audit log and the exam exports" },
  { at: 71, label: "Policy settings and a re-run of the queue" },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * The demo video with a chapter list that seeks. Muted, inline, nothing loads
 * until play. If the poster or the video is missing or fails, the frame says so
 * and points to the live demo instead.
 */
export function DemoVideo({
  src = "/media/demo.mp4",
  poster = "/media/demo-poster.png",
  captions,
  chapters = DEMO_CHAPTERS,
  title = "Assay walkthrough, 90 seconds",
}: {
  src?: string;
  poster?: string;
  /** Optional WebVTT captions file in /public, needed if the recording has narration. */
  captions?: string;
  chapters?: Chapter[];
  title?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [posterOk, setPosterOk] = useState(true);
  const [current, setCurrent] = useState<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onerror = () => setPosterOk(false);
    img.src = withBase(poster);
  }, [poster]);

  const seek = (at: number) => {
    const v = ref.current;
    if (!v) return;
    try {
      v.currentTime = at;
      void v.play().catch(() => undefined);
    } catch {
      // the file is not available; the error handler shows the fallback
    }
  };

  const onTime = () => {
    const t = ref.current?.currentTime ?? 0;
    let idx = -1;
    chapters.forEach((c, i) => {
      if (t >= c.at) idx = i;
    });
    setCurrent(idx >= 0 ? idx : null);
  };

  const unavailable = failed || !posterOk;

  return (
    <figure className="m-video">
      <div className="m-video__stage">
        {unavailable ? (
          <div className="m-video__fallback" role="note">
            <Icon name="play" size={28} />
            <p>
              <strong>The walkthrough video is not available right now.</strong> The live demo shows the same screens, and you can click through them yourself.
            </p>
            <Link className="btn btn-light" href="/demo" data-track="video_fallback_demo">
              Open the live demo instead
            </Link>
          </div>
        ) : (
          <video
            ref={ref}
            controls
            muted
            playsInline
            preload="none"
            poster={withBase(poster)}
            width={1440}
            height={900}
            aria-label={title}
            onError={() => setFailed(true)}
            onTimeUpdate={onTime}
          >
            <source src={withBase(src)} type="video/mp4" onError={() => setFailed(true)} />
            {captions && <track kind="captions" src={withBase(captions)} srcLang="en" label="English" default />}
            <Link href="/demo">Open the live demo instead</Link>
          </video>
        )}
      </div>
      <figcaption className="m-video__cap">
        <p className="m-video__title">{title}</p>
        <ol className="m-video__chapters" aria-label="Chapters">
          {chapters.map((c, i) => (
            <li key={c.at}>
              <button type="button" onClick={() => seek(c.at)} disabled={unavailable} aria-current={current === i ? "true" : undefined}>
                <span className="num">{clock(c.at)}</span>
                {c.label}
              </button>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
