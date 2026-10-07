import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { appBaseUrl, vercelOrigins } from "./app-url";
import { appendAudit } from "./audit";
import { getDb } from "./db/client";
import { schema, workspaceMembers, workspaces } from "./db/schema";
import { DEFAULT_POLICY } from "./engine/policy";
import { authSecret } from "./secrets";
import { newId } from "./util";

async function build() {
  const db = await getDb();
  // BETTER_AUTH_SECRET, or in production a stable secret derived from DATABASE_URL (with a warning).
  const secret = authSecret();
  const baseURL = appBaseUrl();
  const socialProviders: Record<string, unknown> = {};
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
    };
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  }

  return betterAuth({
    appName: "Assay",
    secret,
    baseURL,
    // Preview deployments and the production alias share one database, so trust all of this project's Vercel hosts.
    trustedOrigins: [...new Set([baseURL, ...vercelOrigins()])],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
    socialProviders,
    databaseHooks: {
      user: {
        create: {
          // Every new account gets its own Sandbox workspace, owned by that user.
          after: async (user) => {
            const id = newId("WS", 10);
            await db.insert(workspaces).values({
              id,
              name: `${user.name.split(" ")[0]}'s workspace`,
              kind: "customer",
              plan: "sandbox",
              settings: DEFAULT_POLICY,
            });
            await db.insert(workspaceMembers).values({ workspaceId: id, userId: user.id, role: "owner" });
            await appendAudit(db, {
              workspaceId: id,
              actorType: "system",
              actorName: "assay",
              action: "workspace.created",
              entityType: "workspace",
              entityId: id,
              payload: { kind: "customer", plan: "sandbox", owner: user.email },
            });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = Awaited<ReturnType<typeof build>>;
const g = globalThis as unknown as { __assayAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  if (!g.__assayAuth) g.__assayAuth = build();
  return g.__assayAuth;
}

export function enabledSocialProviders(): { microsoft: boolean; github: boolean } {
  return {
    microsoft: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
}
