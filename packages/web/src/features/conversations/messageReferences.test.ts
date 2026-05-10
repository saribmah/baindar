import { describe, expect, it } from "bun:test";
import {
  messageReferences,
  messageText,
  referenceDescription,
  referenceLabel,
  referenceToReaderPath,
  type MessageReference,
} from "./messageReferences";

describe("messageReferences", () => {
  const passage: MessageReference = {
    kind: "passage",
    documentId: "doc-1",
    documentTitle: "Manual",
    sectionKey: "epub:section:3",
    sectionOrder: 3,
    sectionTitle: "Maintenance",
    position: { offsetStart: 12, offsetEnd: 40 },
    previewText: "Keep the gasket seated while closing the latch.",
  };

  it("extracts text separately from reference parts", () => {
    const parts = [
      { type: "data-reference", data: passage },
      { type: "text", text: "Explain this." },
    ];

    expect(messageText(parts)).toBe("Explain this.");
    expect(messageReferences(parts)).toEqual([passage]);
  });

  it("builds reader paths for passage, highlight, note, and book references", () => {
    expect(referenceToReaderPath(passage, "abc")).toBe(
      "/read/doc-1?chapter=3&rangeStart=12&rangeEnd=40&target=abc",
    );

    expect(
      referenceToReaderPath(
        {
          kind: "highlight",
          documentId: "doc-1",
          documentTitle: "Manual",
          sectionKey: "epub:section:3",
          sectionOrder: 3,
          highlightId: "hl-1",
          position: { offsetStart: 12, offsetEnd: 40 },
          previewText: "Keep the gasket seated while closing the latch.",
          color: "yellow",
        },
        "abc",
      ),
    ).toBe("/read/doc-1?chapter=3&highlight=hl-1&target=abc");

    expect(
      referenceToReaderPath(
        {
          kind: "note",
          documentId: "doc-1",
          documentTitle: "Manual",
          noteId: "note-1",
          body: "Important reminder.",
        },
        "abc",
      ),
    ).toBe("/read/doc-1?note=note-1&target=abc");

    expect(
      referenceToReaderPath(
        {
          kind: "book",
          documentId: "doc-1",
          documentTitle: "Manual",
        },
        "abc",
      ),
    ).toBe("/read/doc-1?target=abc");
  });

  it("routes chapter references to the chapter without a range", () => {
    const chapter: MessageReference = {
      kind: "chapter",
      documentId: "doc-1",
      documentTitle: "Manual",
      sectionKey: "epub:section:3",
      sectionOrder: 3,
      sectionTitle: "Maintenance",
    };

    expect(referenceToReaderPath(chapter, "abc")).toBe("/read/doc-1?chapter=3&target=abc");
    expect(referenceLabel(chapter)).toBe("Maintenance");
    expect(referenceDescription(chapter)).toBe("Manual");
  });

  it("labels document-level notes distinctly from section notes", () => {
    expect(
      referenceLabel({
        kind: "note",
        documentId: "doc-1",
        documentTitle: "Manual",
        noteId: "note-1",
        body: "Document-level thought.",
      }),
    ).toBe("Note · Whole book");
  });
});
