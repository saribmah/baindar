import { Config } from "../config/config";
import { Billing } from "./billing";

// Thin client over RevenueCat's V2 REST API. We deliberately do NOT use
// `@revenuecat/purchases-node-sdk` — the V2 surface we need is two fetches,
// and pulling in a Node SDK on Cloudflare Workers tends to drag in
// incompatible polyfills.
//
// Webhook events are treated as a "ping": we ignore the payload's specifics
// and re-fetch the canonical subscriber state. That avoids ordering bugs
// across the dozen+ event types RC fires and keeps the upsert path the
// single source of truth.
export namespace RevenueCat {
  // Minimal projection of the RC V2 Customer response we actually use. The
  // response is much larger; defensive parsing in `fetchSubscriber` only
  // looks at these fields so a forward-compatible RC payload change won't
  // break us.
  export type ActiveEntitlement = {
    entitlementId: string;
    productId: string;
    expiresAt: Date | null;
    willRenew: boolean;
    store: string;
  };

  export const fetchSubscriber = async (
    appUserId: string,
  ): Promise<Billing.RevenueCatSubscriberSnapshot> => {
    const config = Config.requireRevenueCat();
    const url = `${config.apiBaseUrl.replace(/\/$/, "")}/v2/projects/${config.projectId}/customers/${encodeURIComponent(appUserId)}/active_entitlements`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.secretApiKey}`,
        Accept: "application/json",
      },
    });

    // RC returns 404 when the app_user_id hasn't been seen yet — that's a
    // valid "user has never purchased anything" state, not an error.
    if (response.status === 404) {
      return emptySnapshot(appUserId);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `RevenueCat fetchSubscriber failed: ${response.status} ${response.statusText} ${body}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return parseSubscriberPayload(appUserId, payload);
  };

  // Exposed for tests + the webhook handler so payloads can be parsed
  // without hitting the network.
  export const parseSubscriberPayload = (
    appUserId: string,
    payload: Record<string, unknown>,
  ): Billing.RevenueCatSubscriberSnapshot => {
    const items = readArray(payload, ["items", "active_entitlements"]);
    const activeEntitlements: ActiveEntitlement[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const entitlementId =
        readString(item, ["entitlement_id", "id", "lookup_key"]) ??
        readString(item, ["entitlement"]);
      if (!entitlementId) continue;
      activeEntitlements.push({
        entitlementId,
        productId: readString(item, ["product_id", "product"]) ?? "",
        expiresAt: readDate(item, ["expires_at", "expires_date"]),
        willRenew: readBoolean(item, ["will_renew", "auto_renew_status"]) ?? true,
        store: readString(item, ["store"]) ?? "unknown",
      });
    }
    const managementUrl =
      readString(payload, ["management_url"]) ??
      readString((payload.subscriber as Record<string, unknown>) ?? {}, ["management_url"]);
    return { appUserId, customerId: appUserId, activeEntitlements, managementUrl };
  };

  // Delete a subscriber from RevenueCat. Used by AccountDeletionWorkflow to
  // free the app_user_id and drop any subscriber attributes/PII we've
  // attached. This does NOT cancel the underlying App Store / Play Store
  // subscription — that's tied to the platform account and the user must
  // cancel through their platform's subscription management. RC will stop
  // firing webhooks against the deleted id once the underlying sub lapses.
  //
  // Idempotent: 404 (subscriber never existed or already deleted) is a
  // success — the workflow may re-run this step after a transient failure.
  // If RevenueCat isn't configured (local dev without keys), this is a no-op
  // so the workflow can still complete.
  export const deleteSubscriber = async (appUserId: string): Promise<void> => {
    const config = Config.getRevenueCat();
    if (!config) return;
    const url = `${config.apiBaseUrl.replace(/\/$/, "")}/v2/projects/${config.projectId}/customers/${encodeURIComponent(appUserId)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.secretApiKey}`,
        Accept: "application/json",
      },
    });
    if (response.status === 404) return;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `RevenueCat deleteSubscriber failed: ${response.status} ${response.statusText} ${body}`,
      );
    }
  };

  // Webhook payload shape: { event: { app_user_id, type, ... } }. We only
  // need the app_user_id to know which subscriber to re-fetch; everything
  // else comes from the canonical fetch.
  export const extractAppUserId = (payload: unknown): string | null => {
    if (!payload || typeof payload !== "object") return null;
    const event = (payload as Record<string, unknown>).event;
    if (!event || typeof event !== "object") return null;
    const id = (event as Record<string, unknown>).app_user_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  };

  const emptySnapshot = (appUserId: string): Billing.RevenueCatSubscriberSnapshot => ({
    appUserId,
    customerId: appUserId,
    activeEntitlements: [],
    managementUrl: null,
  });

  const readString = (obj: Record<string, unknown>, keys: string[]): string | null => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return null;
  };

  const readBoolean = (obj: Record<string, unknown>, keys: string[]): boolean | null => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "boolean") return v;
    }
    return null;
  };

  const readDate = (obj: Record<string, unknown>, keys: string[]): Date | null => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string") {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d;
      }
      if (typeof v === "number") {
        // RC sometimes serialises timestamps as ms since epoch.
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return null;
  };

  const readArray = (obj: Record<string, unknown>, keys: string[]): unknown[] => {
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v)) return v;
    }
    return [];
  };
}
