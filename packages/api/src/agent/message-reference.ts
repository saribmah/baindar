import { z } from "zod";
import type { DataUIPart, UIMessage } from "ai";

const Position = z
  .object({
    offsetStart: z.number().int().nonnegative(),
    offsetEnd: z.number().int().nonnegative(),
  })
  .refine((value) => value.offsetStart <= value.offsetEnd, {
    message: "offsetStart must be <= offsetEnd",
    path: ["offsetEnd"],
  });

export const MessageReference = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("book"),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
  }),
  z.object({
    kind: z.literal("chapter"),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    sectionKey: z.string().min(1),
    sectionOrder: z.number().int().nonnegative(),
    sectionTitle: z.string().optional(),
  }),
  z.object({
    kind: z.literal("passage"),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    sectionKey: z.string().min(1),
    sectionOrder: z.number().int().nonnegative(),
    sectionTitle: z.string().optional(),
    position: Position,
    previewText: z.string().min(1),
  }),
  z.object({
    kind: z.literal("highlight"),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    sectionKey: z.string().min(1),
    sectionOrder: z.number().int().nonnegative(),
    highlightId: z.string().min(1),
    position: Position,
    previewText: z.string().min(1),
    color: z.string().optional(),
  }),
  z.object({
    kind: z.literal("note"),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    noteId: z.string().min(1),
    body: z.string().min(1),
    sectionKey: z.string().min(1).optional(),
    sectionOrder: z.number().int().nonnegative().optional(),
    highlightId: z.string().min(1).optional(),
    position: Position.optional(),
    previewText: z.string().optional(),
  }),
]);
export type MessageReference = z.infer<typeof MessageReference>;

export type BaindarAgentMessage = UIMessage<unknown, { reference: MessageReference }>;
export type MessageReferenceDataPart = DataUIPart<{ reference: MessageReference }>;

export const validateReferenceDataParts = (
  messages: ReadonlyArray<{ parts: ReadonlyArray<unknown> }>,
): { ok: true } | { ok: false; message: string } => {
  for (const message of messages) {
    for (const part of message.parts) {
      const record = asRecord(part);
      if (record.type !== "data-reference") continue;
      const parsed = MessageReference.safeParse(record.data);
      if (!parsed.success) {
        return { ok: false, message: "Invalid message reference" };
      }
    }
  }
  return { ok: true };
};

export const referenceDataPartToModelPart = (part: { data: unknown }) => {
  const parsed = MessageReference.safeParse(part.data);
  if (!parsed.success) return undefined;
  return { type: "text" as const, text: referenceToModelText(parsed.data) };
};

export const referenceToModelText = (reference: MessageReference): string => {
  if (reference.kind === "book") {
    return `User reference: whole book\nDocument: ${reference.documentTitle}\nDocument ID: ${reference.documentId}`;
  }

  if (reference.kind === "chapter") {
    return [
      "User reference: chapter",
      `Document: ${reference.documentTitle}`,
      `Document ID: ${reference.documentId}`,
      `Section title: ${reference.sectionTitle ?? `Chapter ${reference.sectionOrder + 1}`}`,
      `Section key: ${reference.sectionKey}`,
    ].join("\n");
  }

  if (reference.kind === "passage") {
    return [
      "User reference: passage",
      `Document: ${reference.documentTitle}`,
      `Document ID: ${reference.documentId}`,
      `Section title: ${reference.sectionTitle ?? `Chapter ${reference.sectionOrder + 1}`}`,
      `Section key: ${reference.sectionKey}`,
      `Offsets: ${reference.position.offsetStart}-${reference.position.offsetEnd}`,
      `Preview: ${reference.previewText}`,
    ].join("\n");
  }

  if (reference.kind === "highlight") {
    return [
      "User reference: highlight",
      `Document: ${reference.documentTitle}`,
      `Document ID: ${reference.documentId}`,
      `Highlight ID: ${reference.highlightId}`,
      `Section key: ${reference.sectionKey}`,
      `Offsets: ${reference.position.offsetStart}-${reference.position.offsetEnd}`,
      `Preview: ${reference.previewText}`,
    ].join("\n");
  }

  return [
    "User reference: note",
    `Document: ${reference.documentTitle}`,
    `Document ID: ${reference.documentId}`,
    `Note ID: ${reference.noteId}`,
    reference.sectionKey ? `Section key: ${reference.sectionKey}` : "Section scope: whole document",
    reference.highlightId ? `Attached highlight ID: ${reference.highlightId}` : null,
    reference.position
      ? `Offsets: ${reference.position.offsetStart}-${reference.position.offsetEnd}`
      : null,
    reference.previewText ? `Passage preview: ${reference.previewText}` : null,
    `Note body: ${reference.body}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
