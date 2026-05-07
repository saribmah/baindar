import { describe, expect, test } from "bun:test";
import { chatToolFromPart } from "./chatTools";

describe("chatToolFromPart", () => {
  test("shows runBash description without exposing the command", () => {
    const tool = chatToolFromPart({
      type: "tool-runBash",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        description: "Search lease terms",
        command: "rg -n pets /mnt/baindar/documents/doc-1/content",
        timeoutMs: 5_000,
      },
    });

    expect(tool).toMatchObject({
      id: "call-1",
      kind: "runBash",
      state: "running",
      query: "Search lease terms",
    });
    expect(JSON.stringify(tool)).not.toContain("rg -n pets");
  });

  test("keeps failed tool errors short enough for the chat rail", () => {
    const tool = chatToolFromPart({
      type: "tool-runBash",
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
