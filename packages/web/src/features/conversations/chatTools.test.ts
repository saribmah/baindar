import { describe, expect, test } from "bun:test";
import { chatToolFromPart } from "./chatTools";

describe("chatToolFromPart", () => {
  test("classifies cross-binder search tool calls", () => {
    const tool = chatToolFromPart({
      type: "tool-search_binder",
      toolCallId: "call-1",
      state: "output-available",
      input: {
        query: "lease pets",
      },
      output: [
        {
          documentTitle: "Apartment Lease",
          sectionTitle: "Pets",
          snippet: "Pets are allowed with written consent.",
        },
      ],
    });

    expect(tool).toMatchObject({
      id: "call-1",
      kind: "searchLibrary",
      state: "success",
      query: "lease pets",
      results: [
        {
          label: "Apartment Lease",
          text: "Pets are allowed with written consent.",
        },
      ],
    });
  });

  test("classifies notes and read-section typed tools", () => {
    expect(
      chatToolFromPart({
        type: "tool-list_notes",
        state: "output-available",
        input: { document_id: "doc-1" },
        output: [{ body: "Call landlord about renewal." }],
      }),
    ).toMatchObject({
      kind: "notes",
      query: "doc-1",
      results: [{ text: "Call landlord about renewal." }],
    });

    expect(
      chatToolFromPart({
        type: "tool-read_section",
        state: "output-available",
        input: { section_key: "epub:section:4" },
        output: {
          chunks: [
            {
              sectionTitle: "Renewal",
              text: "Either party may renew the lease in writing.",
            },
          ],
        },
      }),
    ).toMatchObject({
      kind: "documents",
      query: "epub:section:4",
      results: [{ label: "Renewal", text: "Either party may renew the lease in writing." }],
    });
  });

  test("keeps failed tool errors short enough for the chat rail", () => {
    const tool = chatToolFromPart({
      type: "tool-search_document",
      toolCallId: "call-2",
      state: "output-error",
      errorText:
        "Failed to execute command 'bash' /tmp/baindar/very/long/path/that/should/not/stretch/the/chat/panel/with/a/long/error/message",
    });

    expect(tool?.state).toBe("error");
    expect(tool?.error?.length).toBeLessThanOrEqual(96);
    expect(tool?.error?.endsWith("...")).toBe(true);
  });
});
