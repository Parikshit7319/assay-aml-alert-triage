/**
 * Demo settings with no server dependencies, so marketing pages and the static
 * edition can import them without pulling in the database layer.
 */

/** Hours a server-edition demo workspace lives before the nightly job deletes it. */
export const DEMO_TTL_HOURS = 24;
