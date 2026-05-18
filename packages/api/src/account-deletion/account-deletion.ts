import { eq } from "drizzle-orm";
import { z } from "zod";
import { session } from "../db/schema";
import { Instance } from "../instance";
import { NamedError } from "../utils/error";

// Account deletion. The orchestrator returns once the DELETE_USER workflow
// has been durably enqueued and the caller's sessions have been revoked;
// the workflow then asynchronously tears down BinderDO, DocumentDOs,
// ChatAgentDOs, R2, and the auth row (D1 cascades the rest).
//
// Apple guideline 5.1.1(v): "account deletion must be initiated and
// confirmed in-app." Async cleanup is allowed — only the initiation +
// confirmation need to happen in-app.
export namespace AccountDeletion {
  export const WorkflowNotConfiguredError = NamedError.create(
    "AccountDeletionWorkflowNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type WorkflowNotConfiguredError = InstanceType<typeof WorkflowNotConfiguredError>;

  export const Response = z
    .object({
      status: z.literal("pending"),
      userId: z.string(),
    })
    .meta({ ref: "AccountDeletionResponse" });
  export type Response = z.infer<typeof Response>;

  // Trigger workflow first (durable) so a partial failure in session
  // revocation still leaves cleanup running. Then drop the caller's
  // sessions so their bearer/cookie dies immediately, even before the
  // workflow runs.
  export const request = async (userId: string): Promise<Response> => {
    const binding = Instance.env.DELETE_USER;
    if (!binding) throw new WorkflowNotConfiguredError({});

    await binding.create({
      id: `delete-user-${userId}-${Date.now()}`,
      params: { userId },
    });

    await Instance.db.delete(session).where(eq(session.userId, userId));

    return { status: "pending", userId };
  };
}
