import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { RuntimeEnv } from "../../../app/context";
import { createDb } from "../../../db/db";
import { Instance } from "../../../instance";
import { createAnonymousAuth } from "../../../middleware/auth";
import {
  indexDocumentBatch,
  initDocumentDO,
  loadDocument,
  markProcessed,
  parseAndRender,
  recordFailure,
  resetRendered,
  writeManifest,
} from "./steps";

export type EpubWorkflowParams = { userId: string; documentId: string };

// Cloudflare Workflow class. One instance per upload (instance ID ==
// document ID). Each step is its own checkpoint with its own retry policy
// so a transient failure replays just that checkpoint instead of restarting
// from parse. Workflows resume in fresh invocations across step boundaries,
// so we re-establish the AsyncLocalStorage frame inside each step body
// rather than once at the top of `run`.
//
// `userId` is carried in the params so every step can address the per-user
// BinderDO directly without reverse-looking up `documentId → userId` from a
// global table.
//
// Step bodies live in `./steps.ts` so the unit-test runtime can import them
// without pulling the `cloudflare:workers` virtual module (which only
// resolves inside the Worker runtime).
export class EpubWorkflow extends WorkflowEntrypoint<RuntimeEnv, EpubWorkflowParams> {
  override async run(event: WorkflowEvent<EpubWorkflowParams>, step: WorkflowStep): Promise<void> {
    const { userId, documentId } = event.payload;
    const env = this.env;
    const provide = <R>(fn: () => Promise<R>): Promise<R> => {
      const db = createDb(env);
      return Instance.provide({ auth: createAnonymousAuth(), env, db }, fn);
    };

    try {
      const loaded = await step.do(
        "loadDocument",
        {
          retries: { limit: 3, delay: "1 second", backoff: "exponential" },
          timeout: "30 seconds",
        },
        () => provide(() => loadDocument(userId, documentId)),
      );
      await step.do(
        "resetRendered",
        {
          retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
          timeout: "1 minute",
        },
        () => provide(() => resetRendered(userId, documentId)),
      );
      const manifest = await step.do(
        "parseAndRender",
        {
          retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
          timeout: "5 minutes",
        },
        () =>
          provide(() => parseAndRender(userId, documentId, loaded.originalKey, loaded.contentHash)),
      );
      const finalized = await step.do(
        "writeManifest",
        {
          retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
          timeout: "1 minute",
        },
        () => provide(() => writeManifest(userId, documentId, manifest)),
      );
      await step.do(
        "initDocumentDO",
        {
          retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
          timeout: "30 seconds",
        },
        () => provide(() => initDocumentDO(userId, documentId, loaded.contentHash, finalized)),
      );
      for (const section of manifest.sections) {
        await step.do(
          `indexDocumentBatch:${section.order}`,
          {
            retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
            timeout: "1 minute",
          },
          () => provide(() => indexDocumentBatch(userId, documentId, manifest.title, section)),
        );
      }
      await step.do(
        "markProcessed",
        {
          retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
          timeout: "30 seconds",
        },
        () => provide(() => markProcessed(userId, documentId, finalized)),
      );
    } catch (error) {
      await step.do("markFailed", () => provide(() => recordFailure(userId, documentId, error)));
    }
  }
}
