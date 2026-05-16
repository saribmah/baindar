import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, IconButton, Icons, Input, Sheet } from "@baindar/ui";
import { ProviderSpec, type ProviderSetInput } from "@baindar/sdk";
import type { ProviderState } from "../hooks/useProviderSettings";

// Per-spec defaults used to prefill the form when the user picks a spec
// and to suggest what the model id might look like. We never enforce a
// model — users on OpenRouter / self-hosted will paste whatever string
// their endpoint accepts.
const SPEC_PRESETS: Record<
  ProviderSpec,
  { baseUrl: string; modelPlaceholder: string; label: string; hint: string }
> = {
  [ProviderSpec.Anthropic]: {
    baseUrl: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-sonnet-4-5",
    label: "Anthropic",
    hint: "Direct Anthropic API. Best for `claude-*` models.",
  },
  [ProviderSpec.Openai]: {
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o",
    label: "OpenAI-compatible",
    hint: "OpenAI, OpenRouter, LiteLLM, Together, or any endpoint that speaks the OpenAI wire protocol.",
  },
};

export function ProviderSheet({ state, onClose }: { state: ProviderState; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !state.saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, state.saving]);

  const existing = state.status?.settings ?? null;
  const initialSpec: ProviderSpec = existing?.spec ?? ProviderSpec.Anthropic;

  const [spec, setSpec] = useState<ProviderSpec>(initialSpec);
  const [baseUrl, setBaseUrl] = useState<string>(
    existing?.baseUrl ?? SPEC_PRESETS[initialSpec].baseUrl,
  );
  const [model, setModel] = useState<string>(existing?.model ?? "");
  const [apiKey, setApiKey] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Hint the user that switching spec swapped the base URL — only when the
  // current value still matches the previous spec's default (don't clobber
  // a value they've already customised).
  const onSpecChange = (next: ProviderSpec) => {
    setSpec(next);
    const previousDefault = SPEC_PRESETS[spec].baseUrl;
    if (baseUrl === previousDefault || baseUrl === "") {
      setBaseUrl(SPEC_PRESETS[next].baseUrl);
    }
  };

  const trimmedKey = apiKey.trim();
  const trimmedModel = model.trim();
  const trimmedBaseUrl = baseUrl.trim();
  const canSave =
    !state.saving && trimmedKey.length >= 8 && trimmedModel.length > 0 && isHttpUrl(trimmedBaseUrl);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setSubmitError(null);
    const input: ProviderSetInput = {
      spec,
      baseUrl: trimmedBaseUrl,
      model: trimmedModel,
      apiKey: trimmedKey,
    };
    const result = await state.save(input);
    if (result.ok) {
      onClose();
    } else {
      setSubmitError(result.error);
    }
  };

  const onRemove = async () => {
    setRemoving(true);
    try {
      await state.remove();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ProviderModal label="AI provider settings" onCancel={() => !state.saving && onClose()}>
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <div className="t-label-s text-bd-fg-muted">BYOK · AI PROVIDER</div>
          <div className="font-display text-[22px] leading-[1.1] tracking-normal text-bd-fg">
            {existing ? "Edit your provider" : "Connect your AI provider"}
          </div>
        </div>
        <IconButton aria-label="Close" size="sm" onClick={onClose} disabled={state.saving}>
          <Icons.Close size={14} />
        </IconButton>
      </div>

      <p className="t-body-s mt-3 px-1 text-bd-fg-subtle">
        Baindar will use this key for all your chat turns. The key is encrypted at rest and never
        returned to the browser — we only show its last 4 characters back to you.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <Field label="Specification" hint={SPEC_PRESETS[spec].hint}>
          <div className="flex gap-2">
            {[ProviderSpec.Anthropic, ProviderSpec.Openai].map((option) => {
              const active = option === spec;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onSpecChange(option)}
                  aria-pressed={active}
                  className={active ? "bd-chip bd-chip-active" : "bd-chip bd-chip-outline"}
                >
                  {SPEC_PRESETS[option].label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Base URL">
          <Input
            type="url"
            value={baseUrl}
            placeholder={SPEC_PRESETS[spec].baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <Field label="Model" hint="Paste the exact model id your endpoint accepts.">
          <Input
            value={model}
            placeholder={SPEC_PRESETS[spec].modelPlaceholder}
            onChange={(event) => setModel(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <Field
          label="API key"
          hint={
            existing
              ? `Current key ends in ···· ${existing.keyLastFour}. Paste a new key to replace it.`
              : "We validate the key with a 1-token test call before saving."
          }
        >
          <Input
            type="password"
            value={apiKey}
            placeholder={existing ? `Leave blank to keep ···· ${existing.keyLastFour}` : "sk-..."}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        {submitError && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-warning">
            <div className="t-label-s">Could not validate</div>
            <div className="t-body-s mt-0.5 text-bd-fg">{submitError}</div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          {existing ? (
            <Button
              variant="ghost"
              type="button"
              onClick={onRemove}
              disabled={removing || state.saving}
            >
              {removing ? "Removing…" : "Remove key"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={state.saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!canSave}>
              {state.saving ? "Validating…" : existing ? "Save changes" : "Connect"}
            </Button>
          </div>
        </div>
      </form>
    </ProviderModal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 px-1">
      <span className="t-label-s text-bd-fg">{label}</span>
      {children}
      {hint && <span className="t-body-s text-bd-fg-muted">{hint}</span>}
    </label>
  );
}

function ProviderModal({
  label,
  onCancel,
  children,
}: {
  label: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className="fixed inset-0 z-30 flex flex-col justify-end"
      style={{ background: "rgba(20, 15, 10, 0.35)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div onClick={(event) => event.stopPropagation()} className="mx-auto w-full max-w-2xl">
        <Sheet>
          <div className="p-5 sm:p-6">{children}</div>
        </Sheet>
      </div>
    </div>
  );
}

const isHttpUrl = (value: string): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};
