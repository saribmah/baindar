// FTS5 query compilation. Pure functions used by both DocumentDO's
// per-document search and BinderDO's cross-binder search; lives here
// rather than inside either store so neither has to import a peer DO's
// module to get at it.
//
// FTS5 has a strict mini-language (phrases, AND/OR/NOT, prefix `*`,
// column filters). Raw user input shouldn't be passed through —
// punctuation and reserved words break the parser. The helpers below
// split the input into alphanumeric tokens and re-assemble:
//
//   compileFtsQuery   -> exact phrase + OR-of-tokens, prefix-matched
//   compileFtsOrQuery -> simple OR-of-tokens, no prefix (used for snippet
//                        rendering against a known chunk)
//
// Each returns null when the input has no tokens (caller should treat as
// "no hits" instead of issuing a MATCH that errors out).

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

export const tokenizeQuery = (raw: string): string[] => {
  const matches = raw.match(TOKEN_RE);
  if (!matches) return [];
  // Strip duplicates while preserving order so the OR clause stays small.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of matches) {
    const lower = tok.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
};

export const compileFtsQuery = (raw: string): string | null => {
  const tokens = tokenizeQuery(raw);
  if (tokens.length === 0) return null;
  const orPart = tokens.map((t) => `"${t}"*`).join(" OR ");
  if (tokens.length === 1) return orPart;
  // Phrase match earns higher rank than token-OR via FTS5's bm25, so we
  // include both and let bm25 rank phrase-matching rows above token hits.
  const phrase = `"${tokens.join(" ")}"`;
  return `${phrase} OR ${orPart}`;
};

export const compileFtsOrQuery = (terms: string[]): string | null => {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const term of terms) {
    const tokens = tokenizeQuery(term);
    for (const tok of tokens) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      cleaned.push(tok);
    }
  }
  if (cleaned.length === 0) return null;
  return cleaned.map((t) => `"${t}"`).join(" OR ");
};
