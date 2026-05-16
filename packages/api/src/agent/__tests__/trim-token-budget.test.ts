import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "ai";
import { MAX_PROMPT_CHARS, trimToTokenBudget } from "../trim-token-budget";

// Per-turn token ceiling. The function trims oldest user-turn boundaries
// until the message list fits under MAX_PROMPT_CHARS. We only trim at user
// boundaries so tool-call / tool-result pairs that sit between them stay
// intact — Anthropic rejects orphaned pairs with a 400.

const userText = (text: string): ModelMessage => ({ role: "user", content: text });
const assistantText = (text: string): ModelMessage => ({ role: "assistant", content: text });
const big = (n: number): string => "x".repeat(n);

describe("trimToTokenBudget", () => {
  it("returns the input unchanged when under budget", () => {
    const messages = [userText("hi"), assistantText("hello"), userText("ok")];
    expect(trimToTokenBudget(messages)).toBe(messages);
  });

  it("returns an empty list unchanged", () => {
    expect(trimToTokenBudget([])).toEqual([]);
  });

  it("returns a single huge user message unchanged (nothing safe to trim)", () => {
    // With only one user message the function has no boundary to cut at,
    // so it bails rather than producing an empty list (which would crash
    // the SDK call). Per-turn input cap is best-effort upstream truncation.
    const messages = [userText(big(MAX_PROMPT_CHARS * 2))];
    expect(trimToTokenBudget(messages)).toBe(messages);
  });

  it("trims oldest user turns until the rest fits under budget", () => {
    const huge = big(MAX_PROMPT_CHARS); // each turn alone is at the budget
    const messages = [
      userText(huge),
      assistantText("a1"),
      userText(huge),
      assistantText("a2"),
      userText("recent"),
    ];
    const trimmed = trimToTokenBudget(messages);
    expect(trimmed.length).toBeLessThan(messages.length);
    // The most recent user message must always survive.
    expect(trimmed[trimmed.length - 1]?.content).toBe("recent");
  });

  it("always preserves the most recent user message even when the prior turn is huge", () => {
    const messages = [
      userText("first"),
      assistantText("reply"),
      userText(big(MAX_PROMPT_CHARS + 1_000)),
    ];
    const trimmed = trimToTokenBudget(messages);
    expect(trimmed[trimmed.length - 1]?.role).toBe("user");
  });

  it("preserves contiguous tool-call/result pairs by cutting only at user boundaries", () => {
    // Mimic a real tool-using turn: user → assistant(tool-call) → tool(result) → user.
    // Trimming must not orphan the tool-result inside an older turn.
    const messages: ModelMessage[] = [
      userText(big(MAX_PROMPT_CHARS)),
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "search",
            input: { query: "test" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "search",
            output: { type: "text", value: big(MAX_PROMPT_CHARS) },
          },
        ],
      },
      userText("follow up"),
    ];
    const trimmed = trimToTokenBudget(messages);
    // The cut should land at the user-turn boundary, so the only remaining
    // user message is the most recent one — the orphaned tool pair from the
    // old turn must be gone.
    const remainingRoles = trimmed.map((m) => m.role);
    expect(remainingRoles[0]).toBe("user");
    expect(remainingRoles.filter((r) => r === "tool").length).toBe(0);
  });
});
