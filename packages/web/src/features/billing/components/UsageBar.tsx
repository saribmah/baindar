import { isUnlimited } from "../utils/format";

export function UsageBar({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const unlimited = isUnlimited(limit);
  const percent = unlimited ? 8 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  const exhausted = !unlimited && used >= limit;
  const warning = !exhausted && !unlimited && percent >= 80;
  const fill = exhausted ? "var(--error)" : warning ? "var(--warning)" : "var(--bd-action)";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label-m text-bd-fg">{label}</span>
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: exhausted ? "var(--error)" : "var(--bd-fg-subtle)" }}
        >
          {used.toLocaleString()}{" "}
          <span className="text-bd-fg-muted">
            {unlimited ? "· unlimited" : `/ ${limit.toLocaleString()}`}
          </span>
        </span>
      </div>
      <div className="relative h-1 overflow-hidden rounded-full bg-bd-border">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${percent}%`, background: fill }}
        />
        {unlimited && (
          <div className="absolute inset-0 opacity-60 [background:repeating-linear-gradient(90deg,transparent_0_6px,var(--bd-border-strong)_6px_7px)]" />
        )}
      </div>
      {hint && (
        <div className="t-body-s text-[11px]" style={{ color: exhausted ? "var(--error)" : "" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
