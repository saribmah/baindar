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
              kind: "chapter",
              documentId: "doc-1",
              documentTitle: "Designing Data-Intensive Applications",
              sectionKey: "epub:section:4",
              sectionOrder: 4,
              sectionTitle: "Storage and Retrieval",
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
    expect(text).toContain("Section key: epub:section:2");
    expect(text).toContain("Preview: Keep the gasket seated.");
  });

  it("formats chapter references with section title and key but no offsets", () => {
    const text = referenceToModelText({
      kind: "chapter",
      documentId: "doc-1",
      documentTitle: "Atomic Habits",
      sectionKey: "epub:section:6",
      sectionOrder: 6,
      sectionTitle: "1: The Surprising Power of Atomic Habits",
    });

    expect(text).toContain("User reference: chapter");
    expect(text).toContain("Section title: 1: The Surprising Power of Atomic Habits");
    expect(text).toContain("Section key: epub:section:6");
    expect(text).not.toContain("Offsets:");
    expect(text).not.toContain("Preview:");
  });

  it("emits section title and section key as distinct lines for passages", () => {
    const text = referenceToModelText({
      kind: "passage",
      documentId: "doc-1",
      documentTitle: "Atomic Habits",
      sectionKey: "epub:section:6",
      sectionOrder: 6,
      sectionTitle: "1: The Surprising Power of Atomic Habits",
      position: { offsetStart: 0, offsetEnd: 42 },
      previewText: "Small habits compound over time.",
    });

    expect(text).toContain("Section title: 1: The Surprising Power of Atomic Habits");
    expect(text).toContain("Section key: epub:section:6");
    // The old format combined them into one line — guard against regressions.
    expect(text).not.toMatch(/Section: .* \(epub:section:6\)/);
  });

  it("notes without a section emit a distinct scope label, not a key", () => {
    const text = referenceToModelText({
      kind: "note",
      documentId: "doc-1",
      documentTitle: "Manual",
      noteId: "note-1",
      body: "Read later.",
    });
    expect(text).toContain("Section scope: whole document");
    expect(text).not.toContain("Section key:");
  });

  it("ignores malformed data during conversion", () => {
    const part = {
      type: "data-reference",
      data: { kind: "book", documentId: "" },
    };

    expect(referenceDataPartToModelPart(part)).toBeUndefined();
  });
});
