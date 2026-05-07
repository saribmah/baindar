import type { UIMessage } from "ai";
import type { Document, Highlight, Note } from "@baindar/sdk";

export type ReferencePosition = {
  offsetStart: number;
  offsetEnd: number;
};

export type BookReference = {
  kind: "book";
  documentId: string;
  documentTitle: string;
};

export type PassageReference = {
  kind: "passage";
  documentId: string;
  documentTitle: string;
  sectionKey: string;
  sectionOrder: number;
  sectionTitle?: string;
  position: ReferencePosition;
  previewText: string;
};

export type HighlightReference = {
  kind: "highlight";
  documentId: string;
  documentTitle: string;
  sectionKey: string;
  sectionOrder: number;
  highlightId: string;
  position: ReferencePosition;
  previewText: string;
  color?: string;
};

export type NoteReference = {
  kind: "note";
  documentId: string;
  documentTitle: string;
  noteId: string;
  body: string;
  sectionKey?: string;
  sectionOrder?: number;
  highlightId?: string;
  position?: ReferencePosition;
  previewText?: string;
};

export type MessageReference =
  | BookReference
  | PassageReference
  | HighlightReference
  | NoteReference;

export type BaindarChatMessage = UIMessage<unknown, { reference: MessageReference }>;

export const makeBookReference = (document: Pick<Document, "id" | "title">): BookReference => ({
  kind: "book",
  documentId: document.id,
  documentTitle: document.title,
});

export const makePassageReference = ({
  document,
  sectionKey,
  sectionOrder,
  sectionTitle,
  position,
  previewText,
}: {
  document: Pick<Document, "id" | "title">;
  sectionKey: string;
  sectionOrder: number;
  sectionTitle?: string;
  position: ReferencePosition;
  previewText: string;
}): PassageReference => ({
  kind: "passage",
  documentId: document.id,
  documentTitle: document.title,
  sectionKey,
  sectionOrder,
  sectionTitle,
  position,
  previewText: previewText.trim(),
});

export const makeHighlightReference = ({
  document,
  highlight,
  sectionOrder,
}: {
  document: Pick<Document, "id" | "title">;
  highlight: Highlight;
  sectionOrder: number;
}): HighlightReference => ({
  kind: "highlight",
  documentId: document.id,
  documentTitle: document.title,
  sectionKey: highlight.sectionKey,
  sectionOrder,
  highlightId: highlight.id,
  position: highlight.position,
  previewText: highlight.textSnippet,
  color: highlight.color,
});

export const makeNoteReference = ({
  document,
  note,
  highlight,
  sectionOrder,
}: {
  document: Pick<Document, "id" | "title">;
  note: Note;
  highlight?: Highlight;
  sectionOrder?: number;
}): NoteReference => ({
  kind: "note",
  documentId: document.id,
  documentTitle: document.title,
  noteId: note.id,
  body: note.body,
  sectionKey: note.sectionKey ?? highlight?.sectionKey ?? undefined,
  sectionOrder,
  highlightId: note.highlightId ?? undefined,
  position: highlight?.position,
  previewText: highlight?.textSnippet,
});

export const referenceLabel = (reference: MessageReference): string => {
  if (reference.kind === "book") return reference.documentTitle;
  if (reference.kind === "passage")
    return reference.sectionTitle ?? `Chapter ${reference.sectionOrder + 1}`;
  if (reference.kind === "highlight") return `Highlight · Ch. ${reference.sectionOrder + 1}`;
  if (reference.sectionOrder !== undefined) return `Note · Ch. ${reference.sectionOrder + 1}`;
  return "Note · Whole book";
};

export const referenceDescription = (reference: MessageReference): string => {
  if (reference.kind === "book") return "Whole book";
  if (reference.kind === "note") return truncate(reference.previewText ?? reference.body, 72);
  return truncate(reference.previewText, 72);
};

export const referenceKey = (reference: MessageReference): string => {
  if (reference.kind === "book") return `book:${reference.documentId}`;
  if (reference.kind === "passage") {
    return `passage:${reference.documentId}:${reference.sectionKey}:${reference.position.offsetStart}:${reference.position.offsetEnd}`;
  }
  if (reference.kind === "highlight") return `highlight:${reference.highlightId}`;
  return `note:${reference.noteId}`;
};

export const referenceToReaderPath = (
  reference: MessageReference,
  target: string = "1",
): string => {
  const params = new URLSearchParams();
  if (reference.kind === "book") {
    params.set("target", target);
    return `/read/${reference.documentId}?${params.toString()}`;
  }

  const sectionOrder = reference.sectionOrder;
  if (sectionOrder !== undefined) params.set("chapter", String(sectionOrder));

  if (reference.kind === "passage") {
    params.set("rangeStart", String(reference.position.offsetStart));
    params.set("rangeEnd", String(reference.position.offsetEnd));
  }

  if (reference.kind === "highlight") {
    params.set("highlight", reference.highlightId);
  }

  if (reference.kind === "note") {
    if (reference.highlightId) params.set("highlight", reference.highlightId);
    if (reference.position) {
      params.set("rangeStart", String(reference.position.offsetStart));
      params.set("rangeEnd", String(reference.position.offsetEnd));
    }
    params.set("note", reference.noteId);
  }

  params.set("target", target);
  return `/read/${reference.documentId}?${params.toString()}`;
};

export const messageText = (parts: ReadonlyArray<unknown>): string =>
  parts
    .map((part) => {
      const record = asRecord(part);
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("");

export const messageReferences = (parts: ReadonlyArray<unknown>): MessageReference[] =>
  parts
    .map((part) => {
      const record = asRecord(part);
      if (record.type !== "data-reference") return null;
      return parseMessageReference(record.data);
    })
    .filter((reference): reference is MessageReference => reference !== null);

export const referenceDataPart = (reference: MessageReference) => ({
  type: "data-reference" as const,
  data: reference,
});

export const parseSectionOrder = (sectionKey: string | null | undefined): number | undefined => {
  if (!sectionKey) return undefined;
  const match = /:(\d+)$/.exec(sectionKey);
  if (!match) return undefined;
  const order = Number(match[1]);
  return Number.isFinite(order) ? order : undefined;
};

const parseMessageReference = (value: unknown): MessageReference | null => {
  const record = asRecord(value);
  const kind = record.kind;
  if (
    kind === "book" &&
    typeof record.documentId === "string" &&
    typeof record.documentTitle === "string"
  ) {
    return { kind, documentId: record.documentId, documentTitle: record.documentTitle };
  }

  if (
    (kind === "passage" || kind === "highlight") &&
    typeof record.documentId === "string" &&
    typeof record.documentTitle === "string" &&
    typeof record.sectionKey === "string" &&
    typeof record.sectionOrder === "number" &&
    typeof record.previewText === "string"
  ) {
    const position = parsePosition(record.position);
    if (!position) return null;
    if (kind === "highlight") {
      if (typeof record.highlightId !== "string") return null;
      return {
        kind,
        documentId: record.documentId,
        documentTitle: record.documentTitle,
        sectionKey: record.sectionKey,
        sectionOrder: record.sectionOrder,
        highlightId: record.highlightId,
        position,
        previewText: record.previewText,
        color: typeof record.color === "string" ? record.color : undefined,
      };
    }
    return {
      kind,
      documentId: record.documentId,
      documentTitle: record.documentTitle,
      sectionKey: record.sectionKey,
      sectionOrder: record.sectionOrder,
      sectionTitle: typeof record.sectionTitle === "string" ? record.sectionTitle : undefined,
      position,
      previewText: record.previewText,
    };
  }

  if (
    kind === "note" &&
    typeof record.documentId === "string" &&
    typeof record.documentTitle === "string" &&
    typeof record.noteId === "string" &&
    typeof record.body === "string"
  ) {
    return {
      kind,
      documentId: record.documentId,
      documentTitle: record.documentTitle,
      noteId: record.noteId,
      body: record.body,
      sectionKey: typeof record.sectionKey === "string" ? record.sectionKey : undefined,
      sectionOrder: typeof record.sectionOrder === "number" ? record.sectionOrder : undefined,
      highlightId: typeof record.highlightId === "string" ? record.highlightId : undefined,
      position: parsePosition(record.position) ?? undefined,
      previewText: typeof record.previewText === "string" ? record.previewText : undefined,
    };
  }

  return null;
};

const parsePosition = (value: unknown): ReferencePosition | null => {
  const record = asRecord(value);
  if (typeof record.offsetStart !== "number" || typeof record.offsetEnd !== "number") return null;
  if (!Number.isInteger(record.offsetStart) || !Number.isInteger(record.offsetEnd)) return null;
  if (record.offsetStart < 0 || record.offsetEnd < record.offsetStart) return null;
  return { offsetStart: record.offsetStart, offsetEnd: record.offsetEnd };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}...` : value;
