/** True when building the static GitHub Pages edition (marketing site + in-browser demo). */
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC === "1";
export const REPO_URL = "https://github.com/Parikshit7319/assay-aml-alert-triage";
/** Where "create an account" goes: the real sign-up on the server edition, the pilot form on the static one. */
export const SIGN_UP_HREF = STATIC_SITE ? (process.env.NEXT_PUBLIC_APP_ORIGIN ? `${process.env.NEXT_PUBLIC_APP_ORIGIN}/sign-up` : "/pilot") : "/sign-up";

/** Absolute origin of the server edition, when deployed. The static edition links sign-up and forms there. */
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
/** Where public form posts go (pilot requests, analytics). Empty means same origin. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? (STATIC_SITE ? APP_ORIGIN : "");
export const DEMO_HREF = "/demo/";
