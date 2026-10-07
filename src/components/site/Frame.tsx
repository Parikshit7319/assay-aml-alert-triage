import { withBase } from "@/lib/base-path";

/** Browser-window frame around a real product screenshot. */
export function Frame({ src, alt, url = "assay / workbench", width = 1440, height = 900, priority = false, className }: { src: string; alt: string; url?: string; width?: number; height?: number; priority?: boolean; className?: string }) {
  return (
    <figure className={`frame${className ? ` ${className}` : ""}`}>
      <div className="frame__bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{url}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBase(src)} alt={alt} width={width} height={height} loading={priority ? "eager" : "lazy"} decoding="async" />
    </figure>
  );
}
