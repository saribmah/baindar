import { Instance } from "../../instance";
import { DocumentAssetStore } from "../asset-store";
import { Document } from "../document";
import { DocumentBinding } from "../document-binding";

// Deletion step bodies. No `cloudflare:workers` dep so the bun test runtime
// can import and execute them directly (matches the EPUB steps.ts pattern).

export type DocumentDeletionParams = { userId: string; documentId: string };

// Drop the BinderDO catalog row + cascade child tables (highlights, notes,
// progress, shelf membership, conversations, FTS chunk refs). Idempotent —
// re-running against an already-deleted row is a no-op.
export const removeBinderRow = async (input: DocumentDeletionParams): Promise<void> => {
  await Document.removeFromBinder(input.userId, input.documentId);
};

export const destroyDocumentDO = async (input: DocumentDeletionParams): Promise<void> => {
  await DocumentBinding.require(input.documentId).destroy();
};

export const sweepR2 = async (input: DocumentDeletionParams): Promise<void> => {
  await DocumentAssetStore.removeAll(input.userId, input.documentId);
};

// Inline runner used by tests via the fake DELETE_DOCUMENT binding. Same
// terminal state as the Workflow run (each step is idempotent and replay-
// safe, so re-running mid-sequence after a partial failure is fine).
export const runDeletionInline = async (input: DocumentDeletionParams): Promise<void> => {
  await removeBinderRow(input);
  await destroyDocumentDO(input);
  await sweepR2(input);
};

// Trigger the DELETE_DOCUMENT workflow. Mirrors Processor.trigger — feature
// and route code goes through this instead of touching the workflow binding
// directly. In tests the binding is faked to run `runDeletionInline`
// synchronously so post-trigger state matches production.
export namespace DocumentDeletion {
  export const trigger = async (input: DocumentDeletionParams): Promise<void> => {
    const binding = Instance.env.DELETE_DOCUMENT;
    if (!binding) throw new Error("DELETE_DOCUMENT workflow binding not configured");
    await binding.create({
      id: `delete-${input.documentId}`,
      params: input,
    });
  };
}
