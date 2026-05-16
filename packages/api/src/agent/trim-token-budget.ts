import type { ModelMessage } from "ai";

// Per-turn input ceiling. Each `streamText` call may run up to 12 tool-loop
// steps and the full message history is re-sent every step, so an
// unbounded conversation can run a single user turn into the hundreds of
// thousands of input tokens (= dollars at Sonnet's $3/Mtok input rate).
// Cap the initial prompt size at ~150K tokens by trimming oldest message
// turns. Char-count heuristic (~4 chars/token); accurate enough for budget
// control and avoids round-trips to a token-count API.
export const MAX_PROMPT_CHARS = 600_000;

export const trimToTokenBudget = (messages: ModelMessage[]): ModelMessage[] => {
  if (messages.length === 0) return messages;
  const totalChars = estimateChars(messages);
  if (totalChars <= MAX_PROMPT_CHARS) return messages;

  // Find all user-message indices. We only ever trim at user-message
  // boundaries so that tool-call / tool-result pairs (which always sit
  // between two user messages) stay intact — orphaned tool results would
  // be rejected by Anthropic with a 400.
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") userIndices.push(i);
  }
  if (userIndices.length <= 1) return messages;

  // Peel turns from the front (oldest first), always keeping the most
  // recent user message + everything after it. Stop as soon as we're
  // under budget or only one user message remains.
  let cutAt = userIndices[0] ?? 0;
  for (let k = 1; k < userIndices.length; k++) {
    const remaining = messages.slice(userIndices[k]);
    if (estimateChars(remaining) <= MAX_PROMPT_CHARS) {
      cutAt = userIndices[k] ?? cutAt;
      break;
    }
    cutAt = userIndices[k] ?? cutAt;
  }
  const trimmed = messages.slice(cutAt);
  console.warn(
    `[chat] trimmed ${messages.length - trimmed.length} old messages to stay under prompt budget (${totalChars} -> ${estimateChars(trimmed)} chars)`,
  );
  return trimmed;
};

const estimateChars = (messages: ModelMessage[]): number => {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        total += JSON.stringify(part).length;
      }
    }
  }
  return total;
};
