import { useState } from "react";
import { Button, Icons } from "@baindar/ui";
import { ProviderSpec, type BillingStatus } from "@baindar/sdk";
import { useProviderSettings } from "../hooks/useProviderSettings";
import { ProviderSheet } from "./ProviderSheet";

// "AI Provider" row that appears on the PlanUsagePage when the user is on
// the BYOK plan. Two states: not configured (loud CTA — they can't chat
// without it) and configured (last-4 + Edit). Hidden entirely for other
// plans; that check lives at the call site.
export function ProviderRow({
  billing,
  initiallyOpen = false,
}: {
  billing: BillingStatus;
  initiallyOpen?: boolean;
}) {
  const state = useProviderSettings();
  const [sheetOpen, setSheetOpen] = useState(initiallyOpen);

  const configured = billing.providerConfigured;
  const settings = state.status?.settings ?? null;

  return (
    <section className="bd-card flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:p-7">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label-s text-bd-fg-muted">AI PROVIDER</span>
          {configured ? (
            <span className="bd-chip h-[22px] border border-success/40 bg-success/10 text-[10px] text-success">
              Connected
            </span>
          ) : (
            <span className="bd-chip h-[22px] border border-warning/40 bg-warning/10 text-[10px] text-warning">
              Not connected
            </span>
          )}
        </div>
        <h2 className="m-0 mt-2 font-display text-[26px] font-normal leading-[1.1] tracking-normal">
          {configured
            ? "Your key is powering chat."
            : "Connect your AI provider to start chatting."}
        </h2>
        <p className="t-body-m m-0 mt-2 max-w-[560px] text-bd-fg-subtle">
          {configured
            ? "All your chat turns go straight to your provider with your key. We charge $5/mo for the app, search, and storage — never your model usage."
            : "BYOK requires a working API key. Add an Anthropic key or any OpenAI-compatible endpoint (OpenRouter, LiteLLM, self-hosted) and we'll route every turn through it."}
        </p>

        {configured && settings && (
          <dl className="mt-4 grid gap-3 text-bd-fg sm:grid-cols-3">
            <Meta
              label="Spec"
              value={settings.spec === ProviderSpec.Anthropic ? "Anthropic" : "OpenAI-compatible"}
            />
            <Meta label="Model" value={settings.model} truncate />
            <Meta label="Key" value={`···· ${settings.keyLastFour}`} />
          </dl>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant={configured ? "secondary" : "primary"}
            size="md"
            onClick={() => setSheetOpen(true)}
            iconStart={configured ? <Icons.Settings size={14} color="currentColor" /> : undefined}
          >
            {configured ? "Edit provider" : "Connect provider"}
          </Button>
        </div>
      </div>

      <div className="hidden self-center lg:block">
        <Icons.Sparkles size={56} color="var(--bd-fg-subtle)" />
      </div>

      {sheetOpen && <ProviderSheet state={state} onClose={() => setSheetOpen(false)} />}
    </section>
  );
}

function Meta({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div>
      <dt className="t-label-s text-bd-fg-muted">{label}</dt>
      <dd className={`t-body-m mt-0.5 text-bd-fg ${truncate ? "truncate" : ""}`}>{value}</dd>
    </div>
  );
}
