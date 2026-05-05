import {
  createContext,
  type CSSProperties,
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  FloatingToolbar,
  FloatingToolbarButton,
  IconButton,
  Icons,
  Skeleton,
  Wordmark,
  useTheme,
  type Theme,
} from "@baindar/ui";
import type {
  Document,
  DocumentManifest,
  DocumentSectionSummary,
  EpubTocItem,
  Highlight,
  Note,
} from "@baindar/sdk";
import { useSdk } from "../../sdk";
import { HighlightLayer } from "./HighlightLayer";
import { ReaderHighlightsProvider, useReaderHighlights } from "./highlightsRefresh";
import { NotesSheet } from "./NotesSheet";
import { TocSheet } from "./TocSheet";

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const { client } = useSdk();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    client.document
      .get({ id })
      .then((res) => {
        if (cancelled) return;
        if (res.data) setDoc(res.data);
        else setError("Document not found");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id, client]);

  const handleClose = () => navigate("/dashboard");

  if (error) {
    return (
      <ReaderState>
        <p className="t-body-m text-error">{error}</p>
        <Button variant="secondary" onClick={handleClose}>
          Back to dashboard
        </Button>
      </ReaderState>
    );
  }

  if (!doc) {
    return (
      <main className="min-h-screen bg-bd-bg pb-32 text-bd-fg">
        <header className="sticky top-0 z-10 border-b border-bd-border bg-bd-bg">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
            <Skeleton shape="circle" width={32} height={32} />
            <div className="min-w-0 flex-1">
              <Skeleton width="60%" height={14} />
              <Skeleton width="30%" height={12} className="mt-1.5" />
            </div>
          </div>
        </header>
        <article className="mx-auto max-w-2xl px-6 py-8">
          <ChapterSkeleton />
        </article>
      </main>
    );
  }

  if (doc.status !== "processed") {
    return (
      <ReaderState>
        <p className="t-body-m text-bd-fg-muted">
          {doc.status === "failed"
            ? (doc.errorReason ?? "Processing failed.")
            : "This document is still being processed. Please wait a moment and try again."}
        </p>
        <Button variant="secondary" onClick={handleClose}>
          Back to library
        </Button>
      </ReaderState>
    );
  }

  return (
    <ReaderPositionProvider>
      <ReaderMetaProvider>
        <ReaderTocProvider>
          <ReaderHighlightsProvider>
            <ReaderShell doc={doc} onClose={handleClose}>
              <ReaderBody doc={doc} />
            </ReaderShell>
          </ReaderHighlightsProvider>
        </ReaderTocProvider>
      </ReaderMetaProvider>
    </ReaderPositionProvider>
  );
}

type PositionLabel = string | null;

const ReaderPositionContext = createContext<{
  position: PositionLabel;
  setPosition: (p: PositionLabel) => void;
} | null>(null);

function ReaderPositionProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<PositionLabel>(null);
  const value = useMemo(() => ({ position, setPosition }), [position]);
  return <ReaderPositionContext.Provider value={value}>{children}</ReaderPositionContext.Provider>;
}

function useReaderPosition() {
  const ctx = useContext(ReaderPositionContext);
  if (!ctx) throw new Error("useReaderPosition must be used inside <Reader>");
  return ctx;
}

type ReaderMeta = {
  authors: ReadonlyArray<string>;
  chapterTitle: string;
  chapterOrder: number;
  chapterCount: number;
  quote: string;
};

const ReaderMetaContext = createContext<{
  meta: ReaderMeta | null;
  setMeta: (meta: ReaderMeta | null) => void;
} | null>(null);

function ReaderMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<ReaderMeta | null>(null);
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <ReaderMetaContext.Provider value={value}>{children}</ReaderMetaContext.Provider>;
}

function useReaderMeta() {
  const ctx = useContext(ReaderMetaContext);
  if (!ctx) throw new Error("useReaderMeta must be used inside <Reader>");
  return ctx;
}

type TocState = {
  toc: ReadonlyArray<EpubTocItem>;
  sections: ReadonlyArray<DocumentSectionSummary>;
  currentOrder: number;
  onJump: (order: number) => void;
};

const ReaderTocContext = createContext<{
  toc: TocState | null;
  setToc: (t: TocState | null) => void;
} | null>(null);

function ReaderTocProvider({ children }: { children: ReactNode }) {
  const [toc, setToc] = useState<TocState | null>(null);
  const value = useMemo(() => ({ toc, setToc }), [toc]);
  return <ReaderTocContext.Provider value={value}>{children}</ReaderTocContext.Provider>;
}

function useReaderToc() {
  const ctx = useContext(ReaderTocContext);
  if (!ctx) throw new Error("useReaderToc must be used inside <Reader>");
  return ctx;
}

type ReaderAskPayload = {
  quote?: string;
  prompt?: string;
};

const ReaderAskContext = createContext<((payload?: ReaderAskPayload) => void) | null>(null);

function useReaderAsk() {
  const ctx = useContext(ReaderAskContext);
  if (!ctx) throw new Error("useReaderAsk must be used inside <Reader>");
  return ctx;
}

function ReaderState({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bd-bg px-6 text-bd-fg">
      {children}
    </main>
  );
}

function ReaderShell({
  doc,
  onClose,
  children,
}: {
  doc: Document;
  onClose: () => void;
  children: ReactNode;
}) {
  const { theme, cycleTheme } = useTheme();
  const { position } = useReaderPosition();
  const { meta } = useReaderMeta();
  const { toc } = useReaderToc();
  const refresh = useReaderHighlights();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tocOpen, setTocOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [askDraft, setAskDraft] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [aiQuote, setAiQuote] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState<ReaderFontScale>("standard");

  const currentOrder = meta?.chapterOrder ?? Math.max(0, Number(searchParams.get("chapter") ?? 0));
  const authorLabel = meta?.authors.length
    ? meta.authors.join(", ")
    : doc.originalFilename.replace(/\.[^.]+$/, "");
  const progressLabel =
    meta?.chapterCount !== undefined ? `${currentOrder + 1} / ${meta.chapterCount}` : position;

  const handleAskSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmed = askDraft.trim();
      setAiQuote(null);
      setLastPrompt(trimmed || "What's the most important idea in this chapter?");
      setAskDraft("");
      setAiOpen(true);
    },
    [askDraft],
  );

  const openAsk = useCallback((payload?: ReaderAskPayload) => {
    setAiQuote(payload?.quote ?? null);
    setLastPrompt(payload?.prompt ?? "");
    setAiOpen(true);
  }, []);

  const toggleFontScale = useCallback(() => {
    setFontScale((curr) => (curr === "standard" ? "large" : "standard"));
  }, []);

  const jumpToReaderTarget = useCallback(
    (order: number, highlightId?: string | null, noteId?: string | null) => {
      const next = new URLSearchParams();
      next.set("chapter", String(order));
      if (highlightId) next.set("highlight", highlightId);
      if (noteId) next.set("note", noteId);
      next.set("target", String(Date.now()));
      setSearchParams(next);
    },
    [setSearchParams],
  );

  return (
    <ReaderAskContext.Provider value={openAsk}>
      <main
        className="flex h-dvh min-h-screen flex-col overflow-hidden"
        style={{ background: "var(--bd-bg)", color: "var(--bd-fg)" }}
      >
        <header
          className="z-10 flex h-16 shrink-0 items-center gap-5 border-b px-4 xl:px-7"
          style={{ background: "var(--bd-bg)", borderColor: "var(--bd-border)" }}
        >
          <IconButton aria-label="Close reader" size="sm" onClick={onClose}>
            <Icons.Close size={16} />
          </IconButton>

          <div className="hidden xl:block">
            <Wordmark size="sm" color="var(--bd-fg)" />
          </div>
          <span
            aria-hidden
            className="hidden h-6 w-px xl:block"
            style={{ background: "var(--bd-border)" }}
          />

          <div className="min-w-0 flex-1">
            <div className="t-label-l truncate">{doc.title}</div>
            <div className="t-body-s truncate" style={{ color: "var(--bd-fg-muted)" }}>
              {authorLabel}
            </div>
          </div>

          {progressLabel && (
            <div
              className="shrink-0 font-mono text-xs tabular-nums"
              style={{ color: "var(--bd-fg-muted)" }}
            >
              {progressLabel}
            </div>
          )}

          <div className="hidden items-center gap-1 xl:flex">
            <IconButton
              aria-label={
                fontScale === "standard" ? "Use larger reader type" : "Use standard reader type"
              }
              size="sm"
              onClick={toggleFontScale}
            >
              <Icons.Type size={16} />
            </IconButton>
            <IconButton aria-label={`Theme: ${theme}`} size="sm" onClick={cycleTheme}>
              {theme === "dark" ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}
            </IconButton>
            <IconButton aria-label="Open notes" size="sm" onClick={() => setNotesOpen(true)}>
              <Icons.Settings size={16} />
            </IconButton>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)_240px]">
          <aside
            className="hidden min-h-0 overflow-hidden border-r px-6 py-8 xl:block"
            style={{ borderColor: "var(--bd-border)" }}
          >
            {toc ? (
              <ContentsRail
                toc={toc.toc}
                sections={toc.sections}
                currentOrder={toc.currentOrder}
                onJump={toc.onJump}
              />
            ) : (
              <RailSkeleton label="Contents" />
            )}
          </aside>

          <section
            data-reader-scroll
            className="min-h-0 overflow-y-auto px-6 py-8 xl:px-10 xl:py-14"
          >
            <article className="mx-auto max-w-[620px] pb-32 xl:pb-12">
              {withReaderFont(children, fontScale)}
            </article>
          </section>

          <aside
            className="hidden min-h-0 overflow-hidden border-l px-6 py-8 xl:block"
            style={{ borderColor: "var(--bd-border)" }}
          >
            <NotesRail
              documentId={doc.id}
              sections={toc?.sections}
              currentOrder={currentOrder}
              refreshToken={refresh?.refreshToken ?? 0}
              onJumpToTarget={jumpToReaderTarget}
            />
          </aside>
        </div>

        <AskBaindarBar draft={askDraft} onDraftChange={setAskDraft} onSubmit={handleAskSubmit} />

        <div className="fixed bottom-5 left-1/2 z-10 -translate-x-1/2 xl:hidden">
          <FloatingToolbar>
            {toc && (
              <FloatingToolbarButton
                aria-label="Table of contents"
                onClick={() => setTocOpen(true)}
              >
                <Icons.BookOpen size={20} />
              </FloatingToolbarButton>
            )}
            <FloatingToolbarButton aria-label="Notes" onClick={() => setNotesOpen(true)}>
              <Icons.Note size={20} />
            </FloatingToolbarButton>
            <FloatingToolbarButton aria-label="Ask Baindar" onClick={() => openAsk()}>
              <Icons.Sparkles size={20} />
            </FloatingToolbarButton>
            <FloatingToolbarButton
              aria-label={
                fontScale === "standard" ? "Use larger reader type" : "Use standard reader type"
              }
              onClick={toggleFontScale}
            >
              <Icons.Type size={20} />
            </FloatingToolbarButton>
            <FloatingToolbarButton aria-label={`Theme: ${theme}`} onClick={cycleTheme}>
              {theme === "dark" ? <Icons.Sun size={20} /> : <Icons.Moon size={20} />}
            </FloatingToolbarButton>
          </FloatingToolbar>
        </div>

        {toc && tocOpen && (
          <TocSheet
            toc={toc.toc}
            sections={toc.sections}
            currentOrder={toc.currentOrder}
            onJump={(order) => {
              toc.onJump(order);
              setTocOpen(false);
            }}
            onClose={() => setTocOpen(false)}
          />
        )}

        {notesOpen && (
          <NotesSheet
            documentId={doc.id}
            sections={toc?.sections}
            currentOrder={currentOrder}
            refreshToken={refresh?.refreshToken ?? 0}
            onJumpToTarget={(order, highlightId, noteId) => {
              jumpToReaderTarget(order, highlightId, noteId);
              setNotesOpen(false);
            }}
            onClose={() => setNotesOpen(false)}
          />
        )}

        {aiOpen && (
          <ReaderAiSheet
            theme={theme}
            title={doc.title}
            chapterLabel={
              meta ? `Chapter ${meta.chapterOrder + 1} - ${meta.chapterTitle}` : "Current chapter"
            }
            quote={aiQuote ?? meta?.quote}
            prompt={lastPrompt}
            onClose={() => setAiOpen(false)}
          />
        )}
      </main>
    </ReaderAskContext.Provider>
  );
}

function ReaderBody({ doc }: { doc: Document }) {
  const { client, baseUrl } = useSdk();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setPosition } = useReaderPosition();
  const { setMeta } = useReaderMeta();
  const { setToc } = useReaderToc();
  const openAsk = useReaderAsk();
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [chapterHtml, setChapterHtml] = useState<string | null>(null);
  const [chapterText, setChapterText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const htmlRef = useRef<HTMLDivElement>(null);

  const initialOrder = doc.progress?.sectionKey
    ? (parseSectionOrder(doc.progress.sectionKey) ?? 0)
    : 0;
  const orderParam = searchParams.get("chapter");
  const order = orderParam !== null ? Math.max(0, Number(orderParam)) : Math.max(0, initialOrder);
  const documentId = doc.id;
  const targetHighlightId = searchParams.get("highlight");
  const targetRequestId = searchParams.get("target");

  useEffect(() => {
    if (orderParam === null) {
      setSearchParams({ chapter: String(order) }, { replace: true });
    }
  }, [orderParam, order, setSearchParams]);

  const navigateTo = useCallback(
    (next: number) => {
      setSearchParams({ chapter: String(next) });
    },
    [setSearchParams],
  );

  useEffect(() => {
    let cancelled = false;
    client.document
      .getManifest({ id: documentId })
      .then((res) => {
        if (cancelled) return;
        if (res.data) setManifest(res.data);
        else setError("Failed to load book details");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId]);

  useEffect(() => {
    let cancelled = false;
    setChapterHtml(null);
    client.document
      .getSectionHtml({ id: documentId, order: String(order) })
      .then((res) => {
        if (cancelled) return;
        if (typeof res.data === "string") setChapterHtml(res.data);
        else setError("Failed to load chapter");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId, order]);

  // Canonical text drives the AI quote excerpt and underpins highlight
  // offset reasoning. Best-effort: a failure here doesn't block rendering.
  useEffect(() => {
    let cancelled = false;
    setChapterText("");
    client.document
      .getSectionText({ id: documentId, order: String(order) })
      .then((res) => {
        if (cancelled) return;
        if (typeof res.data === "string") setChapterText(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, documentId, order]);

  useEffect(() => {
    if (!htmlRef.current || chapterHtml === null) return;
    htmlRef.current.querySelectorAll('img[src^="assets/"]').forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
        img.setAttribute("src", `${baseUrl}/documents/${documentId}/${src}`);
      }
    });
  }, [chapterHtml, baseUrl, documentId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector("[data-reader-scroll]")?.scrollTo({ top: 0, behavior: "instant" });
  }, [order]);

  const currentSection = useMemo(
    () => manifest?.sections.find((s) => s.order === order) ?? null,
    [manifest, order],
  );

  useEffect(() => {
    if (!manifest || !currentSection) return;
    const handle = setTimeout(() => {
      const params: Parameters<typeof client.progress.upsert>[0] = {
        id: documentId,
        sectionKey: currentSection.sectionKey,
      };
      if (manifest.chapterCount > 0) {
        params.progressPercent = (order + 1) / manifest.chapterCount;
      }
      client.progress.upsert(params).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(handle);
  }, [client, documentId, order, currentSection, manifest]);

  useEffect(() => {
    if (!manifest) return;
    setPosition(`Chapter ${order + 1} of ${manifest.chapterCount}`);
    return () => setPosition(null);
  }, [manifest, order, setPosition]);

  useEffect(() => {
    if (!manifest || !currentSection) {
      setMeta(null);
      return;
    }
    setMeta({
      authors: manifest.kind === "epub" ? manifest.metadata.authors : [],
      chapterTitle: currentSection.title,
      chapterOrder: order,
      chapterCount: manifest.chapterCount,
      quote: excerptText(chapterText, 220),
    });
    return () => setMeta(null);
  }, [manifest, currentSection, order, chapterText, setMeta]);

  useEffect(() => {
    if (!manifest || manifest.kind !== "epub" || manifest.toc.length === 0) {
      setToc(null);
      return;
    }
    setToc({
      toc: manifest.toc,
      sections: manifest.sections,
      currentOrder: order,
      onJump: navigateTo,
    });
    return () => setToc(null);
  }, [manifest, order, navigateTo, setToc]);

  if (error) return <p className="t-body-m text-error">{error}</p>;
  if (!manifest || chapterHtml === null || !currentSection) return <ChapterSkeleton />;

  const totalChapters = manifest.chapterCount;

  return (
    <>
      <header className="mb-9 text-center">
        <div className="font-display text-[28px] leading-tight font-medium tracking-[0] text-[var(--bd-fg)]">
          Chapter {String(order + 1).padStart(2, "0")}
        </div>
        <h1 className="mt-2 font-display text-[28px] leading-tight font-normal tracking-[0] text-[var(--bd-fg)]">
          {currentSection.title}
        </h1>
      </header>

      <div
        ref={htmlRef}
        className="bd-reader-prose"
        dangerouslySetInnerHTML={{ __html: chapterHtml }}
      />

      <HighlightLayer
        containerRef={htmlRef}
        documentId={documentId}
        sectionKey={currentSection.sectionKey}
        contentKey={currentSection.sectionKey}
        targetHighlightId={targetHighlightId}
        targetRequestId={targetRequestId}
        onAskSelection={(quote) => openAsk({ quote, prompt: "What does this passage mean?" })}
      />

      <ChapterNav
        canPrev={order > 0}
        canNext={order < totalChapters - 1}
        onPrev={() => navigateTo(order - 1)}
        onNext={() => navigateTo(order + 1)}
        prevLabel="Previous chapter"
        nextLabel="Next chapter"
      />
    </>
  );
}

type ReaderFontScale = "standard" | "large";

function withReaderFont(children: ReactNode, scale: ReaderFontScale) {
  return (
    <div
      style={
        {
          "--bd-reader-font-size": scale === "large" ? "21px" : "19px",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

function ContentsRail({
  toc,
  sections,
  currentOrder,
  onJump,
}: {
  toc: ReadonlyArray<EpubTocItem>;
  sections: ReadonlyArray<DocumentSectionSummary>;
  currentOrder: number;
  onJump: (order: number) => void;
}) {
  const orderByFile = useMemo(() => {
    const map = new Map<string, number>();
    for (const ch of sections) {
      if (!map.has(ch.href)) map.set(ch.href, ch.order);
    }
    return map;
  }, [sections]);

  const chapterRows =
    toc.length > 0
      ? toc.map((item) => ({
          key: `${item.index}-${item.href}`,
          title: item.title,
          order: orderByFile.get(item.fileHref),
          depth: item.depth,
        }))
      : sections.map((section) => ({
          key: section.sectionKey,
          title: section.title,
          order: section.order,
          depth: 0,
        }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="t-label-s mb-3" style={{ color: "var(--bd-fg-muted)" }}>
        Contents
      </div>
      <div className="min-h-0 overflow-y-auto pr-1">
        {chapterRows.map((item) => {
          const reachable = item.order !== undefined;
          const active = reachable && item.order === currentOrder;
          return (
            <button
              key={item.key}
              type="button"
              disabled={!reachable}
              onClick={() => {
                if (item.order !== undefined) onJump(item.order);
              }}
              className="mb-1 flex w-full gap-2 rounded-[10px] px-3 py-2.5 text-left transition-colors disabled:opacity-50"
              style={{
                background: active ? "var(--bd-surface-raised)" : "transparent",
                paddingLeft: 12 + item.depth * 14,
              }}
            >
              <span
                className="shrink-0 font-mono text-[12px] leading-5 tabular-nums"
                style={{ color: "var(--bd-fg-muted)" }}
              >
                {item.order !== undefined ? item.order + 1 : "-"}
              </span>
              <span
                className="t-body-m min-w-0 flex-1 leading-snug"
                style={{ color: active ? "var(--bd-fg)" : "var(--bd-fg-subtle)" }}
              >
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RailSkeleton({ label }: { label: string }) {
  return (
    <div>
      <div className="t-label-s mb-4" style={{ color: "var(--bd-fg-muted)" }}>
        {label}
      </div>
      <div className="space-y-2">
        <Skeleton width="90%" height={16} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="95%" height={16} />
        <Skeleton width="72%" height={16} />
      </div>
    </div>
  );
}

function AskBaindarBar({
  draft,
  onDraftChange,
  onSubmit,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="hidden shrink-0 items-center gap-3 border-t px-7 py-3 xl:flex"
      style={{ background: "var(--bd-bg)", borderColor: "var(--bd-border)" }}
    >
      <Icons.Sparkles size={18} color="var(--bd-accent)" />
      <span className="t-label-l shrink-0" style={{ color: "var(--bd-accent)" }}>
        Ask Baindar
      </span>
      <input
        className="t-body-m h-10 min-w-0 flex-1 rounded-full border-0 px-4 outline-none"
        style={{ background: "var(--bd-surface-raised)", color: "var(--bd-fg)" }}
        placeholder="Ask anything about this chapter..."
        value={draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
      />
      <Button type="submit" variant="primary" size="sm">
        Send
      </Button>
    </form>
  );
}

function ReaderAiSheet({
  theme,
  title,
  chapterLabel,
  quote,
  prompt,
  onClose,
}: {
  theme: Theme;
  title: string;
  chapterLabel: string;
  quote?: string;
  prompt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const backdropBg = theme === "dark" ? "rgba(0, 0, 0, 0.6)" : "rgba(20, 15, 10, 0.18)";
  const answer =
    quote && prompt
      ? "Norman is drawing a careful line. An affordance is the underlying relationship between an object and a person: what is possible. A signifier is the visible cue that tells you that possibility exists."
      : "This chapter is about the cues that make actions legible. Affordances describe what can be done; signifiers help people discover it.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask Baindar"
      className="fixed inset-0 z-30 flex flex-col justify-end"
      style={{ background: backdropBg }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="mx-auto flex max-h-[72vh] w-full max-w-[720px] flex-col gap-3 rounded-t-[28px] px-6 py-4 shadow-[var(--sh-sheet)] md:px-7 md:pb-6"
        style={{ background: "var(--bd-bg)", color: "var(--bd-fg)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden
          className="h-1 w-10 self-center rounded-full"
          style={{ background: "var(--bd-border-strong)" }}
        />
        <div className="flex items-center gap-2">
          <Icons.Sparkles size={18} color="var(--bd-accent)" />
          <span className="t-label-l" style={{ color: "var(--bd-accent)" }}>
            Baindar
          </span>
          <span className="t-body-s ml-auto truncate" style={{ color: "var(--bd-fg-muted)" }}>
            {chapterLabel} · {title}
          </span>
        </div>
        {quote && (
          <blockquote
            className="rounded-[14px] border-l-2 px-4 py-3 font-reading text-sm leading-relaxed italic"
            style={{
              background: "var(--bd-surface-raised)",
              borderColor: "var(--bd-accent)",
              color: "var(--bd-fg-subtle)",
            }}
          >
            "{quote}"
          </blockquote>
        )}
        {prompt && (
          <div className="flex justify-end">
            <div
              className="max-w-[72%] rounded-[18px] rounded-br px-4 py-2.5 text-sm leading-snug"
              style={{ background: "var(--bd-action)", color: "var(--bd-action-fg)" }}
            >
              {prompt}
            </div>
          </div>
        )}
        <p
          className="font-reading text-base leading-relaxed"
          style={{ color: "var(--bd-fg-subtle)" }}
        >
          {answer}
        </p>
        <div className="flex flex-wrap gap-2">
          {["Give me an example", "Why does this matter?", "Save to notes"].map((item) => (
            <span key={item} className="bd-chip bd-chip-outline">
              {item}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function NotesRail({
  documentId,
  sections,
  currentOrder,
  refreshToken,
  onJumpToTarget,
}: {
  documentId: string;
  sections?: ReadonlyArray<DocumentSectionSummary>;
  currentOrder?: number;
  refreshToken: number;
  onJumpToTarget: (order: number, highlightId?: string | null, noteId?: string | null) => void;
}) {
  const { client } = useSdk();
  const [items, setItems] = useState<ReadonlyArray<Note> | null>(null);
  const [highlightsById, setHighlightsById] = useState<Map<string, Highlight>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const sectionInfoByKey = useMemo(() => {
    const map = new Map<string, { order: number; title: string }>();
    if (sections) {
      for (const s of sections) map.set(s.sectionKey, { order: s.order, title: s.title });
    }
    return map;
  }, [sections]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([client.note.list({ documentId }), client.highlight.list({ documentId })])
      .then(([notes, highlights]) => {
        if (cancelled) return;
        setItems(notes.data?.items ?? []);
        const map = new Map<string, Highlight>();
        for (const h of highlights.data?.items ?? []) map.set(h.id, h);
        setHighlightsById(map);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId, refreshToken]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="t-label-s mb-3" style={{ color: "var(--bd-fg-muted)" }}>
        Your notes {items ? `· ${items.length}` : ""}
      </div>
      <div className="min-h-0 overflow-y-auto pr-1">
        {error && (
          <p className="t-body-s" style={{ color: "var(--bd-fg-muted)" }}>
            {error}
          </p>
        )}
        {items === null && <RailSkeleton label="Notes" />}
        {items?.length === 0 && !error && (
          <p className="t-body-s" style={{ color: "var(--bd-fg-muted)" }}>
            Highlight a passage or jot a thought to start your notebook.
          </p>
        )}
        {items?.map((n) => {
          const highlight = n.highlightId ? highlightsById.get(n.highlightId) : undefined;
          const sectionKey = n.sectionKey ?? highlight?.sectionKey ?? null;
          const info = sectionKey ? sectionInfoByKey.get(sectionKey) : undefined;
          const isCurrent = info?.order === currentOrder;
          const label = labelFor(info);
          const targetHighlightId = highlight?.id ?? null;
          return (
            <button
              key={n.id}
              type="button"
              className="mb-3 block w-full rounded-xl p-3 text-left"
              style={{
                background: "var(--bd-surface-raised)",
                boxShadow: isCurrent ? "inset 0 0 0 1px var(--bd-border-strong)" : undefined,
              }}
              onClick={() => {
                if (info) onJumpToTarget(info.order, targetHighlightId, n.id);
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: highlight ? `var(--hl-${highlight.color})` : "currentColor",
                    opacity: highlight ? 1 : 0.4,
                  }}
                />
                <span className="t-body-s truncate" style={{ color: "var(--bd-fg-muted)" }}>
                  {label} · {formatRelativeTime(n.createdAt)}
                </span>
              </div>
              {highlight && (
                <p
                  className="mt-2 line-clamp-3 font-reading text-[13px] leading-snug italic"
                  style={{ color: "var(--bd-fg-subtle)" }}
                >
                  "{highlight.textSnippet}"
                </p>
              )}
              <p className="t-body-s mt-2 line-clamp-3" style={{ color: "var(--bd-fg-subtle)" }}>
                {n.body}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChapterNav({
  canPrev,
  canNext,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canPrev) onPrev();
      if (e.key === "ArrowRight" && canNext) onNext();
    },
    [canPrev, canNext, onPrev, onNext],
  );
  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);

  return (
    <nav className="mt-12 flex justify-between gap-3">
      <Button variant="secondary" disabled={!canPrev} onClick={onPrev}>
        ← {prevLabel}
      </Button>
      <Button variant="secondary" disabled={!canNext} onClick={onNext}>
        {nextLabel} →
      </Button>
    </nav>
  );
}

function ChapterSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton width="70%" height={36} className="mb-6" />
      <Skeleton width="100%" height={14} />
      <Skeleton width="96%" height={14} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="88%" height={14} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="62%" height={14} />
    </div>
  );
}

const RELATIVE_THRESHOLDS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

const formatRelativeTime = (iso: string): string => {
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = new Date(iso).getTime() - Date.now();
  let value = diffMs / 1000;
  for (const [step, unit] of RELATIVE_THRESHOLDS) {
    if (Math.abs(value) < step) return fmt.format(Math.round(value), unit);
    value /= step;
  }
  return fmt.format(Math.round(value), "year");
};

const labelFor = (info: { order: number; title: string } | undefined): string => {
  if (!info) return "Section";
  return `Ch. ${info.order + 1} · ${info.title}`;
};

const excerptText = (text: string, max: number): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
};

// Section keys mint as `${kind}:section:${order}`. Reading the order back
// out lets the dashboard / progress UI display "Chapter N" without
// needing the manifest.
const parseSectionOrder = (sectionKey: string): number | null => {
  const match = /:section:(\d+)$/.exec(sectionKey);
  if (!match) return null;
  return Number(match[1]);
};
