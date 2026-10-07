-- Transaction ids only need to be unique within a workspace. The old global key on a short id
-- collided once enough demo workspaces were seeded.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_pkey";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_id_pk" PRIMARY KEY("workspace_id","id");
