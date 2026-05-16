import { BookCover } from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { useAuthedAssetUrl, useSdk } from "../../../sdk";
import { COVER_PALETTES } from "../constants";
import { sourceLabel } from "../utils/document";

const hashString = (value: string): number =>
  [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);

export function LibraryCover({
  doc,
  width,
  className,
  priority = false,
}: {
  doc: Document;
  width?: number;
  className?: string;
  priority?: boolean;
}) {
  const { baseUrl } = useSdk();
  const remoteCover =
    doc.kind === "epub" && doc.status === "processed" && doc.coverImage
      ? `${baseUrl}/documents/${doc.id}/${doc.coverImage}`
      : null;
  const coverSrc = useAuthedAssetUrl(remoteCover);

  if (coverSrc) {
    return (
      <BookCover
        width={width ?? "100%"}
        height="auto"
        src={coverSrc}
        alt={priority ? doc.title : ""}
        className={["aspect-[0.66/1] w-full shadow-sm", className].filter(Boolean).join(" ")}
      />
    );
  }

  const palette = COVER_PALETTES[hashString(doc.id) % COVER_PALETTES.length] ?? COVER_PALETTES[0];

  return (
    <div
      role={priority ? "img" : undefined}
      aria-label={priority ? doc.title : undefined}
      className={[
        "flex aspect-[0.66/1] w-full flex-col justify-between rounded-[4px] border p-3 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width,
        background: palette.background,
        color: palette.ink,
        borderColor: "rgba(0,0,0,0.08)",
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="h-px" style={{ background: palette.accent, opacity: 0.5 }} />
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] opacity-70">Baindar</span>
      </div>
      <span className="break-words text-center font-display text-[clamp(12px,1vw,15px)] font-semibold uppercase leading-[1.05]">
        {doc.title}
      </span>
      <div className="flex flex-col gap-1">
        <span className="h-px" style={{ background: palette.accent, opacity: 0.5 }} />
        <span className="text-center font-display text-[9px] uppercase tracking-[0.06em] opacity-85">
          {sourceLabel(doc)}
        </span>
      </div>
    </div>
  );
}
