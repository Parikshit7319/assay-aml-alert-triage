/** True when building the static GitHub Pages edition (marketing site + in-browser demo). */
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC === "1";
export const REPO_URL = "https://github.com/Parikshit7319/assay-aml-alert-triage";
/** Where "create an account" goes: the real sign-up on the server edition, the pilot form on the static one. */
export const SIGN_UP_HREF = STATIC_SITE ? "/pilot" : "/sign-up";
