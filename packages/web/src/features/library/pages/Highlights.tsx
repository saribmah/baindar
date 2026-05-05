import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChipButton, Skeleton } from "@baindar/ui";
import type { Highlight } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { HIGHLIGHT_COLOR, HIGHLIGHT_LABEL } from "../constants";
import { AppSidebar } from "../components/AppSidebar";
import { useLibraryShelves } from "../hooks/useLibraryShelves";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryHighlights, type LibraryHighlight } from "../hooks/useLibraryHighlights";

type ColorFilter = Highlight["color"] | "all";

const colorFilters: ColorFilter[] = ["all", "pink", "yellow", "blue", "green", "purple"];

export function Highlights() {
  const navigate = useNavigate();
  const reader = useProfileName();
  const { documents, uploading, uploadDocument } = useLibraryDocuments();
  const { highlights, error } = useLibraryHighlights(documents);
  const { shelves } = useLibraryShelves(documents);
  const [filter, setFilter] = useState<ColorFilter>("all");

  const visible = useMemo(() => {
    if (!highlights) return null;
    return filter === "all" ? highlights : highlights.filter((item) => item.color === filter);
  }, [filter, highlights]);

  const colorCounts = useMemo(() => {
    const base: Record<Highlight["color"], number> = {
      pink: 0,
      yellow: 0,
      green: 0,
      blue: 0,
      purple: 0,
    };
    for (const item of highlights ?? []) base[item.color] += 1;
    return base;
  }, [highlights]);

  const sourceCounts = useMemo(() => {
    const map = new Map<string, { title: string; count: number }>();
    for (const item of highlights ?? []) {
      const current = map.get(item.documentId) ?? { title: item.document.title, count: 0 };
      current.count += 1;
      map.set(item.documentId, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [highlights]);

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
      />

      <section className="flex min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-12 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <div>
              <div className="t-label-s text-bd-fg-muted">
                Highlights · {highlights?.length ?? 0} across {sourceCounts.length} sources
              </div>
              <h1 className="mt-1 font-display text-[clamp(34px,5vw,48px)] font-normal leading-[1.05]">
                Everything you've marked.
              </h1>
            </div>

            <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
              {colorFilters.map((item) => (
                <ChipButton
                  key={item}
                  variant={filter === item ? "active" : "outline"}
                  onClick={() => setFilter(item)}
                  className="shrink-0"
                  iconStart={
                    item === "all" ? undefined : (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: HIGHLIGHT_COLOR[item] }}
                      />
                    )
                  }
                >
                  {item === "all"
                    ? `All · ${highlights?.length ?? 0}`
                    : `${HIGHLIGHT_LABEL[item]} · ${colorCounts[item]}`}
                </ChipButton>
              ))}
            </div>

            {error && (
              <p className="t-body-s mt-4 rounded-md bg-bd-surface-hover px-4 py-3 text-error">
                {error}
              </p>
            )}

            <div className="mt-2">
              {!visible ? (
                <HighlightsSkeleton />
              ) : visible.length === 0 ? (
                <p className="t-body-m border-t border-bd-border py-6 text-bd-fg-subtle">
                  No highlights in this view yet.
                </p>
              ) : (
                visible.map((item) => (
                  <HighlightItem
                    key={item.id}
                    item={item}
                    onOpen={() => navigate(readerHighlightPath(item))}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="hidden w-[300px] shrink-0 border-l border-bd-border px-7 py-8 xl:block">
          <div className="t-label-s mb-3 text-bd-fg-muted">By source</div>
          <div className="flex flex-col gap-1">
            {sourceCounts.map((source) => (
              <div key={source.title} className="flex items-center gap-3 rounded-md px-3 py-2">
                <span className="t-body-m min-w-0 flex-1 truncate text-bd-fg-subtle">
                  {source.title}
                </span>
                <span className="font-mono text-[11px] text-bd-fg-muted">{source.count}</span>
              </div>
            ))}
          </div>

          <div className="t-label-s mb-3 mt-8 text-bd-fg-muted">Export</div>
          <button className="bd-btn bd-btn-rounded bd-btn-secondary bd-btn-sm mb-2 w-full">
            Export to Markdown
          </button>
          <button className="bd-btn bd-btn-rounded bd-btn-secondary bd-btn-sm w-full">
            Sync to Readwise
          </button>
        </aside>
      </section>
    </main>
  );
}

function HighlightItem({ item, onOpen }: { item: LibraryHighlight; onOpen: () => void }) {
  return (
    <article className="border-b border-bd-border py-4">
      <button
        type="button"
        className="flex w-full flex-col gap-2 border-0 bg-transparent p-0 text-left"
        onClick={onOpen}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: HIGHLIGHT_COLOR[item.color] }}
          />
          <span className="t-label-m min-w-0 flex-1 truncate text-bd-fg">
            {item.document.title}
          </span>
          <span className="t-body-s text-[11px] text-bd-fg-muted">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        <blockquote
          className="m-0 border-l-[3px] pl-3 font-reading text-base leading-7 text-bd-fg"
          style={{ borderColor: HIGHLIGHT_COLOR[item.color] }}
        >
          "{item.textSnippet}"
        </blockquote>
      </button>
    </article>
  );
}

function readerHighlightPath(item: LibraryHighlight): string {
  const order = sectionOrderFromKey(item.sectionKey);
  const params = new URLSearchParams();
  if (order !== null) params.set("chapter", String(order));
  params.set("highlight", item.id);
  params.set("target", "1");
  return `/read/${item.document.id}?${params.toString()}`;
}

function sectionOrderFromKey(sectionKey: string): number | null {
  const match = /:(\d+)$/.exec(sectionKey);
  return match ? Number(match[1]) : null;
}

function HighlightsSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="border-b border-bd-border py-4">
          <Skeleton width="45%" height={14} />
          <Skeleton width="95%" height={22} className="mt-3" />
          <Skeleton width="70%" height={14} className="mt-3" />
        </div>
      ))}
    </div>
  );
}
