import { describe, expect, it } from "vitest";
import { csvResponse, disposition, htmlResponse, withPrintBar } from "@/lib/export-response";

describe("export responses", () => {
  it("builds safe Content-Disposition filenames", () => {
    expect(disposition("attachment", "audit-WS-AB12 (1).json")).toBe('attachment; filename="audit-WS-AB12-1.json"');
    expect(disposition("inline", "sar-draft-ALT-7Q2M4K.html")).toBe('inline; filename="sar-draft-ALT-7Q2M4K.html"');
  });

  it("serves CSV with a byte order mark and no caching", async () => {
    const r = csvResponse("a,b\r\n1,2\r\n", "x.csv");
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("adds a print bar that hides when printing", async () => {
    const html = withPrintBar("<!doctype html><html><head><title>x</title></head><body class=\"a\"><main>hi</main></body></html>", { backHref: "/app/settings", downloadHref: "/dl", downloadLabel: "Download as HTML" });
    expect(html).toContain('<body class="a"><div class="assay-printbar"');
    expect(html).toContain("window.print()");
    expect(html).toContain("@media print{.assay-printbar{display:none}}");
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf("</head>"));
    const r = htmlResponse(html, "pack.html", true);
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="pack.html"');
  });
});
