"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-types";
import { createNote, setAssignee } from "@/lib/collab";
import { requireTenant } from "@/lib/tenant";
import { WorkflowError } from "@/lib/workflow";

function fail(err: unknown): ActionState {
  if (err instanceof WorkflowError) return { error: err.message };
  if (err instanceof Error && /redirect|NEXT_/.test(err.message)) throw err;
  console.error(err);
  return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** Fields: alertId, assigneeId (a member's user id; empty string unassigns). */
export async function assignAlert(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const alertId = str(fd, "alertId");
  try {
    const r = await setAssignee(t.db, t.ws, { alertId, assigneeId: str(fd, "assigneeId") || null, actor: t.actor });
    revalidatePath(`/app/alerts/${alertId}`);
    revalidatePath("/app", "layout");
    if (!r.changed) return { ok: r.assigneeName ? `Already assigned to ${r.assigneeName}.` : "Already unassigned." };
    return { ok: r.assigneeName ? `Assigned to ${r.assigneeName}.` : "Unassigned." };
  } catch (e) {
    return fail(e);
  }
}

/** Fields: alertId, body (up to 4,000 characters), kind ("handoff" flags it for L2; anything else is a plain note). */
export async function addNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const alertId = str(fd, "alertId");
  const raw = fd.get("body");
  try {
    const note = await createNote(t.db, t.ws, {
      alertId,
      body: typeof raw === "string" ? raw : "",
      kind: str(fd, "kind") === "handoff" ? "handoff" : "note",
      authorId: t.user?.id ?? null,
      authorName: t.actor,
    });
    revalidatePath(`/app/alerts/${alertId}`);
    const who = note.mentions.length ? ` ${note.mentions.length} ${note.mentions.length === 1 ? "person" : "people"} mentioned.` : "";
    return { ok: `${note.kind === "handoff" ? "Handoff note" : "Note"} added.${who}` };
  } catch (e) {
    return fail(e);
  }
}
