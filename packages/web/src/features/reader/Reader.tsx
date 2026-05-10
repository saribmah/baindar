import {
  createContext,
  type CSSProperties,
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
  Conversation,
  Document,
  DocumentManifest,
  DocumentSectionSummary,
  EpubTocItem,
  Highlight,
  Note,
} from "@baindar/sdk";
import { useSdk } from "../../sdk";
import {
  ConversationChatPane,
  makeBookReference,
  makeChapterReference,
  makeHighlightReference,
  makeNoteReference,
  makePassageReference,
  parseSectionOrder as parseReferenceSectionOrder,
  type MessageReference,
} from "../conversations";
import { HighlightLayer } from "./HighlightLayer";
import { ReaderHighlightsProvider, useReaderHighlights } from "./highlightsRefresh";
import { NotesSheet } from "./NotesSheet";
import { TocSheet } from "./TocSheet";
import { charOffsetsToRange, unwrapMarks, wrapRangeWithMarks } from "./textOffsets";

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
  sectionKey: string;
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
  prompt?: string;
  references?: ReadonlyArray<MessageReference>;
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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [query]);
  return matches;
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
  const { client } = useSdk();
  const { theme, cycleTheme } = useTheme();
  const { position } = useReaderPosition();
  const { meta } = useReaderMeta();
  const { toc } = useReaderToc();
  const refresh = useReaderHighlights();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationPromiseRef = useRef<Promise<Conversation | null> | null>(null);
  const isXl = useMediaQuery("(min-width: 1280px)");
  const [tocOpen, setTocOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1280px)").matches;
  });
  const [notesOpen, setNotesOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1280px)").matches;
  });
  const [aiOpen, setAiOpen] = useState(false);
  const rightOpen = aiOpen || notesOpen;
  const [readerConversation, setReaderConversation] = useState<Conversation | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [pendingReferences, setPendingReferences] = useState<MessageReference[]>([]);
  const [draftSeed, setDraftSeed] = useState("");
  const [draftSeedKey, setDraftSeedKey] = useState<string | undefined>(undefined);
  const [fontScale, setFontScale] = useState<ReaderFontScale>("standard");

  const currentOrder = meta?.chapterOrder ?? Math.max(0, Number(searchParams.get("chapter") ?? 0));
  const targetNoteId = searchParams.get("note");
  const targetHighlightId = searchParams.get("highlight");
  const targetRequestId = searchParams.get("target");
  const authorLabel = meta?.authors.length
    ? meta.authors.join(", ")
    : doc.originalFilename.replace(/\.[^.]+$/, "");
  const progressLabel =
    meta?.chapterCount !== undefined ? `${currentOrder + 1} / ${meta.chapterCount}` : position;

  const ensureReaderConversation = useCallback(async (): Promise<Conversation | null> => {
    if (readerConversation) return readerConversation;
    if (conversationPromiseRef.current) return conversationPromiseRef.current;

    const promise = (async () => {
      try {
        setConversationError(null);
        const list = await client.conversation.list();
        const existing =
          list.data?.items.find((conversation) => conversation.primaryDocId === doc.id) ?? null;
        if (existing) {
          setReaderConversation(existing);
          return existing;
        }

        const created = await client.conversation.create({
          title: doc.title,
          primaryDocId: doc.id,
        });
        if (!created.data) throw new Error("Could not start a reader conversation");
        setReaderConversation(created.data);
        return created.data;
      } catch (error) {
        setConversationError(error instanceof Error ? error.message : String(error));
        return null;
      } finally {
        conversationPromiseRef.current = null;
      }
    })();

    conversationPromiseRef.current = promise;
    return promise;
  }, [client, doc.id, doc.title, readerConversation]);

  const contextReference = useMemo<MessageReference>(() => {
    if (meta) {
      return makeChapterReference({
        document: doc,
        sectionKey: meta.sectionKey,
        sectionOrder: meta.chapterOrder,
        sectionTitle: meta.chapterTitle,
      });
    }
    return makeBookReference(doc);
  }, [doc, meta]);

  const openAsk = useCallback(
    (payload?: ReaderAskPayload) => {
      const references = payload?.references?.length ? [...payload.references] : [];
      setPendingReferences(references);
      setDraftSeed(payload?.prompt ?? "");
      setDraftSeedKey(String(Date.now()));
      setAiOpen(true);
      void ensureReaderConversation();
    },
    [ensureReaderConversation],
  );

  useEffect(() => {
    if (targetNoteId && !targetHighlightId) setNotesOpen(true);
  }, [targetHighlightId, targetNoteId, targetRequestId]);

  useEffect(() => {
    if (!isXl) {
      setTocOpen(false);
      setNotesOpen(false);
      setAiOpen(false);
    }
  }, [isXl]);

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
        </header>

        <div
          className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden"
          style={{
            gridTemplateColumns: isXl
              ? `${tocOpen ? "240px " : ""}minmax(0,1fr)${rightOpen ? (aiOpen ? " 460px" : " 240px") : ""}`
              : undefined,
          }}
        >
          {isXl && tocOpen && (
            <aside
              className="relative min-h-0 overflow-hidden border-r px-6 py-6"
              style={{ borderColor: "var(--bd-border)" }}
            >
              <IconButton
                aria-label="Close contents"
                size="sm"
                onClick={() => setTocOpen(false)}
                className="absolute right-3 top-3 z-10"
              >
                <Icons.Close size={14} />
              </IconButton>
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
          )}

          <section
            data-reader-scroll
            className="min-h-0 overflow-y-auto px-6 py-8 xl:px-10 xl:py-14"
          >
            <article className="mx-auto max-w-[620px] pb-32 xl:pb-12">
              {withReaderFont(children, fontScale)}
            </article>
          </section>

          {isXl && rightOpen && (
            <aside
              className="relative min-h-0 min-w-0 overflow-hidden border-l"
              style={{ borderColor: "var(--bd-border)" }}
            >
              {aiOpen ? (
                <ReaderChatPanel
                  conversation={readerConversation}
                  error={conversationError}
                  pendingReferences={pendingReferences}
                  contextReference={contextReference}
                  draftSeed={draftSeed}
                  draftSeedKey={draftSeedKey}
                  onPendingReferencesChange={setPendingReferences}
                  onClose={() => setAiOpen(false)}
                />
              ) : (
                <div className="h-full px-6 py-6">
                  <IconButton
                    aria-label="Close notes"
                    size="sm"
                    onClick={() => setNotesOpen(false)}
                    className="absolute right-3 top-3 z-10"
                  >
                    <Icons.Close size={14} />
                  </IconButton>
                  <NotesRail
                    documentId={doc.id}
                    sections={toc?.sections}
                    currentOrder={currentOrder}
                    refreshToken={refresh?.refreshToken ?? 0}
                    targetNoteId={targetNoteId}
                    onJumpToTarget={jumpToReaderTarget}
                  />
                </div>
              )}
            </aside>
          )}
        </div>

        <div className="fixed bottom-5 left-1/2 z-10 -translate-x-1/2">
          <FloatingToolbar>
            {toc && (!isXl || !tocOpen) && (
              <FloatingToolbarButton
                aria-label="Table of contents"
                onClick={() => setTocOpen(true)}
              >
                <Icons.BookOpen size={20} />
              </FloatingToolbarButton>
            )}
            {(!isXl || !notesOpen || aiOpen) && (
              <FloatingToolbarButton
                aria-label="Notes"
                onClick={() => {
                  setNotesOpen(true);
                  if (isXl) setAiOpen(false);
                }}
              >
                <Icons.Note size={20} />
              </FloatingToolbarButton>
            )}
            {(!isXl || !aiOpen) && (
              <FloatingToolbarButton aria-label="Ask Baindar" onClick={() => openAsk()}>
                <Icons.Sparkles size={20} />
              </FloatingToolbarButton>
            )}
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

        {!isXl && toc && tocOpen && (
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

        {!isXl && notesOpen && (
          <NotesSheet
            documentId={doc.id}
            sections={toc?.sections}
            currentOrder={currentOrder}
            refreshToken={refresh?.refreshToken ?? 0}
            targetNoteId={targetNoteId}
            onJumpToTarget={(order, highlightId, noteId) => {
              jumpToReaderTarget(order, highlightId, noteId);
              setNotesOpen(false);
            }}
            onClose={() => setNotesOpen(false)}
          />
        )}

        {aiOpen && (
          <ReaderChatOverlay
            theme={theme}
            conversation={readerConversation}
            error={conversationError}
            pendingReferences={pendingReferences}
            contextReference={contextReference}
            draftSeed={draftSeed}
            draftSeedKey={draftSeedKey}
            onPendingReferencesChange={setPendingReferences}
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
  const [error, setError] = useState<string | null>(null);
  const htmlRef = useRef<HTMLDivElement>(null);

  const initialOrder = doc.progress?.sectionKey
    ? (parseSectionOrder(doc.progress.sectionKey) ?? 0)
    : 0;
  const orderParam = searchParams.get("chapter");
  const order = orderParam !== null ? Math.max(0, Number(orderParam)) : Math.max(0, initialOrder);
  const documentId = doc.id;
  const targetHighlightId = searchParams.get("highlight");
  const targetNoteId = searchParams.get("note");
  const targetRequestId = searchParams.get("target");
  const targetRangeStart = searchParams.get("rangeStart");
  const targetRangeEnd = searchParams.get("rangeEnd");
  const askTarget = searchParams.get("ask");
  const handledAskRef = useRef<string | null>(null);

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
    const container = htmlRef.current;
    if (!container || !currentSection || chapterHtml === null) return;
    unwrapMarks(container, 'mark[data-reference-target="true"]');

    const offsetStart = Number(targetRangeStart);
    const offsetEnd = Number(targetRangeEnd);
    if (
      targetRangeStart === null ||
      targetRangeEnd === null ||
      !Number.isInteger(offsetStart) ||
      !Number.isInteger(offsetEnd) ||
      offsetStart < 0 ||
      offsetEnd < offsetStart
    ) {
      return;
    }

    const range = charOffsetsToRange(container, offsetStart, offsetEnd);
    if (!range) return;

    const marks = wrapRangeWithMarks(range, {
      className: "bd-highlight bd-highlight-blue bd-highlight-reference",
      attributes: { "data-reference-target": "true" },
    });
    marks[0]?.scrollIntoView({ block: "center", behavior: "smooth" });

    return () => {
      unwrapMarks(container, 'mark[data-reference-target="true"]');
    };
  }, [chapterHtml, currentSection, targetRangeEnd, targetRangeStart, targetRequestId]);

  useEffect(() => {
    if (!currentSection || !askTarget) return;
    const key = `${askTarget}:${documentId}:${targetNoteId ?? ""}:${targetHighlightId ?? ""}:${targetRequestId ?? ""}`;
    if (handledAskRef.current === key) return;
    handledAskRef.current = key;

    if (askTarget === "book") {
      openAsk({
        references: [makeBookReference(doc)],
        prompt: "What should I know about this book?",
      });
      return;
    }

    if (askTarget === "note" && targetNoteId) {
      let cancelled = false;
      client.note
        .get({ id: targetNoteId })
        .then(async (noteRes) => {
          if (cancelled || !noteRes.data) return;
          const note = noteRes.data;
          let highlight: Highlight | undefined;
          if (note.highlightId) {
            const highlights = await client.highlight.list({ documentId });
            highlight = highlights.data?.items.find((item) => item.id === note.highlightId);
          }
          if (cancelled) return;
          openAsk({
            references: [
              makeNoteReference({
                document: doc,
                note,
                highlight,
                sectionOrder: parseReferenceSectionOrder(note.sectionKey ?? highlight?.sectionKey),
              }),
            ],
            prompt: "What should I notice about this note?",
          });
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }
  }, [
    askTarget,
    client,
    currentSection,
    doc,
    documentId,
    openAsk,
    targetHighlightId,
    targetNoteId,
    targetRequestId,
  ]);

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
      sectionKey: currentSection.sectionKey,
    });
    return () => setMeta(null);
  }, [manifest, currentSection, order, setMeta]);

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
        <h1 className="font-display text-[28px] leading-tight font-normal tracking-[0] text-[var(--bd-fg)]">
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
        onAskSelection={(payload) => {
          const reference =
            payload.kind === "highlight"
              ? makeHighlightReference({
                  document: doc,
                  highlight: payload.highlight,
                  sectionOrder: order,
                })
              : makePassageReference({
                  document: doc,
                  sectionKey: currentSection.sectionKey,
                  sectionOrder: order,
                  sectionTitle: currentSection.title,
                  position: payload.position,
                  previewText: payload.text,
                });
          openAsk({ references: [reference], prompt: "What does this passage mean?" });
        }}
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

function ReaderChatPanel({
  conversation,
  error,
  pendingReferences,
  contextReference,
  draftSeed,
  draftSeedKey,
  onPendingReferencesChange,
  onClose,
}: {
  conversation: Conversation | null;
  error: string | null;
  pendingReferences: ReadonlyArray<MessageReference>;
  contextReference: MessageReference | null;
  draftSeed: string;
  draftSeedKey?: string;
  onPendingReferencesChange: (references: MessageReference[]) => void;
  onClose: () => void;
}) {
  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-bd-bg px-5 py-5">
        <p className="t-body-s rounded-md bg-bd-surface-hover px-3 py-2 text-error">{error}</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="h-full bg-bd-bg px-5 py-5">
        <RailSkeleton label="Baindar" />
      </div>
    );
  }

  return (
    <ConversationChatPane
      key={conversation.id}
      conversation={conversation}
      pendingReferences={pendingReferences}
      contextReference={contextReference}
      draftSeed={draftSeed}
      draftSeedKey={draftSeedKey}
      onPendingReferencesChange={onPendingReferencesChange}
      onClose={onClose}
    />
  );
}

function ReaderChatOverlay({
  theme,
  conversation,
  error,
  pendingReferences,
  contextReference,
  draftSeed,
  draftSeedKey,
  onPendingReferencesChange,
  onClose,
}: {
  theme: Theme;
  conversation: Conversation | null;
  error: string | null;
  pendingReferences: ReadonlyArray<MessageReference>;
  contextReference: MessageReference | null;
  draftSeed: string;
  draftSeedKey?: string;
  onPendingReferencesChange: (references: MessageReference[]) => void;
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask Baindar"
      className="fixed inset-0 z-30 flex flex-col justify-end xl:hidden"
      style={{ background: backdropBg }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="mx-auto flex max-h-[78vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[28px] shadow-[var(--sh-sheet)]"
        style={{ background: "var(--bd-bg)", color: "var(--bd-fg)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center px-6 pt-2">
          <div
            aria-hidden
            className="mb-3 h-1 w-10 rounded-full"
            style={{ background: "var(--bd-border-strong)" }}
          />
        </div>
        <ReaderChatPanel
          conversation={conversation}
          error={error}
          pendingReferences={pendingReferences}
          contextReference={contextReference}
          draftSeed={draftSeed}
          draftSeedKey={draftSeedKey}
          onPendingReferencesChange={onPendingReferencesChange}
          onClose={onClose}
        />
      </section>
    </div>
  );
}

function NotesRail({
  documentId,
  sections,
  currentOrder,
  refreshToken,
  targetNoteId,
  onJumpToTarget,
}: {
  documentId: string;
  sections?: ReadonlyArray<DocumentSectionSummary>;
  currentOrder?: number;
  refreshToken: number;
  targetNoteId?: string | null;
  onJumpToTarget: (order: number, highlightId?: string | null, noteId?: string | null) => void;
}) {
  const { client } = useSdk();
  const [items, setItems] = useState<ReadonlyArray<Note> | null>(null);
  const [highlightsById, setHighlightsById] = useState<Map<string, Highlight>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const targetNoteRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    targetNoteRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [items, targetNoteId]);

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
          const isTarget = n.id === targetNoteId;
          const label = labelFor(info);
          const targetHighlightId = highlight?.id ?? null;
          return (
            <button
              key={n.id}
              ref={isTarget ? targetNoteRef : undefined}
              type="button"
              className="mb-3 block w-full rounded-xl p-3 text-left"
              style={{
                background: "var(--bd-surface-raised)",
                boxShadow:
                  isCurrent || isTarget ? "inset 0 0 0 1px var(--bd-border-strong)" : undefined,
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

// Section keys mint as `${kind}:section:${order}`. Reading the order back
// out lets the dashboard / progress UI display "Chapter N" without
// needing the manifest.
const parseSectionOrder = (sectionKey: string): number | null => {
  const match = /:section:(\d+)$/.exec(sectionKey);
  if (!match) return null;
  return Number(match[1]);
};
