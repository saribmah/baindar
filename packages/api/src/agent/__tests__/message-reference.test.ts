import { describe, expect, it } from "bun:test";
import {
  referenceDataPartToModelPart,
  referenceToModelText,
  validateReferenceDataParts,
} from "../message-reference";

describe("message references", () => {
  it("validates supported reference data parts", () => {
    const messages = [
      {
        parts: [
          { type: "text", text: "Explain this" },
          {
            type: "data-reference",
            data: {
              kind: "book",
              documentId: "doc-1",
              documentTitle: "Designing Data-Intensive Applications",
            },
          },
          {
            type: "data-reference",
            data: {
              kind: "passage",
              documentId: "doc-1",
              documentTitle: "Designing Data-Intensive Applications",
              sectionKey: "epub:section:4",
              sectionOrder: 4,
              position: { offsetStart: 10, offsetEnd: 32 },
              previewText: "Indexes are additional structures",
            },
          },
          {
            type: "data-reference",
            data: {
              kind: "highlight",
              documentId: "doc-1",
              documentTitle: "Designing Data-Intensive Applications",
              sectionKey: "epub:section:4",
              sectionOrder: 4,
              highlightId: "hl-1",
              position: { offsetStart: 10, offsetEnd: 32 },
              previewText: "Indexes are additional structures",
              color: "yellow",
            },
          },
          {
            type: "data-reference",
            data: {
              kind: "note",
              documentId: "doc-1",
              documentTitle: "Designing Data-Intensive Applications",
              noteId: "note-1",
              body: "Worth revisiting before database chapter.",
              sectionKey: "epub:section:4",
              sectionOrder: 4,
              highlightId: "hl-1",
              position: { offsetStart: 10, offsetEnd: 32 },
              previewText: "Indexes are additional structures",
            },
          },
        ],
      },
    ];

    expect(validateReferenceDataParts(messages)).toEqual({ ok: true });
  });

  it("rejects malformed reference data parts", () => {
    expect(
      validateReferenceDataParts([
        {
          parts: [
            {
              type: "data-reference",
              data: {
                kind: "passage",
                documentId: "doc-1",
              },
            },
          ],
        },
      ]),
    ).toEqual({ ok: false, message: "Invalid message reference" });
  });

  it("converts references to compact model-visible text", () => {
    const text = referenceToModelText({
      kind: "highlight",
      documentId: "doc-1",
      documentTitle: "Manual",
      sectionKey: "epub:section:2",
      sectionOrder: 2,
      highlightId: "hl-1",
      position: { offsetStart: 4, offsetEnd: 18 },
      previewText: "Keep the gasket seated.",
    });

    expect(text).toContain("User reference: highlight");
    expect(text).toContain("Highlight ID: hl-1");
    expect(text).toContain("Preview: Keep the gasket seated.");
  });

  it("ignores malformed data during conversion", () => {
    const part = {
      type: "data-reference",
      data: { kind: "book", documentId: "" },
    };

    expect(referenceDataPartToModelPart(part)).toBeUndefined();
  });
});
