export function SectionHeading({
  title,
  meta,
  onMetaClick,
}: {
  title: string;
  meta: string;
  onMetaClick?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="m-0 font-display text-[22px] font-medium leading-tight tracking-normal text-bd-fg">
        {title}
      </h2>
      {onMetaClick ? (
        <button
          type="button"
          onClick={onMetaClick}
          className="t-body-m border-0 bg-transparent p-0 font-semibold text-bd-accent"
        >
          {meta}
        </button>
      ) : (
        <span className="t-body-m text-bd-fg-muted">{meta}</span>
      )}
    </div>
  );
}
