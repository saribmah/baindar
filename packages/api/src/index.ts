import { apiApp, devApp } from "./app/app";
import type { RuntimeEnv } from "./app/context";

export { openApiDocumentation } from "./app/app";

// Workflow class exports so wrangler can locate them via `class_name` in
// wrangler.jsonc. One Workflow class per document kind; `Processor.trigger`
// dispatches uploads to the matching binding.
export { EpubWorkflow } from "./document/formats/epub/workflow";
export { DocumentDeletionWorkflow } from "./document/processing/deletion-workflow";
export { AccountDeletionWorkflow } from "./account-deletion/workflow";

// Agent (Durable Object) class exports so wrangler can locate them via
// `class_name` in wrangler.jsonc → durable_objects.bindings.
export { ChatAgent } from "./agent/chat";

// Per-user binder aggregate and per-document content actor. See
// `.agents/ai-layer-prd.md` §9–§10. Re-exported here so wrangler can
// locate them via `class_name` in wrangler.jsonc → durable_objects.bindings.
export { BinderDO } from "./binder/binder-do";
export { DocumentDO } from "./document/document-do";

const hostnameOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
};

export default {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Response | Promise<Response> {
    const host = new URL(request.url).hostname.toLowerCase();
    const apiHost = hostnameOf(env.API_PUBLIC_HOST);
    const webHost = hostnameOf(env.WEB_PUBLIC_HOST);

    if (apiHost && host === apiHost) return apiApp.fetch(request, env, ctx);

    // Web host: hand off to the static assets binding (configured with
    // `not_found_handling: "single-page-application"` for SPA fallback).
    if (webHost && host === webHost && "ASSETS" in env) {
      return env.ASSETS.fetch(request);
    }

    return devApp.fetch(request, env, ctx);
  },
};
