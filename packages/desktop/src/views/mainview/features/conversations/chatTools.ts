import type { ChatToolCall, ChatToolKind, ChatToolState } from "@baindar/ui";

export function chatToolFromPart(part: unknown): ChatToolCall | null {
  const record = asRecord(part);
  if (typeof record.type !== "string" || !record.type.startsWith("tool-")) return null;
  const toolName = record.type.slice("tool-".length);
  return {
    id: typeof record.toolCallId === "string" ? record.toolCallId : toolName,
    kind: toolKind(toolName),
    state: toolState(record.state),
    query: toolQuery(record.input),
    error:
      typeof record.errorText === "string" && record.errorText.trim()
        ? truncate(record.errorText.trim(), 96)
        : undefined,
    results: toolResults(record.output),
  };
}

function toolKind(toolName: string): ChatToolKind {
  switch (toolName) {
    case "list_documents":
      return "documents";
    case "search_document":
      return "searchBook";
    case "search_binder":
      return "searchLibrary";
    case "read_section":
      return "lookup";
    case "get_summary":
      return "summarize";
    case "list_notes":
      return "notes";
    case "list_highlights":
      return "highlights";
    case "expand_query":
      return "generic";
    default:
      return "generic";
  }
}

function toolState(state: unknown): ChatToolState {
  if (state === "output-available") return "success";
  if (state === "output-error") return "error";
  if (state === "input-streaming" || state === "input-available") return "running";
  return "pending";
}

function toolQuery(input: unknown): string | undefined {
  const record = asRecord(input);
  const query =
    record.query ??
    record.original_query ??
    record.title ??
    record.document_id ??
    record.documentId ??
    record.section_key ??
    record.sectionKey ??
    record.target_key ??
    record.targetKey ??
    record.id;
  if (typeof query === "string" && query.trim()) return truncate(query.trim(), 72);
  if (Object.keys(record).length > 0) return truncate(JSON.stringify(record), 72);
  return undefined;
}

function toolResults(output: unknown): ChatToolCall["results"] {
  const items = Array.isArray(output) ? output : outputItems(output);
  if (items.length === 0) return undefined;
  return items.slice(0, 3).map((item, index) => {
    const record = asRecord(item);
    const label =
      record.documentTitle ??
      record.sectionTitle ??
      record.title ??
      record.name ??
      record.status ??
      record.page ??
      `Result ${index + 1}`;
    const text =
      record.snippet ??
      record.textSnippet ??
      record.body ??
      record.text ??
      record.preview ??
      record.summary ??
      record.message ??
      JSON.stringify(record);
    return {
      label: typeof label === "string" || typeof label === "number" ? String(label) : undefined,
      text: typeof text === "string" ? truncate(text, 160) : truncate(String(text), 160),
    };
  });
}

function outputItems(output: unknown): unknown[] {
  const record = asRecord(output);
  if (Array.isArray(record.chunks)) return record.chunks;
  if (Array.isArray(record.items)) return record.items;
  if (Object.keys(record).length > 0) return [record];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}
